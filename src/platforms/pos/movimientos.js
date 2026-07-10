const { raceForVisible, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'movimientos',
  label: 'Movimientos',
  requiredEnvKey: null,
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="link-test-Movimientos"]').click();
    await page.waitForURL(/\/movimientos/, { timeout: timeouts.default });
    await assertAppNotCrashed(page);

    // Ojo: ".tw-grid" tambien lo usa el encabezado de la tabla (TableHeader), no solo las
    // filas de datos; "detalle" es el testid del menu "..." que solo existe en filas reales.
    // Se espera (en paralelo, no con isVisible instantaneo) a que aparezca el estado vacio o
    // la primera fila real, lo que ocurra primero, para no adelantarse al backend.
    const outcome = await raceForVisible(
      {
        vacio: page.getByText('Sin información por mostrar', { exact: false }),
        datos: page.locator('[data-testid="detalle"]').first(),
      },
      timeouts.default
    );

    if (outcome === 'timeout') {
      await assertAppNotCrashed(page);
      throw new Error('Ni la tabla de Movimientos ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('movimientos-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Movimientos', 'ok', 'No hay movimientos para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Movimientos con datos reales', 'ok', null, shotLista);

    // El menu "..." de la fila abre un ListBox con "Ver detalle" (solo lectura) y
    // "Cancelar" (mutante, cancela la venta): nunca se selecciona "Cancelar".
    await page.locator('[data-testid="detalle"]').first().click();
    await page.getByText('Ver detalle', { exact: true }).click();

    const dialog = page.locator('.p-dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotDetalle = await shot('movimientos-detalle-abierto');
    await log('Abrir detalle de un movimiento', 'ok', null, shotDetalle);

    // Dentro del detalle, la sección "Historial" tiene un "Ver" por cada registro que abre
    // un segundo modal (DetalleHistorial) con más información; no todos los movimientos
    // tienen historial, así que este paso es opcional. El historial viene en el mismo
    // response que ya renderizó el dialogo (no es una carga aparte), asi que aqui si es
    // seguro un chequeo inmediato.
    const verDetalles = page.locator('[data-testid="verDetalles"]').first();
    const hasHistorial = await verDetalles.isVisible().catch(() => false);
    if (hasHistorial) {
      await verDetalles.click();
      await page.locator('.p-dialog').nth(1).waitFor({ state: 'visible', timeout: timeouts.default });
      const shotHistorial = await shot('movimientos-historial-detalle-abierto');
      await log('Ver más información en el historial del movimiento', 'ok', null, shotHistorial);

      // Se cierra primero el modal anidado (el mas reciente) y luego el principal. El icono
      // de cerrar de PrimeReact es un componente SVG (TimesIcon), no la clase de fuente
      // "pi-times"; el boton en si tiene la clase estable "p-dialog-header-close".
      await page.locator('.p-dialog').last().locator('.p-dialog-header-close').click();
      await page.locator('.p-dialog').nth(1).waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
    } else {
      await log('Ver más información en el historial del movimiento', 'ok', 'Este movimiento no tiene historial que mostrar');
    }

    await dialog.locator('.p-dialog-header-close').click();
    await dialog.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
  },
};
