const path = require('path');
const express = require('express');
const { config } = require('./config');
const { runValidation, REGISTRIES, buildRunId, listRuns } = require('./runner');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/reports', express.static(path.join(__dirname, '..', 'reports')));

// Corridas activas, para poder cancelarlas desde /api/run/:runId/cancel. Cerrar el navegador
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

app.post('/api/run/:runId/cancel', (req, res) => {
  const entry = activeRuns.get(req.params.runId);
  if (!entry) return res.status(404).json({ error: 'Esa corrida no está activa (ya terminó o no existe)' });
  entry.cancelled = true;
  if (entry.browser) entry.browser.close().catch(() => {});
  res.json({ ok: true });
});

// Streaming de progreso en vivo via NDJSON sobre una respuesta chunked (mas simple que
// EventSource, que no soporta POST de forma nativa) — el cliente lee el body con fetch + ReadableStream.
app.post('/api/run', async (req, res) => {
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
