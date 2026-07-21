const form = document.getElementById('run-form');
const frontsList = document.getElementById('fronts-list');
const prodVentaWarning = document.getElementById('prod-venta-warning');
const confirmVentaProdCheckbox = document.getElementById('confirm-venta-prod');
const startButton = document.getElementById('start-button');
const cancelButton = document.getElementById('cancel-button');
const progressSection = document.getElementById('progress');
const progressLog = document.getElementById('progress-log');
const runResult = document.getElementById('run-result');
const historyList = document.getElementById('history-list');

let frontsMeta = [];
let currentRunId = null;

// --- Sanitization helper to prevent DOM XSS ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// --- CSRF token helper ---
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : '';
}

function getPlatform() {
  return form.querySelector('input[name="platform"]:checked').value;
}

function getEnvironment() {
  return form.querySelector('input[name="environment"]:checked').value;
}

function getCheckedFrontIds() {
  return [...frontsList.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
}

function computeRequiredIds(checkedIds) {
  const byId = Object.fromEntries(frontsMeta.map((f) => [f.id, f]));
  const required = new Set();
  function visit(id) {
    const front = byId[id];
    if (!front) return;
    (front.dependsOn || []).forEach((dep) => {
      required.add(dep);
      visit(dep);
    });
  }
  checkedIds.forEach(visit);
  return required;
}

function recomputeDependencies() {
  const checked = getCheckedFrontIds();
  const required = computeRequiredIds(checked);
  frontsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (required.has(cb.value)) {
      cb.checked = true;
      cb.disabled = true;
    } else {
      cb.disabled = false;
    }
  });
  updateProdVentaWarning();
}

function updateProdVentaWarning() {
  const isPosVenta = getPlatform() === 'pos' && getCheckedFrontIds().includes('venta');
  const isProd = getEnvironment() === 'prod';
  const show = isPosVenta && isProd;
  prodVentaWarning.classList.toggle('hidden', !show);
  if (!show) confirmVentaProdCheckbox.checked = false;
}

async function loadFronts() {
  const platform = getPlatform();
  const res = await fetch(`/api/fronts?platform=${platform}`);
  frontsMeta = await res.json();

  frontsList.innerHTML = '';
  frontsMeta.forEach((front) => {
    const label = document.createElement('label');
    label.className = 'front-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = front.id;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${front.label}`));
    frontsList.appendChild(label);
  });

  recomputeDependencies();
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'platform') {
    loadFronts();
    return;
  }
  recomputeDependencies();
});

function addLogEntry(text, status) {
  const li = document.createElement('li');
  li.className = `log-${status || 'info'}`;
  li.textContent = text;
  progressLog.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const platform = getPlatform();
  const environment = getEnvironment();
  const frontIds = getCheckedFrontIds();

  if (frontIds.length === 0) {
    alert('Selecciona al menos un front a validar.');
    return;
  }
  if (!prodVentaWarning.classList.contains('hidden') && !confirmVentaProdCheckbox.checked) {
    alert('Debes confirmar que entiendes el riesgo de cobro real en Producción.');
    return;
  }

  startButton.disabled = true;
  currentRunId = null;
  cancelButton.classList.remove('hidden');
  cancelButton.disabled = false;
  cancelButton.textContent = 'Cancelar flujo';
  progressSection.classList.remove('hidden');
  progressLog.innerHTML = '';
  runResult.innerHTML = '';
  addLogEntry(`Iniciando validación de ${platform.toUpperCase()} (${environment.toUpperCase()})…`, 'info');

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify({ platform, environment, frontIds, confirmVentaProd: confirmVentaProdCheckbox.checked }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch (parseErr) {
          console.warn('No se pudo parsear evento NDJSON:', parseErr.message);
        }
      }
    }
  } catch (err) {
    addLogEntry(`Error de conexión: ${err.message}`, 'failed');
  } finally {
    startButton.disabled = false;
    cancelButton.classList.add('hidden');
    currentRunId = null;
    loadHistory();
  }
});

cancelButton.addEventListener('click', async () => {
  if (!currentRunId) return;
  cancelButton.disabled = true;
  cancelButton.textContent = 'Cancelando…';
  addLogEntry('Solicitando cancelar el flujo…', 'info');
  try {
    await fetch(`/api/run/${currentRunId}/cancel`, { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() } });
  } catch (err) {
    addLogEntry(`No se pudo cancelar: ${err.message}`, 'failed');
    cancelButton.disabled = false;
    cancelButton.textContent = 'Cancelar flujo';
  }
});

