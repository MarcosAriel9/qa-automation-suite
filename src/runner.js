const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config, getPlatformConfig, getBaseUrl, checkRequiredEnv } = require('./config');
const { createScreenshotter, ensureDir } = require('./utils/playwrightHelpers');
const { generateReport, generatePdfReport } = require('./report');

const REGISTRIES = {
  pos: require('./platforms/pos'),
  admin: require('./platforms/admin'),
};

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function resolveOrder(frontIds, registry) {
  const byId = Object.fromEntries(registry.map((f) => [f.id, f]));
  const visited = new Set();
  const order = [];

  function visit(id) {
    if (visited.has(id)) return;
    const front = byId[id];
    if (!front) throw new Error(`Front desconocido: ${id}`);
    (front.dependsOn || []).forEach(visit);
    visited.add(id);
    order.push(front);
  }

  frontIds.forEach(visit);
  return order;
}

function buildRunId(platform, environment) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${platform}-${environment}-${stamp}`;
}

const HOME_PATH = { pos: '/inicio', admin: '/' };

// Link del sidebar que navega a Inicio via el router de React (SPA), sin recargar el
// navegador. Solo se conoce para POS por ahora; Admin cae siempre al fallback de abajo.
const HOME_LINK_SELECTOR = { pos: '[data-testid="link-test-Inicio"]' };
const HOME_URL_PATTERN = { pos: /\/inicio/, admin: /\/$/ };

async function isAppCrashed(page) {
  return page
    .getByText('Unexpected Application Error', { exact: false })
    .isVisible()
    .catch(() => false);
}

/**
 * Vuelve a Inicio entre reintentos de un front. Se prefiere un click en el link del sidebar
 * (navegacion SPA de React Router) sobre `page.goto`/reload: este ultimo fuerza al shell a
 * reinicializar TODOS los remotes de Module Federation desde cero, lo cual a veces se queda en
 * pantalla en blanco (el mismo problema que un F5 real del usuario, reportado en /inicio de
 * POS). El click en el link solo cambia la ruta dentro de la app ya cargada, sin ese riesgo.
 * Si el link ya no esta disponible (p. ej. la app realmente se cayo), se usa `page.goto` como
 * ultimo recurso.
 */
async function goHome(page, platform, baseUrl) {
  const selector = HOME_LINK_SELECTOR[platform];
  if (selector) {
    const clicked = await page
      .locator(selector)
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      await page.waitForURL(HOME_URL_PATTERN[platform], { timeout: 5000 }).catch(() => {});
      return;
    }
  }
  await page.goto(`${baseUrl}${HOME_PATH[platform]}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

/**
 * Corre la validacion funcional completa para una plataforma/ambiente/lista de fronts.
 * `onEvent(evt)` recibe eventos en vivo (para transmitirlos por SSE); el reporte final en
 * disco se arma de manera independiente a partir del log acumulado, por si el cliente se
 * desconecta a medio proceso. `runId` se recibe ya calculado (en vez de generarse aqui) para
 * que quien llama (server.js) pueda registrar el flujo como cancelable antes de que arranque
 * el navegador. `isCancelled`/`onBrowserReady` habilitan la cancelacion desde afuera: cerrar el
 * navegador interrumpe de inmediato cualquier espera de Playwright en curso.
 */
