const { enterPlataformaModule, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'plataformaRegistroVisitas',
  label: 'Plataforma · Registro de Visitas',
  requiredEnvKey: null,
  dependsOn: ['login'],
  async run(ctx) {
    const { page, shot, log, timeouts } = ctx;

    await enterPlataformaModule(page, 'Registro de visitas', timeouts.default);
    await assertAppNotCrashed(page);

    // Este modulo es un wizard para registrar una visita NUEVA (no hay lista de visitas
    // pasadas). Solo se valida que el mapa del paso 1 cargue; nunca se avanza hasta el
    // formulario final ("Enviar" crea un registro real de visita). Confirmado en el codigo
    // fuente: el paso 1 no tiene inputs de busqueda/filtro en el DOM, solo el mapa (marcadores
    // via SDK de Google Maps); el unico control real dentro del InfoWindow de un marcador
    // ("#aplicar") ya avanza al paso 2 del wizard, asi que no hay una interaccion adicional
    // de solo lectura posible en esta pantalla.
    // Sin indicador de carga en el DOM, la unica opcion es una espera fija; el mapa (tiles +
    // marcadores via SDK de Google Maps) puede tardar mas de 5s en redes lentas o en Prod, lo
    // que dejaba la captura a medias (tiles en gris); se sube el margen para cubrir ese caso.
    await page.waitForTimeout(8000);
    const shotFile = await shot('plataforma-registro-visitas-mapa-cargado');
    await log('Cargar mapa de Registro de Visitas (Plataforma CDT)', 'ok', null, shotFile);

    // El boton "Regresar" de este modulo es propio del componente (no el del shell) y es un
    // <Button> simple, no un <Link>; en el paso 1 del wizard (el unico en el que nos
    // quedamos) navega directo de vuelta a /plataforma.
    await page.getByRole('button', { name: 'Regresar' }).click();
  },
};
