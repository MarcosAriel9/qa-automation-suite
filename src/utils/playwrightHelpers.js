const fs = require('fs');
const path = require('path');

/**
 * Crea una funcion de captura de pantalla ligada a una carpeta de flujo.
 * Cada llamada numera el archivo en orden (01-, 02-, ...) para que el reporte
 * quede ordenado cronologicamente sin depender del reloj.
 */
function createScreenshotter(screenshotsDir) {
  let counter = 0;
  return async function shot(page, name) {
    counter += 1;
    const fileName = `${String(counter).padStart(2, '0')}-${name.replace(/[^a-z0-9-_]/gi, '_')}.png`;
    await page.screenshot({ path: path.join(screenshotsDir, fileName), fullPage: true });
    return fileName;
  };
}

/**
 * Guarda el QR de cobro como archivo PNG real (no solo una captura de pantalla completa),
 * leyendo el base64 embebido en el propio <img>. En Dev el QR no se puede escanear apuntando
 * la camara de la app bancaria productiva directo a la pantalla; tener el PNG en disco
 * permite transferirlo/abrirlo para escanearlo de otra forma.
 */
async function saveQrPng(page, imgSelector, destPath) {
  const src = await page.locator(imgSelector).getAttribute('src');
  if (!src || !src.startsWith('data:image')) {
    throw new Error('El QR no tiene una imagen base64 válida para guardar como PNG');
  }
  const base64 = src.split(',')[1];
  fs.writeFileSync(destPath, Buffer.from(base64, 'base64'));
}

/**
 * Espera a que aparezca cualquiera de los textos dados (usado tanto para saber que una
 * cotizacion termino de generarse como para saber si un cobro de Venta fue exitoso o fallo).
 * Devuelve el texto que efectivamente aparecio.
 */
async function waitForAnyText(page, texts, timeoutMs) {
  return Promise.any(
    texts.map(
      (text) =>
        new Promise((resolve, reject) => {
          page
            .getByText(text, { exact: false })
            .first()
            .waitFor({ state: 'visible', timeout: timeoutMs })
            .then(() => resolve(text))
            .catch(reject);
        })
    )
  ).catch(() => {
    throw new Error(`Ninguno de los textos esperados aparecio en ${timeoutMs}ms: ${texts.join(' | ')}`);
  });
}

/**
 * El teclado numerico de Venta es un grid de botones en pantalla (1-9, 0), no un <input> de
 * texto: enviar pulsaciones de teclado (page.keyboard.press) requiere que el foco ya este
 * puesto en el componente correcto, lo cual no siempre pasa (ej. si no hubo que expandir la
 * calculadora primero, nunca se hizo click ahi). Es mas confiable clicar cada boton de digito
 * directamente en pantalla, como haria una persona.
 */
async function clickDigitButtons(page, text) {
  for (const char of String(text)) {
    if (char === '.') continue;
    await page.getByRole('button', { name: char, exact: true }).click();
    await page.waitForTimeout(80);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * La mayoria de los modulos de Admin comparten el mismo overlay de carga de pantalla completa
 * (components/loading/index.js -> core/Spinner.js, clase .baz-co-chase); otros (promociones,
 * confagentes) usan placeholders "shimmer" con clase .shimmer-loading en su lugar. Se espera
 * (best-effort) a que cualquiera de los dos, si aparece, tambien desaparezca antes de operar
 * sobre la pantalla, para no interactuar con datos que todavia no terminaron de cargar.
 */
async function waitForModuleContentReady(page, timeout) {
  const spinner = page.locator('.baz-co-chase');
  const spinnerAppeared = await spinner
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (spinnerAppeared) {
    await spinner.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  const shimmer = page.locator('.shimmer-loading').first();
  const shimmerAppeared = await shimmer
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (shimmerAppeared) {
    await shimmer.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});

  // Margen extra: varias pantallas (dashboards con graficas, listas con animaciones de
  // entrada) terminan de pintar unos segundos despues de que la red ya quedo inactiva.
  await page.waitForTimeout(4000);
}

/**
 * Limpia localStorage/sessionStorage/cookies de la pagina actual. Uso deliberadamente NO
 * automatico en los reintentos: borra tambien el token de sesion real si ya habia uno, asi
 * que solo debe llamarse explicitamente cuando de verdad se quiere partir de cero (ej. antes
 * del primer intento de login de una corrida), nunca como parte de un reintento generico.
 */
async function clearBrowserState(page) {
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch (e) {
        console.warn('No se pudo limpiar localStorage:', e.message);
      }
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('No se pudo limpiar sessionStorage:', e.message);
      }
    })
    .catch((err) => { console.warn('clearBrowserState evaluate failed:', err.message); });
  await page.context().clearCookies().catch((err) => { console.warn('clearCookies failed:', err.message); });
}

