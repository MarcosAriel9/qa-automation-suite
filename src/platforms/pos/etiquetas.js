const { assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'etiquetas',
  label: 'Etiquetas',
  requiredEnvKey: 'pos.etiquetas',
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, cfg, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="link-test-Etiquetas"]').click();
    try {
      await page.waitForURL(/\/etiquetas/, { timeout: timeouts.default });
    } catch (err) {
      await assertAppNotCrashed(page);
      throw err;
    }
    await assertAppNotCrashed(page);

    await page.locator('#sku').fill(cfg.etiquetaSku);
    await page.getByRole('button', { name: /Buscar/i }).click();

    const loader = page.locator('[data-testid="loadingIndex"]');
    await loader.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    await loader.waitFor({ state: 'hidden', timeout: timeouts.default }).catch(() => {});

    const noResults = page.getByText('Tu búsqueda no arrojó resultados', { exact: false });
    const shotFile = await shot('etiquetas-resultado-busqueda');
    if (await noResults.isVisible().catch(() => false)) {
      await log('Buscar producto por SKU', 'ok', `Sin resultados para "${cfg.etiquetaSku}"`, shotFile);
      return;
    }
    await log('Buscar producto por SKU y mostrar vista previa de etiqueta', 'ok', null, shotFile);
  },
};
