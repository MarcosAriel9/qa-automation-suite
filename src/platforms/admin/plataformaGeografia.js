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
    await page.waitForTimeout(1500);

    const shotFile = await shot('plataforma-geografia-consulta-personal');
    await log('Cargar "Consulta de personal" (Geografía, Plataforma CDT)', 'ok', null, shotFile);

    // El buscador de "Consulta de personal" solo dispara un GET con el texto capturado
    // (services/empleados.ts -> getPersonal), no escribe nada; se usa un texto corto generico
    // en vez de un valor real de este ambiente, que no se conoce de antemano.
    const searchInput = page.locator('input[data-testid="input-searchBar"]');
    const hasSearch = await searchInput
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasSearch) {
      await searchInput.fill('a');
      await page.locator('button[title="buscar"]').click();
      await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
      await page.waitForTimeout(1500);
      const shotBusqueda = await shot('plataforma-geografia-personal-busqueda');
      await log('Buscar personal por texto', 'ok', null, shotBusqueda);
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