function handleEvent(evt) {
  switch (evt.type) {
    case 'run-id':
      currentRunId = evt.runId;
      break;
    case 'run-start':
      addLogEntry(`Fronts a correr: ${evt.fronts.map((f) => f.label).join(', ')}`, 'info');
      break;
    case 'front-start':
      addLogEntry(`▶ ${evt.label}`, 'info');
      break;
    case 'log':
      addLogEntry(`  ${statusIcon(evt.entry.status)} ${evt.entry.step}${evt.entry.detail ? ` — ${evt.entry.detail}` : ''}`, evt.entry.status);
      break;
    case 'front-done':
      addLogEntry(
        evt.status === 'ok' ? '✔ Front completado' : evt.status === 'cancelled' ? '⏹ Front cancelado' : `✘ Front falló: ${evt.detail || ''}`,
        evt.status
      );
      break;
    case 'run-done':
      addLogEntry(RUN_DONE_MESSAGE[evt.overallStatus] || 'Validación finalizada.', evt.overallStatus);
      runResult.innerHTML = '';
      if (evt.overallStatus === 'cancelled') {
        const link = document.createElement('a');
        link.href = evt.reportUrl;
        link.target = '_blank';
        link.textContent = 'Ver reporte parcial →';
        runResult.appendChild(link);
      } else {
        const linkReport = document.createElement('a');
        linkReport.href = evt.reportUrl;
        linkReport.target = '_blank';
        linkReport.textContent = 'Ver reporte completo →';
        runResult.appendChild(linkReport);
        runResult.appendChild(document.createTextNode(' \u00a0|\u00a0 '));
        const linkPdf = document.createElement('a');
        linkPdf.href = evt.pdfUrl;
        linkPdf.target = '_blank';
        linkPdf.textContent = 'Descargar PDF →';
        runResult.appendChild(linkPdf);
      }
      break;
    case 'run-error':
      addLogEntry(`Error: ${evt.message}`, 'failed');
      break;
    default:
      break;
  }
}

const RUN_DONE_MESSAGE = {
  ok: 'Validación completada correctamente.',
  failed: 'Validación finalizada con errores.',
  cancelled: 'Validación cancelada por el usuario.',
};

function statusIcon(status) {
  if (status === 'ok') return '✔';
  if (status === 'failed') return '✘';
  if (status === 'cancelled') return '⏹';
  if (status === 'waiting' || status === 'waiting-manual') return '⏳';
  return '•';
}

const STATUS_BADGE_LABEL = {
  ok: 'OK',
  failed: 'FALLÓ',
  cancelled: 'CANCELADO',
};

async function loadHistory() {
  try {
    const res = await fetch('/api/runs');
    const runs = await res.json();

    if (runs.length === 0) {
      historyList.textContent = '';
      const p = document.createElement('p');
      p.className = 'history-empty';
      p.textContent = 'Todavía no hay flujos registrados.';
      historyList.appendChild(p);
      return;
    }

    historyList.textContent = '';
    runs.forEach((run) => {
      const date = new Date(run.startedAt).toLocaleString();
      const durationSec = Math.round(run.durationMs / 1000);
      const badgeClass = `badge-${run.overallStatus}`;
      const badgeLabel = STATUS_BADGE_LABEL[run.overallStatus] || run.overallStatus;

      const row = document.createElement('div');
      row.className = 'history-row';

      const badge = document.createElement('span');
      badge.className = `history-badge ${badgeClass}`;
      badge.textContent = badgeLabel;

      const platformSpan = document.createElement('span');
      platformSpan.className = 'history-platform';
      platformSpan.textContent = `${run.platform.toUpperCase()} · ${run.environment.toUpperCase()}`;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = `${date} (${durationSec}s)`;

      const linksSpan = document.createElement('span');
      linksSpan.className = 'history-links';
      const htmlLink = document.createElement('a');
      htmlLink.href = run.reportUrl;
      htmlLink.target = '_blank';
      htmlLink.textContent = 'HTML';
      const pdfLink = document.createElement('a');
      pdfLink.href = run.pdfUrl;
      pdfLink.target = '_blank';
      pdfLink.textContent = 'PDF';
      linksSpan.appendChild(htmlLink);
      linksSpan.appendChild(document.createTextNode(' '));
      linksSpan.appendChild(pdfLink);

      row.appendChild(badge);
      row.appendChild(platformSpan);
      row.appendChild(dateSpan);
      row.appendChild(linksSpan);
      historyList.appendChild(row);
    });
  } catch (err) {
    historyList.textContent = '';
    const p = document.createElement('p');
    p.className = 'history-empty';
    p.textContent = `No se pudo cargar el historial: ${err.message}`;
    historyList.appendChild(p);
  }
}

loadFronts();
loadHistory();
