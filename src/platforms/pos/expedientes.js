module.exports = {
  id: 'expedientes',
  label: 'Expedientes',
  requiredEnvKey: null,
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="link-test-Expedientes"]').click();
    await page.waitForURL(/\/expedientes/, { timeout: timeouts.default });
    await page.locator('[data-testid="formularioExpediente"]').waitFor({ state: 'visible', timeout: timeouts.default });
    const shotFormulario = await shot('expedientes-formulario-cargado');
    await log('Cargar módulo de Expedientes', 'ok', null, shotFormulario);

    // Se usa "Facturas pendientes" como flujo de solo lectura: no requiere buscar un
    // expediente primero y solo hace un GET, a diferencia de las acciones de eliminar/cargar.
    await page.locator('[data-testid="Facturas pendientes"]').click();

    const dialog = page.locator('.p-dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotDialog = await shot('expedientes-facturas-pendientes');
    await log('Abrir "Facturas pendientes"', 'ok', null, shotDialog);

    await dialog.locator('[data-testid="closeDialog"]').click();
    await dialog.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
  },
};
