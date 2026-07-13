const { waitForModuleContentReady, ensureSidebarOpen } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'ayuda',
  label: 'Ayuda',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    // "Ayuda" no tiene data-testid en el codigo fuente y su texto solo se renderiza con el
    // sidebar expandido; se ubica por su texto visible en el menu.
    await ensureSidebarOpen(page, timeouts.default);
    await page.locator('a:has-text("Ayuda")').click();
    await waitForModuleContentReady(page, timeouts.default);

    const firstQuestion = page.locator('.p-accordion-header-link').first();
    await firstQuestion.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotLista = await shot('ayuda-preguntas-cargadas');
    await log('Cargar preguntas frecuentes', 'ok', null, shotLista);

    await firstQuestion.click();
    await page.waitForTimeout(900);
    const shotExpandido = await shot('ayuda-pregunta-expandida');
    await log('Expandir la primera pregunta frecuente', 'ok', null, shotExpandido);
  },
};
