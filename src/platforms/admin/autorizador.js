const { waitForModuleContentReady } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'autorizador',
  label: 'Autorizador',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="/autorizador-test"]').click();
    await waitForModuleContentReady(page, timeouts.default);

    // No hay un texto de "vacio" para todas las tabs (solo una lo define); a diferencia de
    // isVisible() -- que no espera nada y da un falso negativo si el backend aun no respondio
    // -- aqui se espera (poll real) a que la fila aparezca antes de concluir que no hay datos.
    const firstRow = page.locator('table tbody tr').first();
    const hasRows = await firstRow
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);
    const shotLista = await shot('autorizador-lista-cargada');

    if (!hasRows) {
      await log('Cargar lista de Autorizador', 'ok', 'No hay solicitudes para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Autorizador con datos reales', 'ok', null, shotLista);

    await firstRow.getByText('Ver detalle', { exact: true }).click();
    await waitForModuleContentReady(page, timeouts.default);
    const shotDetalle = await shot('autorizador-detalle-abierto');
    await log('Abrir detalle de una solicitud', 'ok', null, shotDetalle);

    // El control "Regresar" de esta pantalla borra los comentarios de la solicitud antes
    // de navegar (efecto secundario real); se vuelve a la lista con el historial del
    // navegador en vez de usarlo.
    await page.goBack();
    await waitForModuleContentReady(page, timeouts.default);
  },
};
