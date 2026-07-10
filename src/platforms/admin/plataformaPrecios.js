const { enterPlataformaModule, selectFirstMuiOption, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaPrecios',
  label: 'Plataforma · Precios',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Asignar Precios', timeouts.default);
    await assertAppNotCrashed(page);

    // Elegir canal solo cambia el filtro de la consulta (GET); nunca se usa "Insertar precio"
    // (abre un wizard que termina en un POST de precios reales).
    await selectFirstMuiOption(page, '[data-testid="select-canal"]', timeouts.default);

    await page
      .locator('[data-testid="button-searchBar-normal"]')
      .click()
      .catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});

    const shotLista = await shot('plataforma-precios-lista-cargada');
    await log('Cargar lista de Precios (Plataforma CDT)', 'ok', null, shotLista);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
