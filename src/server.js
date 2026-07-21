const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { config } = require('./config');
const { runValidation, REGISTRIES, buildRunId, listRuns } = require('./runner');

const app = express();
app.use(express.json());

// --- Security Headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) ---
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// --- CSRF Protection via double-submit cookie pattern ---
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Issue a CSRF token cookie on every page load
app.use((req, res, next) => {
  if (!req.headers.cookie || !req.headers.cookie.includes(CSRF_COOKIE)) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'Strict', path: '/' });
  }
  next();
});

function csrfProtection(req, res, next) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token inválido o ausente' });
  }
  next();
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/reports', express.static(path.join(__dirname, '..', 'reports')));

// Flujos activos, para poder cancelarlos desde /api/run/:runId/cancel. Cerrar el navegador
// interrumpe de inmediato cualquier espera de Playwright en curso, sin necesidad de que cada
// front revise una bandera de cancelacion en cada paso.
const activeRuns = new Map();

app.get('/api/fronts', (req, res) => {
  const { platform } = req.query;
  const registry = REGISTRIES[platform];
  if (!registry) return res.status(400).json({ error: `Plataforma desconocida: ${platform}` });
  res.json(registry.map((f) => ({ id: f.id, label: f.label, dependsOn: f.dependsOn || [] })));
});

app.get('/api/runs', (req, res) => {
  res.json(listRuns());
});

app.post('/api/run/:runId/cancel', csrfProtection, (req, res) => {
  const { runId } = req.params;
  // Validate runId format to prevent BOLA/IDOR (only allow expected pattern)
  if (!/^(pos|admin)-(dev|prod)-\d{4}-\d{2}-\d{2}T[\w-]+$/.test(runId)) {
    return res.status(400).json({ error: 'Formato de runId inválido' });
  }
  const entry = activeRuns.get(runId);
  if (!entry) return res.status(404).json({ error: 'Ese flujo no está activo (ya terminó o no existe)' });
  entry.cancelled = true;
  if (entry.browser) {
    entry.browser.close().catch((err) => {
      console.warn(`No se pudo cerrar el navegador al cancelar ${runId}: ${err.message}`);
    });
  }
  res.json({ ok: true });
});

// Streaming de progreso en vivo via NDJSON sobre una respuesta chunked (mas simple que
// EventSource, que no soporta POST de forma nativa) — el cliente lee el body con fetch + ReadableStream.
app.post('/api/run', csrfProtection, async (req, res) => {
  const { platform, environment, frontIds, confirmVentaProd } = req.body || {};

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (evt) => res.write(`${JSON.stringify(evt)}\n`);

  const runId = buildRunId(platform || 'pos', environment || 'dev');
  const runEntry = { cancelled: false, browser: null };
  activeRuns.set(runId, runEntry);
  send({ type: 'run-id', runId });

  try {
    await runValidation(
      {
        platform,
        environment,
        frontIds,
        confirmVentaProd,
        runId,
        isCancelled: () => runEntry.cancelled,
      },
      send,
      (browser) => {
        runEntry.browser = browser;
      }
    );
  } catch (err) {
    send({ type: 'run-error', message: err.message });
  } finally {
    activeRuns.delete(runId);
    res.end();
  }
});

app.listen(config.port, () => {
  console.log(`QA Automation Suite escuchando en http://localhost:${config.port}`);
});
