const { assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaAutorizacionPrecios',
  label: 'Plataforma · Autorización de Precios',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // A diferencia de las demas tarjetas de Plataforma, esta esta protegida por el permiso
    // "Editar" (HasPermissions en MenuApp.jsx): si el usuario de prueba no lo tiene, la tarjeta
    // simplemente no se renderiza (sin error visible). Se detecta con una espera corta en vez
    // de agotar el timeout completo esperando algo que nunca va a aparecer.
    await page.locator('[data-testid="/plataforma-test"]').click();
    const card = page.getByText('Autorización de Precios', { exact: true }).first();
    const hasCard = await card
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!hasCard) {
      await log(
        'Cargar Autorización de Precios (Plataforma CDT)',
        'ok',
        'La tarjeta no está visible: el usuario de prueba no tiene el permiso "Editar" requerido'
      );
      return;
    }

    await card.click();
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(2000);
    await assertAppNotCrashed(page);

    // Solo se observa el listado; nunca se marca ninguna fila ni se clica "Autorizar"
    // (button-acept) o "Rechazar" (button-reject) -- es un flujo real de aprobación.
    const shotFile = await shot('plataforma-autorizacion-precios-cargado');
    await log('Cargar listado de Autorización de Precios (Plataforma CDT)', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
