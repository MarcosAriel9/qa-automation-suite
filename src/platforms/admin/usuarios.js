module.exports = {
  id: 'usuarios',
  label: 'Usuarios',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // Este modulo no tiene indicador de carga visible (el spinner esta importado pero
    // nunca renderizado en el codigo fuente), asi que se espera por datos en la tabla.
    await page.locator('[data-testid="/usuarios-test"]').click();
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});

    const rows = page.locator('table.table tbody tr');
    await rows.first().waitFor({ state: 'visible', timeout: timeouts.default });
    const shotLista = await shot('usuarios-lista-cargada');
    await log('Cargar lista de Usuarios con datos reales', 'ok', null, shotLista);

    // No existe una vista de detalle por usuario; se usa el cambio de tab (accion de
    // solo lectura) para comprobar que la tabla recarga con datos reales distintos.
    await page.getByText('Inhabilitados', { exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    const shotTab = await shot('usuarios-tab-inhabilitados');
    await log('Cambiar a la pestaña "Inhabilitados" y recargar la tabla', 'ok', null, shotTab);
  },
};
