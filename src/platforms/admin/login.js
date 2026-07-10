const { fillLoginForm, submitLoginAndWait } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'login',
  label: 'Login',
  requiredEnvKey: 'admin.login',
  dependsOn: [],
  async run(ctx) {
    const { page, baseUrl, cfg, shot, log, timeouts } = ctx;

    // El componente Password de PrimeReact pone el id "password" en el <div> contenedor,
    // no en el <input> real; se ubica el input dentro de ese contenedor.
    const userSelector = '#user';
    const passwordSelector = '#password input[type="password"]';

    await page.goto(`${baseUrl}/auth/signin`, { waitUntil: 'domcontentloaded' });
    await log('Abrir pantalla de login', 'ok');

    // Se reintenta con recarga si el formulario no monta al primer intento (carga del
    // remote de Module Federation).
    await fillLoginForm(page, {
      userSelector,
      passwordSelector,
      user: cfg.user,
      password: cfg.password,
      waitTimeout: timeouts.default,
    });
    const shotDatos = await shot('login-datos-capturados');
    await log('Capturar usuario y contraseña', 'ok', null, shotDatos);

    await submitLoginAndWait(page, {
      submitLocator: page.locator('[data-testid="submit-button"]'),
      userSelector,
      passwordSelector,
      user: cfg.user,
      password: cfg.password,
      successUrlPattern: (url) => url.pathname === '/',
      timeout: timeouts.default,
    });
    const shotOk = await shot('login-exitoso-dashboard');
    await log('Iniciar sesión', 'ok', 'Redirigido al dashboard', shotOk);
  },
};
