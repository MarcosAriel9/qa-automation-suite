const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaCompensaciones',
  label: 'Plataforma · Compensaciones',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Compensaciones', timeouts.default);
    await assertAppNotCrashed(page);

    const shotLista = await shot('plataforma-compensaciones-lista-cargada');
    await log('Cargar lista de Compensaciones (Plataforma CDT)', 'ok', null, shotLista);

    // El switch de activo/inactivo solo filtra la tabla ya cargada en el cliente (sin request
    // nuevo); nunca se usa "Nueva compensación" ni el icono de editar (abren formularios que
    // mutan datos reales).
    const activeSwitch = page.locator('[role="active-switch-compensacion"]');
    const hasSwitch = await activeSwitch
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (hasSwitch) {
      await activeSwitch.click();
      await page.waitForTimeout(500);
      const shotFiltro = await shot('plataforma-compensaciones-filtro-activo');
      await log('Alternar filtro de compensaciones activas/inactivas', 'ok', null, shotFiltro);
    }

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
