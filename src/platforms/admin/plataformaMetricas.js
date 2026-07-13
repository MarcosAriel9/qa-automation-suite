const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaMetricas',
  label: 'Plataforma · Métricas',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Métricas', timeouts.default);
    await assertAppNotCrashed(page);

    // Solo se valida la vista por defecto "Avance general" (tarjetas de solo lectura, sin
    // ningun filtro/input en el DOM segun el codigo fuente de ViewMetricasAside). Nunca se
    // hace clic en "Permisos" (CRUD de colaboradores) ni "Formularios" (crear/editar
    // cuestionarios): ambos son entradas a flujos que escriben en el backend.
    const dashboard = page.locator('[data-testid="test-dashboard-body"]');
    await dashboard.waitFor({ state: 'visible', timeout: timeouts.default });
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});

    const shotFile = await shot('plataforma-metricas-avance-general');
    await log('Cargar "Avance general" (Métricas, Plataforma CDT)', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
