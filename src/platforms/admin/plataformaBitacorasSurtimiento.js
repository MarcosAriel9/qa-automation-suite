const { enterPlataformaModule, selectFirstMuiOption, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaBitacorasSurtimiento',
  label: 'Plataforma · Bitácoras de Surtimiento',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Bitácoras de Surtimiento', timeouts.default);
    await assertAppNotCrashed(page);

    // Este modulo es 100% de solo lectura (el servicio solo expone GETs); el listado exige
    // elegir canal y confirmar un rango de fechas antes de disparar la consulta.
    await selectFirstMuiOption(page, '[data-testid="select-canal"]', timeouts.default);

    const continuarButton = page.getByRole('button', { name: /Continuar/i });
    const hasContinuar = await continuarButton
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hasContinuar) {
      await continuarButton.click().catch(() => {});
    }

    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(1500);

    const shotLista = await shot('plataforma-bitacoras-surtimiento-lista-cargada');
    await log('Cargar lista de Bitácoras de Surtimiento (Plataforma CDT)', 'ok', null, shotLista);

    // "Ver ticket" es de solo lectura (GET getTickets); se abre y se cierra sin ninguna otra
    // accion en el modal.
    const ticketButton = page.locator('[data-testid="button-ticket"]').first();
    const hasTicket = await ticketButton
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasTicket) {
      await ticketButton.click();
      const closeButton = page.locator('[aria-label="close"]');
      await closeButton.waitFor({ state: 'visible', timeout: timeouts.default });
      const shotTicket = await shot('plataforma-bitacoras-surtimiento-ticket-abierto');
      await log('Abrir detalle de un ticket', 'ok', null, shotTicket);
      await closeButton.click();
    } else {
      await log('Abrir detalle de un ticket', 'ok', 'No hay tickets disponibles para mostrar en este ambiente');
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
