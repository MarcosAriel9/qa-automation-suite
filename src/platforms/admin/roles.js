const { waitForModuleContentReady, raceForVisible } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'roles',
  label: 'Roles (Perfiles)',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="/roles-test"]').click();
    await waitForModuleContentReady(page, timeouts.default);

    const outcome = await raceForVisible(
      {
        vacio: page.getByText('No hay perfiles por mostrar', { exact: false }),
        datos: page.getByRole('button', { name: /Ver detalle/i }).first(),
      },
      timeouts.default
    );
    if (outcome === 'timeout') {
      throw new Error('Ni la lista de Perfiles ni el estado vacío aparecieron a tiempo');
    }

    const shotLista = await shot('roles-lista-cargada');
    if (outcome === 'vacio') {
      await log('Cargar lista de Perfiles', 'ok', 'No hay perfiles para mostrar en este ambiente', shotLista);
      return;
    }
    await log('Cargar lista de Perfiles con datos reales', 'ok', null, shotLista);

    const firstCard = page.getByRole('button', { name: /Ver detalle/i }).first();

    // Solo se abre y cierra el modal de detalle; nunca se toca el boton de guardar,
    // para no modificar los permisos reales del perfil.
    await firstCard.click();
    const modal = page.locator('.ReactModal__Content, [role="dialog"]').first();
    await modal.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotDetalle = await shot('roles-detalle-abierto');
    await log('Abrir detalle de un perfil', 'ok', null, shotDetalle);

    await modal.locator('button:has(.pi-times)').click();
    await modal.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
  },
};
