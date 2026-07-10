module.exports = {
  id: 'dashboard',
  label: 'Dashboard (Inicio)',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('#sidebar').waitFor({ state: 'visible', timeout: timeouts.default });

    // El contenido de Inicio (KPIs/graficas) carga via su propia llamada asincrona despues
    // de que el sidebar ya esta listo; se da un margen extra para que termine de pintar.
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(4000);

    const shotFile = await shot('dashboard-sidebar-visible');
    await log('Verificar carga del dashboard (Inicio) y menú lateral', 'ok', null, shotFile);
  },
};
