const { waitForAnyText, assertAppNotCrashed } = require('../../utils/playwrightHelpers');

/**
 * El remote de Cotizador, la primera vez que se entra desde el dashboard en la misma sesion,
 * a veces monta la ruta pero se queda en blanco (falla silenciosa al cargar el chunk de
 * Module Federation). Volver a Inicio y entrar de nuevo lo resuelve casi siempre, asi que se
 * hace de forma proactiva (no solo como reintento tras un error) antes de darlo por roto.
 */
async function entrarACotizador(page, timeouts) {
  const nombreInput = page.locator('input[data-testid="nombreInput"]');

  await page.locator('[data-testid="link-test-Cotizador"]').click();
  await page.waitForURL(/\/cotizador/, { timeout: timeouts.default });
  await assertAppNotCrashed(page);

  const loadedOnFirstTry = await nombreInput
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (loadedOnFirstTry) return;

  await page.locator('[data-testid="link-test-Inicio"]').click();
  await page.waitForURL(/\/inicio/, { timeout: timeouts.default });
  await page.locator('[data-testid="link-test-Cotizador"]').click();
  await page.waitForURL(/\/cotizador/, { timeout: timeouts.default });
  await assertAppNotCrashed(page);

  const loadedOnSecondTry = await nombreInput
    .waitFor({ state: 'visible', timeout: timeouts.default })
    .then(() => true)
    .catch(() => false);
  if (!loadedOnSecondTry) {
    await assertAppNotCrashed(page);
    throw new Error('El módulo Cotizador navegó pero no renderizó el formulario (pantalla en blanco), incluso tras reintentar desde Inicio');
  }
}

module.exports = {
  id: 'cotizador',
  label: 'Cotizador',
  requiredEnvKey: 'pos.cotizador',
  dependsOn: ['login', 'dashboard'],
  async run(ctx) {
    const { page, cfg, shot, log, timeouts } = ctx;

    await entrarACotizador(page, timeouts);
    const nombreInput = page.locator('input[data-testid="nombreInput"]');
    await log('Entrar al módulo Cotizador', 'ok');

    // El producto se captura manualmente en "Agregar otros productos" (Cotizador/src/
    // components/carrito/Agregar.jsx) en vez de elegirlo del inventario.
    await nombreInput.fill(cfg.cotizadorProductoNombre);

    const precioInput = page.locator('input[data-testid="precioInput"]');
    await precioInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(String(cfg.cotizadorProductoPrecio));

    await page.locator('[data-testid="submitAgregar"]').click();
    const shotProducto = await shot('cotizador-producto-agregado');
    await log(
      `Agregar producto manual "${cfg.cotizadorProductoNombre}" ($${cfg.cotizadorProductoPrecio})`,
      'ok',
      null,
      shotProducto
    );

    await page.getByRole('button', { name: 'Cotizar', exact: true }).click();

    await page.locator('#cliente-form input[name="clienteUnico"]').fill(cfg.clienteUnico);
    await page.getByRole('button', { name: /Continuar/i }).click();
    const shotEnviado = await shot('cotizador-solicitud-enviada');
    await log('Enviar código de cliente único y solicitar cotización', 'ok', null, shotEnviado);

    // El backend genera la oferta de forma asincrona (polling interno cada ~10s, "puede
    // tomar unos minutos" segun el propio mensaje de la app). OJO: el texto del dialogo de
    // carga es "¡Generando la mejor oferta!", que ya contiene la subcadena "mejor oferta" —
    // esperar a que ese texto APAREZCA (en vez de a que el dialogo DESAPAREZCA) resuelve casi
    // instantaneo contra el propio loader y avanza con el proceso aun en curso. Se espera a
    // que el dialogo de carga desaparezca, que es la señal real de que el backend terminó.
    await log('Esperando generación de la cotización (proceso backend)', 'waiting');
    const loadingDialog = page.getByText('Generando la mejor oferta', { exact: false });
    await loadingDialog.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await loadingDialog.waitFor({ state: 'hidden', timeout: timeouts.cotizacionWait });

    await waitForAnyText(page, ['Pago en la app', 'Mejor oferta'], 15000);
    const shotOferta = await shot('cotizador-oferta-generada');
    await log('Cotización generada', 'ok', null, shotOferta);
  },
};
