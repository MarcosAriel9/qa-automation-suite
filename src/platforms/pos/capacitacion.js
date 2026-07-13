const { assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'capacitacion',
  label: 'Capacitación',
  requiredEnvKey: null,
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="link-test-Capacitacion"]').click();
    await page.waitForURL(/\/documentacion/, { timeout: timeouts.default });
    await assertAppNotCrashed(page);

    const tabMenu = page.locator('[data-testid="tab-menu-capacitacion"]');
    const loaded = await tabMenu
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      await assertAppNotCrashed(page);
      throw new Error('El módulo de Capacitación no cargó a tiempo');
    }
    // El tab-menu aparece antes de que la lista de documentos termine de pintarse; sin este
    // margen la captura queda a medias (tarjetas vacías o skeleton).
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    await page.waitForTimeout(1500);
    const shotDocumentos = await shot('capacitacion-documentos-cargado');
    await log('Cargar módulo de Capacitación (tab Documentos)', 'ok', null, shotDocumentos);

    await page.getByText('Videos', { exact: true }).click();
    const playButton = page.locator('[data-testid="card-video-button"]').first();
    await playButton.waitFor({ state: 'visible', timeout: timeouts.default });
    await playButton.click();

    const dialog = page.locator('.p-dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotVideo = await shot('capacitacion-video-abierto');
    await log('Reproducir un video de capacitación', 'ok', null, shotVideo);

    // El icono de cerrar de PrimeReact es un componente SVG (TimesIcon), no la clase de
    // fuente "pi-times"; el boton en si tiene la clase estable "p-dialog-header-close".
    await dialog.locator('.p-dialog-header-close').click();
    await dialog.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});
  },
};
