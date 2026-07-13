const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaOriginacion',
  label: 'Plataforma · Originación',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Originacion', timeouts.default);
    await assertAppNotCrashed(page);

    // A diferencia de Originacion en POS, este modulo es solo un dashboard de solicitudes ya
    // existentes (filtros + tabla), sin formulario de creacion. Se evita el boton
    // "Descargar" (genera un job de reporte real en el backend, no es puramente lectura).
    const listado = page.locator('[data-testid="listado-cdt-originacion"]');
    await listado.waitFor({ state: 'visible', timeout: timeouts.default });
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(1500);

    const shotFile = await shot('plataforma-originacion-cargado');
    await log('Cargar dashboard de Originación (Plataforma CDT)', 'ok', null, shotFile);

    // El filtro "Socio comercial" (dropdown de PrimeReact) solo cambia los criterios de una
    // busqueda de solicitudes ya existentes (GetSolicitudes); no hay boton de "Nueva
    // solicitud" en este dashboard, a diferencia del modulo de Originacion en POS.
    const socioDropdown = page.locator('[data-testid="socio-dropdown"]');
    const hasSocio = await socioDropdown
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasSocio) {
      await socioDropdown.click();
      const option = page.locator('.p-dropdown-item').first();
      const opened = await option
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        await option.click();
        await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
        await page.waitForTimeout(1500);
        const shotFiltro = await shot('plataforma-originacion-filtro-socio');
        await log('Filtrar solicitudes por Socio comercial', 'ok', null, shotFiltro);
      }
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
