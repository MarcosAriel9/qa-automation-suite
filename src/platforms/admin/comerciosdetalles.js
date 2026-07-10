const { waitForModuleContentReady, raceForVisible, openAgentesSubmenu } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'comerciosdetalles',
  label: 'Comercios (detalle)',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // "Agentes" es un submenu colapsado; "Administración" (/comerciosdetalles) es su hijo.
    await openAgentesSubmenu(page, '/comerciosdetalles', timeouts.default);
    await waitForModuleContentReady(page, timeouts.default);

    const outcome = await raceForVisible(
      {
        vacio: page.getByText('No hay comercios que mostrar', { exact: false }),
        datos: page.locator('table.table tbody tr').first(),
      },
      timeouts.default
    );
    if (outcome === 'timeout') {
      throw new Error('Ni la lista de Comercios ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('comercios-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Comercios', 'ok', 'No hay comercios para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Comercios con datos reales', 'ok', null, shotLista);

    const firstRow = page.locator('table.table tbody tr').first();
    await firstRow.locator('a.button-ver-detalles').click();
    await waitForModuleContentReady(page, timeouts.default);
    const shotDetalle = await shot('comercios-detalle-abierto');
    await log('Abrir detalle de un comercio', 'ok', null, shotDetalle);

    await page.getByText('Regresar', { exact: true }).click();
  },
};
