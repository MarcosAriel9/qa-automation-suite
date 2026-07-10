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

    const shotFile = await shot('plataforma-originacion-cargado');
    await log('Cargar dashboard de Originación (Plataforma CDT)', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