async function runValidation(
  { platform, environment, frontIds, confirmVentaProd, runId, isCancelled = () => false },
  onEvent = () => {},
  onBrowserReady = () => {}
) {
  const registry = REGISTRIES[platform];
  if (!registry) throw new Error(`Plataforma desconocida: ${platform}`);
  if (!['dev', 'prod'].includes(environment)) throw new Error(`Ambiente desconocido: ${environment}`);
  if (!Array.isArray(frontIds) || frontIds.length === 0) throw new Error('Debes seleccionar al menos un front a validar');

  const order = resolveOrder(frontIds, registry);

  // El front "Venta" genera un cobro real; en Produccion se exige confirmacion explicita.
  if (platform === 'pos' && environment === 'prod' && order.some((f) => f.id === 'venta') && !confirmVentaProd) {
    throw new Error('Falta confirmar el riesgo de cobro real para correr Venta en Producción');
  }

  const missingEnv = checkRequiredEnv(order.map((f) => f.requiredEnvKey).filter(Boolean), platform, environment);
  if (missingEnv.length > 0) {
    throw new Error(`Faltan variables de entorno en .env.${environment}: ${missingEnv.join(', ')}`);
  }

  const baseUrl = getBaseUrl(platform, environment);
  const cfg = getPlatformConfig(platform, environment);

  const runDir = path.join(REPORTS_DIR, runId);
  const screenshotsDir = path.join(runDir, 'screenshots');
  ensureDir(screenshotsDir);

  const timeouts = {
    default: config.defaultTimeoutMs,
    qrWait: config.qrWaitTimeoutMs,
    cotizacionWait: config.cotizacionWaitTimeoutMs,
  };

  const steps = [];
  const shot = createScreenshotter(screenshotsDir);
  const emit = (evt) => onEvent(evt);

  const startedAt = Date.now();
  emit({ type: 'run-start', runId, platform, environment, fronts: order.map((f) => ({ id: f.id, label: f.label })) });

  // Viewport fijo de escritorio: con `viewport: null` + `--start-maximized` el ancho real
  // depende de una condicion de carrera del gestor de ventanas del SO, y a veces cae en el
  // rango "tablet" de los breakpoints de Tailwind, ocultando por CSS elementos del layout de
  // escritorio (ej. el sidebar de POS) aunque existan en el DOM. Con un tamaño fijo grande se
  // garantiza siempre el layout de escritorio y la ventana sigue siendo visible para el QR.
  const browser = await chromium.launch({ headless: config.headless, args: ['--start-maximized'] });
  onBrowserReady(browser);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = [];
  let overallStatus = 'ok';
  let wasCancelled = false;

  for (const front of order) {
    if (isCancelled()) {
      wasCancelled = true;
      break;
    }

    const frontStart = Date.now();
    emit({ type: 'front-start', frontId: front.id, label: front.label });

    const log = async (step, status, detail = null, screenshotFile = null) => {
      const entry = { front: front.label, frontId: front.id, step, status, detail, screenshot: screenshotFile, ts: Date.now() };
      steps.push(entry);
      emit({ type: 'log', entry });
    };

    const ctx = { page, baseUrl, cfg, timeouts, environment, screenshotsDir, shot: (name) => shot(page, name), log };

    // Varios intentos por front: un elemento que tarda en cargar (remote de Module Federation,
    // API lenta) no deberia tumbar el front a la primera. Entre intentos se vuelve al inicio
    // para partir de un estado limpio y conocido. Excepcion: fronts con efectos reales tipo
    // "Venta" (cobro real) declaran `maxAttempts: 1` para no reintentar el flujo completo y
    // arriesgarse a generar un segundo QR/cobro; ya manejan sus propios reintentos internos
    // en los pasos previos a la accion irreversible.
    const maxAttempts = front.maxAttempts || 2;
    let lastError = null;
    let succeeded = false;

    for (let attempt = 1; attempt <= maxAttempts && !succeeded && !isCancelled(); attempt += 1) {
      if (attempt > 1) {
        // OJO: aqui NO se limpia localStorage/cookies (a diferencia del reintento interno del
        // propio front de Login) porque este reintento generico corre para CUALQUIER front, la
        // mayoria ya autenticados; borrar el storage cerraria la sesion real y el reintento
        // fallaria siempre por falta de sesion, no por la causa original del fallo.
        await goHome(page, platform, baseUrl);
      }
      try {
        await front.run(ctx);
        succeeded = true;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts && !isCancelled()) {
          const retryShot = await shot(page, `${front.id}-intento-${attempt}-fallido`).catch(() => null);
          const entry = {
            front: front.label,
            frontId: front.id,
            step: `Intento ${attempt} falló, reintentando…`,
            status: 'waiting',
            detail: err.message,
            screenshot: retryShot,
            ts: Date.now(),
          };
          steps.push(entry);
          emit({ type: 'log', entry });
        }
      }
    }

    if (isCancelled() && !succeeded) {
      wasCancelled = true;
      results.push({ id: front.id, label: front.label, status: 'cancelled', durationMs: Date.now() - frontStart });
      emit({ type: 'front-done', frontId: front.id, status: 'cancelled' });
      break;
    }

    if (succeeded) {
      results.push({ id: front.id, label: front.label, status: 'ok', durationMs: Date.now() - frontStart });
      emit({ type: 'front-done', frontId: front.id, status: 'ok' });
    } else {
      let errorShot = null;
      try {
        errorShot = await shot(page, `${front.id}-error`);
      } catch {
        /* la pagina pudo haber quedado en un estado no capturable, se ignora */
      }
      steps.push({
        front: front.label,
        frontId: front.id,
        step: 'Error',
        status: 'failed',
        detail: lastError.message,
        screenshot: errorShot,
        ts: Date.now(),
      });
      emit({ type: 'front-done', frontId: front.id, status: 'failed', detail: lastError.message });
      results.push({
        id: front.id,
        label: front.label,
        status: 'failed',
        durationMs: Date.now() - frontStart,
        error: lastError.message,
      });
      overallStatus = 'failed';
      // No se detiene el flujo: se continua con el siguiente front aunque uno falle tras
      // agotar los intentos, para tener evidencia completa de todos los fronts en un reporte.
    }

    // El shell no aisla con un error boundary por modulo: si un remote de Module Federation
    // se cae (ej. chunk faltante tras un deploy), toda la app deja de responder y arrastraria
    // el resto de los fronts. Se detecta y se recarga de vuelta al inicio antes de continuar.
    if (await isAppCrashed(page).catch(() => false)) {
      await page.goto(`${baseUrl}${HOME_PATH[platform]}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  try {
    await browser.close();
  } catch {
    /* puede que ya se haya cerrado externamente (cancelacion) */
  }

  if (wasCancelled) overallStatus = 'cancelled';

  const finishedAt = Date.now();
  const reportUrl = `/reports/${runId}/report.html`;
  const pdfUrl = `/reports/${runId}/report.pdf`;
  const meta = {
    runId,
    platform,
    environment,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    overallStatus,
    reportUrl,
    pdfUrl,
  };
  generateReport({ dir: runDir, meta, steps, results });
  fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  if (!wasCancelled) {
    emit({ type: 'log', entry: { front: '', step: 'Generando reporte en PDF…', status: 'waiting', ts: Date.now() } });
    await generatePdfReport({ dir: runDir, meta, steps, results }).catch((err) => {
      emit({ type: 'log', entry: { front: '', step: `No se pudo generar el PDF: ${err.message}`, status: 'failed', ts: Date.now() } });
    });
  }

  emit({ type: 'run-done', runId, overallStatus, reportUrl, pdfUrl });

  return { runId, overallStatus, reportUrl, pdfUrl };
}

function listRuns() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = path.join(REPORTS_DIR, entry.name, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.startedAt - a.startedAt);
}

module.exports = { runValidation, REGISTRIES, buildRunId, listRuns };
