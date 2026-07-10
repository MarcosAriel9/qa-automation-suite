const fs = require('fs');
const path = require('path');

const STATUS_LABEL = {
  ok: 'OK',
  failed: 'FALLÓ',
  waiting: 'En espera',
  'waiting-manual': 'Acción manual requerida',
  cancelled: 'Cancelado',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function renderStepsTable(frontSteps) {
  const rows = frontSteps
    .map((s) => {
      const img = s.screenshot
        ? `<a href="screenshots/${s.screenshot}" target="_blank"><img class="thumb" src="screenshots/${s.screenshot}" alt=""></a>`
        : '';
      return `
        <tr class="row-${s.status}">
          <td>${new Date(s.ts).toLocaleTimeString()}</td>
          <td><span class="badge badge-${s.status}">${STATUS_LABEL[s.status] || s.status}</span></td>
          <td>${escapeHtml(s.step)}${s.detail ? `<div class="detail">${escapeHtml(s.detail)}</div>` : ''}</td>
          <td>${img}</td>
        </tr>`;
    })
    .join('\n');
  return `<table>
      <thead><tr><th>Hora</th><th>Estado</th><th>Paso</th><th>Evidencia</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Vista para PDF: un bloque por paso con la captura a todo el ancho de la pagina, en vez de
// una miniatura en una celda de tabla, para que la evidencia sea legible al imprimir/exportar.
function renderStepsBlocks(frontSteps) {
  return frontSteps
    .map((s) => {
      const img = s.screenshot ? `<img class="shot-large" src="screenshots/${s.screenshot}" alt="">` : '';
      return `
        <div class="step-block row-${s.status}">
          <div class="step-head">
            <span class="badge badge-${s.status}">${STATUS_LABEL[s.status] || s.status}</span>
            <strong>${escapeHtml(s.step)}</strong>
            <span class="step-time">${new Date(s.ts).toLocaleTimeString()}</span>
          </div>
          ${s.detail ? `<div class="detail">${escapeHtml(s.detail)}</div>` : ''}
          ${img}
        </div>`;
    })
    .join('\n');
}

function buildSummaryRows(results) {
  return results
    .map(
      (r) => `
      <tr class="row-${r.status}">
        <td>${escapeHtml(r.label)}</td>
        <td><span class="badge badge-${r.status}">${STATUS_LABEL[r.status] || r.status}</span></td>
        <td>${formatDuration(r.durationMs)}</td>
        <td>${r.error ? escapeHtml(r.error) : ''}</td>
      </tr>`
    )
    .join('\n');
}

function buildMetaLine(meta) {
  return `Plataforma: <strong>${escapeHtml(meta.platform.toUpperCase())}</strong> ·
    Ambiente: <strong>${escapeHtml(meta.environment.toUpperCase())}</strong> ·
    Fecha: ${new Date(meta.startedAt).toLocaleString()} ·
    Duración: ${formatDuration(meta.durationMs)} ·
    Resultado global: <span class="badge badge-${meta.overallStatus}">${STATUS_LABEL[meta.overallStatus] || meta.overallStatus}</span>`;
}

const SHARED_STYLES = `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 2rem; line-height: 1.4; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge-ok { background: #16a34a; color: #fff; }
  .badge-failed { background: #dc2626; color: #fff; }
  .badge-waiting, .badge-waiting-manual { background: #d97706; color: #fff; }
  .badge-cancelled { background: #6b7280; color: #fff; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  th { font-size: 0.8rem; text-transform: uppercase; color: #888; }
  .detail { font-size: 0.85rem; color: #666; margin-top: 0.2rem; }
  .front-section { margin-bottom: 2rem; }
  .row-failed td { background: rgba(220,38,38,0.06); }
`;

function generateReport({ dir, meta, steps, results }) {
  const frontOrder = [...new Set(steps.map((s) => s.frontId))];

  const sections = frontOrder
    .map((frontId) => {
      const frontSteps = steps.filter((s) => s.frontId === frontId);
      const label = frontSteps[0]?.front || frontId;
      const result = results.find((r) => r.id === frontId);
      const status = result ? result.status : 'failed';
      return `
      <section class="front-section">
        <h2>${escapeHtml(label)} <span class="badge badge-${status}">${STATUS_LABEL[status] || status}</span></h2>
        ${renderStepsTable(frontSteps)}
      </section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte de validación — ${escapeHtml(meta.platform)} (${escapeHtml(meta.environment)})</title>
<style>
  ${SHARED_STYLES}
  body { max-width: 960px; margin-inline: auto; }
  .thumb { max-width: 160px; max-height: 100px; border: 1px solid #ddd; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eee; }
    .meta { color: #aaa; }
    th, td { border-bottom-color: #333; }
    th { color: #999; }
    .detail { color: #aaa; }
    .thumb { border-color: #444; }
  }
</style>
</head>
<body>
  <h1>Reporte de validación funcional</h1>
  <div class="meta">${buildMetaLine(meta)}</div>
  <div class="meta">📄 <a href="report.pdf" target="_blank">Descargar versión en PDF (capturas más grandes)</a></div>

  <section>
    <h2>Resumen</h2>
    <table>
      <thead><tr><th>Front</th><th>Estado</th><th>Duración</th><th>Detalle</th></tr></thead>
      <tbody>${buildSummaryRows(results)}</tbody>
    </table>
  </section>

  ${sections}
</body>
</html>`;

  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf8');
}

function buildPrintHtml({ meta, steps, results }) {
  const frontOrder = [...new Set(steps.map((s) => s.frontId))];

  const sections = frontOrder
    .map((frontId, idx) => {
      const frontSteps = steps.filter((s) => s.frontId === frontId);
      const label = frontSteps[0]?.front || frontId;
      const result = results.find((r) => r.id === frontId);
      const status = result ? result.status : 'failed';
      return `
      <section class="front-section" ${idx > 0 ? 'style="page-break-before: always;"' : ''}>
        <h2>${escapeHtml(label)} <span class="badge badge-${status}">${STATUS_LABEL[status] || status}</span></h2>
        ${renderStepsBlocks(frontSteps)}
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte de validación (PDF) — ${escapeHtml(meta.platform)} (${escapeHtml(meta.environment)})</title>
<style>
  ${SHARED_STYLES}
  .step-block { margin-bottom: 1.5rem; page-break-inside: avoid; }
  .step-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
  .step-time { color: #888; font-size: 0.85rem; margin-left: auto; }
  .shot-large { display: block; width: 100%; max-width: 100%; border: 1px solid #ddd; border-radius: 6px; margin-top: 0.5rem; }
</style>
</head>
<body>
  <h1>Reporte de validación funcional</h1>
  <div class="meta">${buildMetaLine(meta)}</div>

  <section>
    <h2>Resumen</h2>
    <table>
      <thead><tr><th>Front</th><th>Estado</th><th>Duración</th><th>Detalle</th></tr></thead>
      <tbody>${buildSummaryRows(results)}</tbody>
    </table>
  </section>

  ${sections}
</body>
</html>`;
}

/**
 * Genera la version en PDF del reporte con capturas grandes (a todo el ancho de la pagina)
 * en vez de las miniaturas del HTML normal. Reutiliza Chromium via Playwright (ya es
 * dependencia del proyecto) en vez de agregar una libreria de PDF aparte.
 */
async function generatePdfReport({ dir, meta, steps, results }) {
  const printHtmlPath = path.join(dir, 'report-print.html');
  fs.writeFileSync(printHtmlPath, buildPrintHtml({ meta, steps, results }), 'utf8');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${printHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    await page.pdf({
      path: path.join(dir, 'report.pdf'),
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await browser.close();
  }
}

module.exports = { generateReport, generatePdfReport };
