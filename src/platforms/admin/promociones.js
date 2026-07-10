const { waitForModuleContentReady, raceForVisible } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'promociones',
  label: 'Promociones',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="/promotions-test"]').click();
    await waitForModuleContentReady(page, timeouts.default);

    const outcome = await raceForVisible(
      {
        vacio: page.getByText('No hay promociones', { exact: false }),
        datos: page.locator('.card-promocion:not(.shimmer-loading)').first(),
      },
      timeouts.default
    );
    if (outcome === 'timeout') {
      throw new Error('Ni la lista de Promociones ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('promociones-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Promociones', 'ok', 'No hay promociones para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Promociones con datos reales', 'ok', null, shotLista);

    // El onClick real esta en el <div> interno (icono "Dots" + Menu popup), no en el
    // ".menu-card" que lo envuelve; clicar el contenedor exterior puede caer fuera del area
    // real con el handler y nunca abrir el menu. El popup (#popup_menu) es de PrimeReact con
    // animacion de apertura; se espera a que se vea y, si el primer clic no lo abrio, se
    // reintenta una vez antes de buscar "Detalles".
    const firstCard = page.locator('.card-promocion:not(.shimmer-loading)').first();
    const menuTrigger = firstCard.locator('.menu-card > div').first();
    const popupMenu = page.locator('#popup_menu');

    await menuTrigger.click();
    const opened = await popupMenu
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      await menuTrigger.click();
      await popupMenu.waitFor({ state: 'visible', timeout: timeouts.default });
    }

    await page.getByText('Detalles', { exact: true }).click();

    const modal = page.locator('.baz-co-modal');
    await modal.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotDetalle = await shot('promociones-detalle-abierto');
    await log('Abrir detalle de una promoción', 'ok', null, shotDetalle);

    await modal.locator('button:has(.pi-times)').click();
    await modal.waitFor({ state: 'hidden', timeout: timeouts.default });
  },
};