/**
 * Recarga la pagina para reintentar el login (equivalente a F5, no a Ctrl+Shift+R). Se probaron
 * dos variantes mas agresivas y ambas dejaron la pantalla en blanco: bypass de cache via CDP
 * (`Page.reload({ ignoreCache: true })`) y limpiar localStorage/cookies antes de recargar — esto
 * ultimo ademas borraba la sesion real cuando ya habia una activa, forzando un logout no deseado
 * cada vez que se ayudaba a recargar. Un reload simple, sin tocar cache ni storage, es lo unico
 * que no rompe el runtime de Module Federation de esta app.
 */
async function hardReload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * El primer render del login puede tardar (el shell carga el remoteEntry.js de la MFE de
 * autenticacion via Module Federation) o, alguna vez, quedarse mostrando solo el carrusel
 * promocional sin montar el formulario. Se intenta llenar los campos dos veces en la MISMA
 * pantalla (sin recargar, por si solo fue una demora puntual) antes de escalar a un hard
 * reload (Ctrl+Shift+R, bypass de cache) y repetir el ciclo — recargar toda la pagina es lo
 * mas lento/costoso, asi que solo se hace si dos intentos directos ya fallaron.
 *
 * El campo puede quedar "visible" en el DOM (pasa el chequeo de Playwright) antes de que el
 * framework termine de montar sus manejadores/estado controlado; si se escribe demasiado
 * rapido, fill() no marca error pero el valor no queda realmente capturado. Por eso se espera
 * un margen corto tras la visibilidad y, sobre todo, se VERIFICA leyendo el valor de vuelta
 * antes de dar el intento por bueno — no basta con que fill() no haya lanzado una excepcion.
 */
