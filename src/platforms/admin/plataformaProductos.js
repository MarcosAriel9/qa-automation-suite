const { enterPlataformaModule, selectFirstMuiOption, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaProductos',
  label: 'Plataforma · Productos',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Dar de alta Productos', timeouts.default);
    await assertAppNotCrashed(page);

    // Elegir un comercio solo cambia el filtro de la consulta (GET); nunca se usan "Nuevo
    // producto", "Editar producto" ni el switch de habilitar/inhabilitar (mutan datos reales).
    await selectFirstMuiOption(page, '[data-testid="select-comercio"]', timeouts.default);
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(1500);

    const shotLista = await shot('plataforma-productos-lista-cargada');
    await log('Cargar lista de Productos (Plataforma CDT)', 'ok', null, shotLista);

    // "expand row" es de solo lectura: despliega caracteristicas ya cargadas, sin llamada nueva.
    const expandButton = page.getByRole('button', { name: 'expand row' }).first();
    const hasExpand = await expandButton
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasExpand) {
      await expandButton.click();
      const shotDetalle = await shot('plataforma-productos-detalle-expandido');
      await log('Ver características de un producto', 'ok', null, shotDetalle);
    } else {
      await log('Ver características de un producto', 'ok', 'No hay productos con características que expandir en este ambiente');
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
