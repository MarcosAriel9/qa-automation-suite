module.exports = {
  id: 'centroimagenes',
  label: 'Centro de Imágenes',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await page.locator('[data-testid="/centro-imagenes-test"]').click();

    // Las categorias (General / Plataforma administrativa / Punto de venta / Landing page)
    // son solo encabezados de texto, no son clicables: cada categoria ya muestra sus tarjetas
    // de dispositivo directamente (ej. "Login" + "Escritorio"), y esas SI son el enlace real
    // hacia la lista de imagenes de ese modulo/dispositivo (CardPlataforma.js envuelve cada
    // una en un <Link>).
    const firstCard = page.getByText('Login', { exact: true }).first();
    await firstCard.waitFor({ state: 'visible', timeout: timeouts.default });
    const shotMenu = await shot('centroimagenes-menu-plataformas');
    await log('Cargar menú de plataformas de Centro de Imágenes', 'ok', null, shotMenu);

    await firstCard.click();
    await page.waitForLoadState('networkidle', { timeout: timeouts.default }).catch(() => {});
    const shotDispositivos = await shot('centroimagenes-dispositivos-cargado');
    await log('Entrar a la lista de imágenes (Login)', 'ok', null, shotDispositivos);
  },
};
