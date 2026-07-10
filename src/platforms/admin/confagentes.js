const { waitForModuleContentReady, raceForVisible, openAgentesSubmenu } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'confagentes',
  label: 'Configuración de Agentes',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // "Agentes" es un submenu colapsado; "Configuración" (/config-agentes) es su hijo.
    await openAgentesSubmenu(page, '/config-agentes', timeouts.default);
    await waitForModuleContentReady(page, timeouts.default);

    const outcome = await raceForVisible(
      {
        vacio: page.getByText('No hay agentes para mostrar', { exact: false }),
        datos: page.locator('.imagenCard label.textoCard').first(),
      },
      timeouts.default
    );
    if (outcome === 'timeout') {
      throw new Error('Ni la lista de Agentes ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('confagentes-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Agentes', 'ok', 'No hay agentes para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Agentes con datos reales', 'ok', null, shotLista);

    await page.locator('.imagenCard').first().click();
    await waitForModuleContentReady(page, timeouts.default);
    const shotDetalle = await shot('confagentes-detalle-abierto');
    await log('Abrir configuración de un agente', 'ok', null, shotDetalle);

    await page.locator('a[href="/config-agentes"]').first().click();
  },
};
