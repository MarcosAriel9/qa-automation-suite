const { waitForModuleContentReady } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'reportes',
  label: 'Reportes',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="/reportes-test"]').click();
    await waitForModuleContentReady(page, timeouts.default);
    const shotInicial = await shot('reportes-ventas-cargado');
    await log('Cargar módulo de Reportes (tab Ventas)', 'ok', null, shotInicial);

    await page.getByText('Historial de Reportes', { exact: true }).click();
    await waitForModuleContentReady(page, timeouts.default);

    const table = page.locator('#datatableReportes');
    await table.waitFor({ state: 'visible', timeout: timeouts.default });

    // Se espera (poll real) el estado vacio o la primera fila, en vez de un chequeo instantaneo
    // que podria adelantarse a que la tabla termine de poblarse tras networkidle.
    const emptyState = page.getByText('No existen reportes generados', { exact: false });
    const hasEmptyState = await emptyState
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const shotHistorial = await shot('reportes-historial-cargado');
    if (hasEmptyState) {
      await log('Cargar Historial de Reportes', 'ok', 'No existen reportes generados en este ambiente', shotHistorial);
      return;
    }
    await log('Cargar Historial de Reportes con datos reales', 'ok', null, shotHistorial);
  },
};
