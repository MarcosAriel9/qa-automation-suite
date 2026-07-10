const { fillLoginForm, submitLoginAndWait } = require('../../utils/playwrightHelpers');

module.exports = {
  id: 'login',
  label: 'Login',
  requiredEnvKey: 'pos.login',
  dependsOn: [],
  async run(ctx) {
    const { page, baseUrl, cfg, shot, log, timeouts } = ctx;

    // El componente Password de PrimeReact pone el name/id en el <div> contenedor, no en el
    // <input> real; se ubica por type="password" en vez de por name/id.
    const userSelector = 'input[name="user"]';
    const passwordSelector = 'form input[type="password"]';

    await page.goto(`${baseUrl}/authpos/signin`, { waitUntil: 'domcontentloaded' });
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
      submitLocator: page.getByRole('button', { name: /Ingresar/i }),
      userSelector,
      passwordSelector,
      user: cfg.user,
      password: cfg.password,
      successUrlPattern: /\/inicio/,
      timeout: timeouts.default,
    });
    const shotOk = await shot('login-exitoso-dashboard');
    await log('Iniciar sesión', 'ok', 'Redirigido a /inicio', shotOk);
  },
};
