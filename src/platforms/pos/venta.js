const path = require('path');
const { clickDigitButtons, waitForAnyText, assertAppNotCrashed, saveQrPng } = require('../../utils/playwrightHelpers');

/**
 * Captura el monto en la calculadora y confirma con el boton "+". Se verifica que el monto
 * realmente haya quedado registrado (el boton "Generar QR" solo se habilita si hay al menos
 * un producto en el carrito) antes de seguir; si no, se recarga la pantalla y se reintenta,
 * en vez de avanzar a ciegas con un carrito vacío.
 */
async function capturarMontoConReintentos(page, monto, { shot, log, timeouts }) {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const expandButton = page.locator('[data-testid="button-expand"]');
      // OJO: isVisible({timeout}) esta deprecado y el timeout se IGNORA (chequeo instantaneo);
      // waitFor es la unica forma real de esperar.
      const hasExpand = await expandButton
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (hasExpand) {
        await expandButton.click();
      }
    }

    await clickDigitButtons(page, monto);
    await page.locator('.pi-plus').first().click();
    await page.waitForTimeout(300);

    const generarQr = page.getByRole('button', { name: /Generar QR/i });
    const registrado = await generarQr.isEnabled().catch(() => false);
    if (registrado) {
      const shotMonto = await shot('venta-monto-capturado');
      await log(`Capturar monto de venta (${monto})`, 'ok', attempt > 1 ? `Se logró en el intento ${attempt}` : null, shotMonto);
      return;
    }
    await log(`Intento ${attempt} de capturar el monto no registró el producto en el carrito`, 'waiting');
  }
  throw new Error(`No se pudo capturar el monto de venta (${monto}) tras ${attempts} intentos`);
}

module.exports = {
  id: 'venta',
  label: 'Venta',
  requiredEnvKey: 'pos.venta',
  dependsOn: ['login', 'dashboard'],
  // No se reintenta el front completo: generar un segundo QR tras un timeout de escaneo
  // significaria un segundo intento de cobro real. El reintento seguro (antes del QR) ya
  // esta manejado internamente en capturarMontoConReintentos.
  maxAttempts: 1,
  async run(ctx) {
    const { page, cfg, shot, log, timeouts, environment, screenshotsDir } = ctx;

    // Si venimos de una cotizacion recien generada, "Comprar" ya redirige aqui; si Venta
    // se corre de forma aislada, se navega directo al modulo desde el menu lateral.
    if (!/\/venta/.test(page.url())) {
      await page.locator('[data-testid="link-test-Ventas"]').click();
      await page.waitForURL(/\/venta/, { timeout: timeouts.default });
    }
    await assertAppNotCrashed(page);
    await log('Entrar al módulo Venta', 'ok');

    // El selector de Sucursal/Caja solo aparece si la sesion no tiene ya una caja asociada.
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
      const shotCaja = await shot('venta-sucursal-caja-seleccionada');
      await log('Seleccionar sucursal y caja', 'ok', null, shotCaja);
    }

    // Puede haber quedado un producto de un flujo anterior en el carrito (persiste en la
    // sesion del backend, no se limpia solo); se borra para partir de un estado limpio.
    const borrarTodo = page.getByRole('button', { name: 'Borrar todo', exact: true });
    const hasBorrarTodo = await borrarTodo
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (hasBorrarTodo) {
      await borrarTodo.click();
      await log('Limpiar carrito con productos de un flujo anterior', 'ok');
    }

    // La calculadora a veces inicia colapsada (icono para expandir) y a veces ya viene
    // expandida por defecto (depende de la configuracion del comercio); el click de expandir
    // es opcional, solo se hace si el boton existe.
    const expandButton = page.locator('[data-testid="button-expand"]');
    const hasExpandButton = await expandButton
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hasExpandButton) {
      await expandButton.click();
    }

    await capturarMontoConReintentos(page, cfg.ventaMonto, { shot, log, timeouts });

    await page.getByRole('button', { name: /Generar QR/i }).click();
    await page.locator('img.qr-image').waitFor({ state: 'visible', timeout: timeouts.default });
    const shotQr = await shot('venta-qr-generado');

    // En Dev el QR no se puede escanear apuntando la camara de la app bancaria productiva
    // directo a la pantalla; se guarda el PNG real (no solo la captura de pantalla) para
    // poder transferirlo/abrirlo y escanearlo de otra forma.
    let qrDetail = 'Escanea este QR con la app del banco para continuar';
    if (environment === 'dev') {
      const qrFileName = 'qr-pago.png';
      await saveQrPng(page, 'img.qr-image', path.join(screenshotsDir, qrFileName));
      qrDetail = `QR guardado como imagen PNG en screenshots/${qrFileName} (en Dev no se puede escanear directo desde la pantalla con la app bancaria productiva)`;
    }
    await log('Generar QR de cobro', 'ok', qrDetail, shotQr);

    await log('Esperando escaneo manual del QR con la app del banco...', 'waiting-manual');
    const result = await waitForAnyText(page, ['Cobro exitoso', 'Error de pago'], timeouts.qrWait);
    const shotResultado = await shot('venta-resultado-cobro');
    await log(`Resultado del cobro: ${result}`, result === 'Cobro exitoso' ? 'ok' : 'failed', null, shotResultado);

    if (result !== 'Cobro exitoso') {
      throw new Error('El cobro no fue exitoso según la pantalla de resultado de Venta');
    }
  },
};
