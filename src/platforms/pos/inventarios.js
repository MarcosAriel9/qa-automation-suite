const { raceForVisible, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'inventarios',
  label: 'Inventarios',
  requiredEnvKey: null,
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // Este modulo no tiene indicador de carga visible; se espera (en paralelo) a que
    // aparezca el estado vacio o la primera fila real, lo que ocurra primero.
    await page.locator('[data-testid="link-test-Inventarios"]').click();
    await page.waitForURL(/\/inventarios/, { timeout: timeouts.default });
    await assertAppNotCrashed(page);

    const outcome = await raceForVisible(
      {
        vacio: page.getByText('Sin información por mostrar', { exact: false }),
        datos: page.locator('#action-0'),
      },
      timeouts.default
    );

    if (outcome === 'timeout') {
      await assertAppNotCrashed(page);
      throw new Error('Ni la tabla de Inventarios ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('inventarios-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Inventarios', 'ok', 'No hay artículos para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Inventarios con datos reales', 'ok', null, shotLista);

    // Se abre el dialogo de edicion solo para verlo prellenado; nunca se toca "Guardar".
    await page.locator('#action-0').locator('.pi-pencil').click();
    const dialog = page.locator('.p-dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotDetalle = await shot('inventarios-detalle-abierto');
    await log('Abrir detalle/edición de un artículo (sin guardar cambios)', 'ok', null, shotDetalle);

    // El icono de cerrar de PrimeReact es un componente SVG (TimesIcon), no la clase de
    // fuente "pi-times"; el boton en si tiene la clase estable "p-dialog-header-close".
    await dialog.locator('.p-dialog-header-close').click();
    await dialog.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
  },
};
