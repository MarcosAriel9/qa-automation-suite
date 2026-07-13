const { enterPlataformaModule, selectFirstMuiOption, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaClasificaciones',
  label: 'Plataforma · Clasificaciones',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Clasificar', timeouts.default);
    await assertAppNotCrashed(page);

    // Elegir canal solo cambia el filtro de la consulta (GET); nunca se usa el icono de editar
    // (abre ModalCrearClasificaciones/ModalCrearClasificacionBanco, formularios que mutan datos).
    await selectFirstMuiOption(page, '[data-testid="select-canal"]', timeouts.default);
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(1500);

    const shotFile = await shot('plataforma-clasificaciones-lista-cargada');
    await log('Cargar lista de Clasificaciones (Plataforma CDT)', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
