const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaGeografia',
  label: 'Plataforma · Geografía',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Geografia', timeouts.default);
    await assertAppNotCrashed(page);

    // "Consulta de personal" es la unica vista 100% de solo lectura (lista + buscador, sin
    // crear/editar/inhabilitar). Se evita el mapa de "Ver detalle" de Sucursal Matriz, donde
    // los marcadores tienen acciones de asignar/desasignar que si escriben en el backend.
    const tab = page.getByText('Consulta de personal', { exact: true }).first();
    const hasTab = await tab
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!hasTab) {
      const shotFile = await shot('plataforma-geografia-cargado');
      await log(
        'Cargar Geografía (Plataforma CDT)',
        'ok',
        'No se encontró el tab "Consulta de personal"; se deja como validación de carga',
        shotFile
      );
      await page.getByRole('link', { name: 'Regresar' }).click();
      return;
    }

    await tab.click();
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});

    const shotFile = await shot('plataforma-geografia-consulta-personal');
    await log('Cargar "Consulta de personal" (Geografía, Plataforma CDT)', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
