const { waitForModuleContentReady, openAgentesSubmenu } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'autoguardado',
  label: 'Autoguardado Alta Comercio',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // No hay enlace directo en el menu lateral: se entra desde Comercios (detalle) -- dentro
    // del submenu colapsado "Agentes" -- con el boton "+Autoguardado" (esquina superior
    // derecha de la lista), que navega a /autoguardadoaltacomercio para iniciar un registro
    // nuevo con autoguardado.
    await openAgentesSubmenu(page, '/comerciosdetalles', timeouts.default);
    await waitForModuleContentReady(page, timeouts.default);

    const autoguardadoButton = page.locator('.button-agregar-comercio', { hasText: 'Autoguardado' });
    const hasButton = await autoguardadoButton
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!hasButton) {
      const shotFile = await shot('autoguardado-boton-no-visible');
      await log(
        'Cargar Autoguardado Alta Comercio',
        'ok',
        'El botón "+Autoguardado" no está disponible (permiso o ambiente)',
        shotFile
      );
      return;
    }

    await autoguardadoButton.click();
    await page.waitForURL(/\/autoguardadoaltacomercio/, { timeout: timeouts.default });
    await page
      .getByText('Alta - Comercios baz crédito', { exact: false })
      .waitFor({ state: 'visible', timeout: timeouts.default });
    const shotWizard = await shot('autoguardado-wizard-cargado');
    await log(
      'Abrir el wizard de Autoguardado Alta Comercio ("+Autoguardado")',
      'ok',
      'Solo se valida la carga; no se llena ni envía el formulario (crearía un comercio real)',
      shotWizard
    );

    await page.goBack();
  },
};
