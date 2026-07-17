const { assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'originacion',
  label: 'Originación',
  requiredEnvKey: 'pos.originacion',
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, cfg, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="link-test-Originacion"]').click();
    try {
      await page.waitForURL(/\/originacion/, { timeout: timeouts.default });
    } catch (err) {
      await assertAppNotCrashed(page);
      throw err;
    }
    await assertAppNotCrashed(page);

    // El selector de Sucursal/Caja solo aparece si la sesion no tiene ya una caja asociada
    // (mismo comportamiento que en Venta).
    // OJO: locator.isVisible({timeout}) esta deprecado y el timeout se IGNORA (Playwright
    // devuelve el estado actual al instante); usar waitFor es la unica forma real de esperar.
    const sucursalDropdown = page.getByText('Selección de sucursal', { exact: false });
    const hasSucursalDialog = await sucursalDropdown
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hasSucursalDialog) {
      await sucursalDropdown.click();
      await page.getByText(cfg.sucursal, { exact: false }).click();

      // El campo de Caja depende de la Sucursal elegida (cascada): sus opciones se piden por
      // GET recien al seleccionar la sucursal, no vienen precargadas. Sin esta espera, el
      // dropdown de Caja se abre vacio y el click sobre cfg.caja no encuentra nada que marcar.
      await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
      await page.waitForTimeout(1000);

      await page.getByText('Selección de caja', { exact: false }).click();
      const cajaOption = page.getByText(cfg.caja, { exact: false });
      await cajaOption.waitFor({ state: 'visible', timeout: timeouts.default });
      await cajaOption.click();

      await page.getByRole('button', { name: /Aceptar/i }).click();
      const shotCaja = await shot('originacion-sucursal-caja-seleccionada');
      await log('Seleccionar sucursal y caja', 'ok', null, shotCaja);
    }

    // "Nueva solicitud" siempre esta presente (tab por defecto); se espera a que el TabView
    // realmente monte antes de decidir si el tab "Estatus de solicitudes" existe (depende de
    // un feature flag consultado por GET al montar, no aparece instantaneo).
    const nuevaSolicitudTab = page.getByRole('tab', { name: /Nueva solicitud/i });
    const mounted = await nuevaSolicitudTab
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!mounted) {
      await assertAppNotCrashed(page);
      throw new Error('El módulo Originación no renderizó (pantalla en blanco)');
    }
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});

    // La tab "Nueva solicitud" genera una solicitud de credito real (QR de originacion);
    // no se interactua con ella. Solo se revisa "Estatus de solicitudes" (solo lectura),
    // que puede no existir segun un feature flag del ambiente.
    const statusTab = page.getByRole('tab', { name: /Estatus de solicitudes/i });
    // isVisible() no espera nada: si el tab depende de un GET con feature flag que aun no
    // resuelve, da un falso negativo y reporta "no habilitado" cuando en realidad solo tardo.
    const hasStatusTab = await statusTab
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!hasStatusTab) {
      const shotFile = await shot('originacion-sin-tab-estatus');
      await log(
        'Cargar módulo de Originación',
        'ok',
        'El tab "Estatus de solicitudes" no está habilitado en este ambiente',
        shotFile
      );
      return;
    }

    await statusTab.click();
    await page.locator('[data-testid="loading-pdv-originacion"]').waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
    await page.getByText('Cargando solicitudes', { exact: false }).waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});

    const shotFile = await shot('originacion-estatus-solicitudes');
    await log('Cargar "Estatus de solicitudes" de Originación', 'ok', null, shotFile);
  },
};
