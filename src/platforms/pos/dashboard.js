module.exports = {
  id: 'dashboard',
  label: 'Dashboard',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // Ojo: [data-testid="sidebar-ref"] NO es el sidebar de escritorio que se ve en pantalla
    // -- es una pestaña movil rotada 90 grados, oculta a proposito en desktop
    // (`tablet:tw-hidden`, Sidebar.jsx linea 204-206). El sidebar real es un <section
    // className="newsidebar"> sin testid propio; se usa el boton de expandir/contraer como
    // señal fiable de que el layout de escritorio ya cargó.
    await page.locator('[data-testid="expand-sidebar-button"]').waitFor({ state: 'visible', timeout: timeouts.default });

    // El contenido del dashboard (KPIs, grafica "Total de ventas") carga via su propia
    // llamada asincrona despues de que el sidebar ya esta listo; se espera por el titulo
    // "Resumen" y se da un margen extra para que la grafica termine de pintar.
    await page.getByText('Resumen', { exact: true }).waitFor({ state: 'visible', timeout: timeouts.default }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(4000);

    const shotFile = await shot('dashboard-sidebar-visible');
    await log('Verificar carga del dashboard y menú lateral', 'ok', null, shotFile);
  },
};
