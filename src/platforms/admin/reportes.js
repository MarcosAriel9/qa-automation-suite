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

    const emptyState = page.getByText('No existen reportes generados', { exact: false });
    const shotHistorial = await shot('reportes-historial-cargado');
    if (await emptyState.isVisible().catch(() => false)) {
      await log('Cargar Historial de Reportes', 'ok', 'No existen reportes generados en este ambiente', shotHistorial);
      return;
    }
    await log('Cargar Historial de Reportes con datos reales', 'ok', null, shotHistorial);
  },
};
