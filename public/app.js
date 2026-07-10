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
    label.innerHTML = `<input type="checkbox" value="${front.id}"> ${front.label}`;
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
  cancelButton.textContent = 'Cancelar corrida';
  progressSection.classList.remove('hidden');
  progressLog.innerHTML = '';
  runResult.innerHTML = '';
  addLogEntry(`Iniciando validación de ${platform.toUpperCase()} (${environment.toUpperCase()})…`, 'info');

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        handleEvent(JSON.parse(line));
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
  addLogEntry('Solicitando cancelar la corrida…', 'info');
  try {
    await fetch(`/api/run/${currentRunId}/cancel`, { method: 'POST' });
  } catch (err) {
    addLogEntry(`No se pudo cancelar: ${err.message}`, 'failed');
    cancelButton.disabled = false;
    cancelButton.textContent = 'Cancelar corrida';
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
      runResult.innerHTML =
        evt.overallStatus === 'cancelled'
          ? `<a href="${evt.reportUrl}" target="_blank">Ver reporte parcial →</a>`
          : `<a href="${evt.reportUrl}" target="_blank">Ver reporte completo →</a> &nbsp;|&nbsp; <a href="${evt.pdfUrl}" target="_blank">Descargar PDF →</a>`;
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
      historyList.innerHTML = '<p class="history-empty">Todavía no hay corridas registradas.</p>';
      return;
    }

    historyList.innerHTML = runs
      .map((run) => {
        const date = new Date(run.startedAt).toLocaleString();
        const durationSec = Math.round(run.durationMs / 1000);
        const badgeClass = `badge-${run.overallStatus}`;
        const badgeLabel = STATUS_BADGE_LABEL[run.overallStatus] || run.overallStatus;
        return `
          <div class="history-row">
            <span class="history-badge ${badgeClass}">${badgeLabel}</span>
            <span class="history-platform">${run.platform.toUpperCase()} · ${run.environment.toUpperCase()}</span>
            <span class="history-date">${date} (${durationSec}s)</span>
            <span class="history-links">
              <a href="${run.reportUrl}" target="_blank">HTML</a>
              <a href="${run.pdfUrl}" target="_blank">PDF</a>
            </span>
          </div>`;
      })
      .join('');
  } catch (err) {
    historyList.innerHTML = `<p class="history-empty">No se pudo cargar el historial: ${err.message}</p>`;
  }
}

loadFronts();
loadHistory();
