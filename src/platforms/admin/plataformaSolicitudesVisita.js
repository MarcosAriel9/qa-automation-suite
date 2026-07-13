const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaSolicitudesVisita',
  label: 'Plataforma · Solicitudes de Visita',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Solicitudes de visita', timeouts.default);
    await assertAppNotCrashed(page);

    const shotCalendario = await shot('plataforma-solicitudes-visita-calendario-cargado');
    await log('Cargar calendario de Solicitudes de visita (Plataforma CDT)', 'ok', null, shotCalendario);

    // "Mis solicitudes" solo filtra en el cliente las solicitudes ya cargadas (sin request nuevo).
    const misSolicitudes = page.locator('.button-missolicitudes');
    const hasFilter = await misSolicitudes
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasFilter) {
      await misSolicitudes.click();
      await page.waitForTimeout(500);
      const shotFiltro = await shot('plataforma-solicitudes-visita-filtro-mis-solicitudes');
      await log('Filtrar "Mis solicitudes"', 'ok', null, shotFiltro);
    }

    // Abrir el detalle de una solicitud solo dispara un GET (getVisitByIdRequest); nunca se
    // clica "Autorizar", "Rechazar" ni "Aceptar" dentro del modal -- solo se observa y se
    // cierra con el icono "X" (aria-label="close"), que es independiente del estatus de la
    // solicitud y siempre esta disponible.
    const firstCard = page.locator('.MuiCard-root').first();
    const hasCard = await firstCard
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasCard) {
      await firstCard.click();
      const closeButton = page.locator('[aria-label="close"]');
      const opened = await closeButton
        .waitFor({ state: 'visible', timeout: timeouts.default })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        const shotDetalle = await shot('plataforma-solicitudes-visita-detalle-abierto');
        await log('Abrir detalle de una solicitud de visita', 'ok', null, shotDetalle);
        await closeButton.click();
      }
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