async function fillLoginForm(
  page,
  { userSelector, passwordSelector, user, password, pageAttempts = 2, fillAttemptsPerPage = 2, waitTimeout = 20000 }
) {
  let lastError;
  const totalAttempts = pageAttempts * fillAttemptsPerPage;
  let attemptNumber = 0;

  for (let pageAttempt = 1; pageAttempt <= pageAttempts; pageAttempt += 1) {
    if (pageAttempt > 1) {
      await hardReload(page);
    }

    for (let fillAttempt = 1; fillAttempt <= fillAttemptsPerPage; fillAttempt += 1) {
      attemptNumber += 1;
      // Solo el ultimo intento en general espera el timeout completo; los anteriores fallan
      // rapido para no gastar 2x el timeout completo antes de siquiera recargar la pagina.
      const isLastOverallAttempt = attemptNumber === totalAttempts;
      const thisWait = isLastOverallAttempt ? waitTimeout : Math.min(8000, waitTimeout);
      try {
        const userField = page.locator(userSelector).first();
        await userField.waitFor({ state: 'visible', timeout: thisWait });
        await page.waitForTimeout(400);
        await userField.fill(user);

        const passwordField = page.locator(passwordSelector).first();
        await passwordField.waitFor({ state: 'visible', timeout: thisWait });
        await passwordField.fill(password);

        const [userValue, passwordValue] = await Promise.all([
          userField.inputValue().catch(() => ''),
          passwordField.inputValue().catch(() => ''),
        ]);
        if (userValue !== user || passwordValue !== password) {
          throw new Error('Los campos de usuario/contraseña no retuvieron el valor capturado (se escribió demasiado rápido)');
        }
        return;
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw new Error(
    `No se pudo capturar usuario/contraseña tras ${pageAttempts} recarga(s) de ${fillAttemptsPerPage} intento(s) cada una (la pantalla de login no cargó a tiempo): ${lastError.message}`
  );
}

/**
 * Click de "Ingresar" y espera a la navegacion, resolviendo primero cualquier alerta de
 * SweetAlert2 que se interponga. Dos casos observados en produccion:
 *  - Alerta de error real (credenciales invalidas, etc.): se falla de inmediato con el
 *    texto de la alerta en vez de agotar el timeout completo sin motivo.
 *  - "Sesion Duplicada": la propia app reintenta el envio internamente al confirmar, pero
 *    en ese reintento a veces limpia los campos y la validacion nativa del navegador
 *    bloquea el submit (input vacio) sin que nada mas vuelva a intentarlo. Si se detecta
 *    ese caso, se vuelven a llenar los campos y se reenvia manualmente.
 */
async function submitLoginAndWait(
  page,
  { submitLocator, userSelector, passwordSelector, user, password, successUrlPattern, timeout }
) {
  await submitLocator.click();

  const popup = page.locator('.swal2-popup');
  const raceResult = await Promise.race([
    popup
      .waitFor({ state: 'visible', timeout })
      .then(() => 'popup')
      .catch(() => 'timeout'),
    page
      .waitForURL(successUrlPattern, { timeout })
      .then(() => 'navigated')
      .catch(() => 'timeout'),
  ]);

  if (raceResult === 'navigated') return;

  if (raceResult === 'popup') {
    const title = (await page.locator('.swal2-title').innerText().catch(() => '')) || 'alerta sin título';
    const isDuplicateSession = /sesi[oó]n duplicada/i.test(title);
    await page.locator('.swal2-confirm').click();
    await popup.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    if (!isDuplicateSession) {
      throw new Error(`El login fue rechazado por la aplicación: "${title}"`);
    }

    await page.waitForTimeout(1000);
    const userValue = await page.locator(userSelector).first().inputValue().catch(() => '');
    if (!userValue) {
      await fillLoginForm(page, { userSelector, passwordSelector, user, password, pageAttempts: 1, waitTimeout: 5000 });
      await submitLocator.click();
    }

    await page.waitForURL(successUrlPattern, { timeout });
    return;
  }

  throw new Error('No hubo navegación ni alerta tras enviar el login (tiempo de espera agotado)');
}

/**
 * Espera a que se resuelva UNA de varias condiciones "visible" en paralelo (ej. el texto de
 * "sin información por mostrar" vs. la primera fila real de una tabla). Reemplaza el patrón
 * `isVisible().catch(() => false)`, que no espera nada: es un chequeo instantáneo que casi
 * siempre da "no visible" si el backend todavía no respondió, y entonces el código sigue de
 * largo a esperar un contenido que nunca llega. Devuelve la clave que ganó la carrera, o
 * 'timeout' si ninguna apareció a tiempo.
 */
async function raceForVisible(locatorsByKey, timeout) {
  const keys = Object.keys(locatorsByKey);
  try {
    return await Promise.any(keys.map((key) => locatorsByKey[key].waitFor({ state: 'visible', timeout }).then(() => key)));
  } catch (err) {
    console.warn(`raceForVisible: ningún locator visible en ${timeout}ms (${err.message})`);
    return 'timeout';
  }
}

/**
 * El sidebar de Admin tiene un estado colapsado (solo iconos, className con "tw-w-20") y uno
 * expandido (con texto y submenus, "tw-w-60"): los submenus y algunos enlaces sin testid solo
 * son operables/visibles con el sidebar expandido. Se expande con el boton
 * "btn-open-sidebar" si hace falta.
 */
async function ensureSidebarOpen(page, timeout) {
  const sidebar = page.locator('#sidebar');
  const isOpen = await sidebar
    .evaluate((el) => el.className.includes('tw-w-60'))
    .catch(() => false);
  if (!isOpen) {
    await page.locator('[data-testid="btn-open-sidebar"]').click();
    // El cambio de ancho anima con transicion (duration-500); se espera a que termine.
    await page.waitForTimeout(600);
  }
}

/**
 * "Agentes" en el sidebar de Admin es un submenu colapsado (`submenu: true` en menuItems.js),
 * no un link directo: hay que expandir el sidebar y luego el submenu (clic en su icono, no
 * tiene data-testid propio); sus hijos ("Administración" -> /comerciosdetalles,
 * "Configuración" -> /config-agentes) tampoco tienen data-testid — se ubican por su href
 * real, ya que react-router los renderiza como <a href="...">.
 */
async function openAgentesSubmenu(page, href, timeout) {
  await ensureSidebarOpen(page, timeout);

  const subLink = page.locator(`a[href="${href}"]`);
  if (await subLink.isVisible().catch(() => false)) {
    await subLink.click();
    return;
  }
  await page.locator('[data-testid="bs-basket-icon"]').click();
  await subLink.waitFor({ state: 'visible', timeout });
  await subLink.click();
}

/**
 * "Plataforma" (sub-shell contenedor-plataforma, generacion nueva con React Router v7 + MUI)
 * se entra desde el link normal del sidebar (tiene url propia, no requiere expandir nada) y
 * muestra un menu de tarjetas ("flip cards") sin data-testid, identificadas solo por su texto
 * visible ("Cotizador", "Dar de alta Productos", "Asignar Precios", etc.). Cada tarjeta
 * renderiza su titulo DOS veces en el DOM (cara frontal y trasera de la animacion de volteo),
 * por lo que hay que usar .first() o Playwright falla en modo estricto (2 elementos).
 */
async function enterPlataformaModule(page, cardTitle, timeout) {
  await page.locator('[data-testid="/plataforma-test"]').click();
  const card = page.getByText(cardTitle, { exact: true }).first();
  await card.waitFor({ state: 'visible', timeout });
  await card.click();
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page.waitForTimeout(2000);
}

/**
 * Los selects de MUI en los modulos de Plataforma (Productos/Precios/Compensaciones) no son
 * <select> nativos: al hacer click abren un Menu/Popover con <li role="option">. El
 * data-testid que los devs agregaron cae sobre el <input> nativo OCULTO (aria-hidden,
 * solo para semantica de formulario) que MUI renderiza junto al selector real; el elemento
 * clickeable de verdad es su hermano <div role="combobox">, que es justo el que Playwright
 * reporta como "intercepts pointer events" si se intenta clicar el input directamente. Se
 * sube al padre inmediato y se busca ese combobox visible antes de clicar.
 */
async function selectFirstMuiOption(page, triggerSelector, timeout) {
  const hiddenInput = page.locator(triggerSelector);
  const visibleCombobox = hiddenInput.locator('xpath=../div[@role="combobox"]');
  const clickTarget = (await visibleCombobox.count().catch(() => 0)) > 0 ? visibleCombobox.first() : hiddenInput;
  await clickTarget.click();
  const options = page.locator('li[role="option"]');
  const opened = await options
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) return false;

  const count = await options.count();
  const index = count > 1 ? 1 : 0;
  await options.nth(index).click();
  return true;
}

/**
 * El shell de POS (containerpos-dev) no aisla con un error boundary por modulo: si un remote
 * de Module Federation falla al cargar (ej. un chunk faltante en el CDN tras un deploy), toda
 * la app se cae mostrando esta pantalla generica y deja de responder hasta recargar. Detectarla
 * da un mensaje de error real (con el detalle del chunk/URL que fallo) en vez de un timeout
 * generico de Playwright que no explica la causa real.
 */
async function assertAppNotCrashed(page) {
  const crash = page.getByText('Unexpected Application Error', { exact: false });
  if (await crash.isVisible().catch(() => false)) {
    const detail = await page.locator('body').innerText().catch(() => '');
    throw new Error(
      `La aplicación mostró un error de carga (posible chunk/remote faltante tras un deploy): ${detail.slice(0, 400).trim()}`
    );
  }
}

module.exports = {
  createScreenshotter,
  saveQrPng,
  waitForAnyText,
  clickDigitButtons,
  ensureDir,
  hardReload,
  clearBrowserState,
  fillLoginForm,
  submitLoginAndWait,
  waitForModuleContentReady,
  raceForVisible,
  assertAppNotCrashed,
  openAgentesSubmenu,
  ensureSidebarOpen,
  enterPlataformaModule,
  selectFirstMuiOption,
};
