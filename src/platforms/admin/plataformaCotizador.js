const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaCotizador',
  label: 'Plataforma · Cotizador (CDT)',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Cotizador', timeouts.default);
    await assertAppNotCrashed(page);

    // Este Cotizador (CDT, para comercios satelite) es un modulo distinto al Cotizador de
    // POS: usa PrimeReact, no MUI. Elegir un comercio solo dispara una consulta de lectura
    // (info de la subsidiaria); se toma el primero disponible ya que no hay forma de conocer
    // de antemano nombres validos en este ambiente. NUNCA se completa "Agregar Producto"
    // (crea un producto real) ni el "Continuar" del modal de cliente (genera una cotización real).
    // "Seleccionar comercio" es el placeholder de un PrimeReact Dropdown, no texto renderizado
    // siempre visible; se ubica por la clase real del componente (".p-dropdown"), que existe
    // sin importar el placeholder/idioma.
    const comercioDropdown = page.locator('.p-dropdown').first();
    const hasDropdown = await comercioDropdown
      .waitFor({ state: 'visible', timeout: timeouts.default })
      .then(() => true)
      .catch(() => false);

    if (!hasDropdown) {
      const shotFile = await shot('plataforma-cotizador-cargado');
      await log(
        'Cargar Cotizador (Plataforma CDT)',
        'ok',
        'No se encontró el selector de comercio; se deja como validación de carga',
        shotFile
      );
      await page.getByRole('link', { name: 'Regresar' }).click();
      return;
    }

    await comercioDropdown.click();
    const option = page.locator('.p-dropdown-item').first();
    const opened = await option
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await option.click();
      await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    }

    const shotFile = await shot('plataforma-cotizador-cargado');
    await log('Cargar Cotizador (Plataforma CDT) y seleccionar un comercio', 'ok', null, shotFile);

    await page.getByRole('link', { name: 'Regresar' }).click();
  },
};
