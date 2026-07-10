require('dotenv').config();

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  port: int(process.env.PORT, 3500),
  headless: bool(process.env.HEADLESS, false),
  defaultTimeoutMs: int(process.env.DEFAULT_TIMEOUT_MS, 30000),
  qrWaitTimeoutMs: int(process.env.QR_WAIT_TIMEOUT_MS, 180000),
  cotizacionWaitTimeoutMs: int(process.env.COTIZACION_WAIT_TIMEOUT_MS, 150000),

  pos: {
    baseUrl: { dev: process.env.POS_DEV_BASE_URL, prod: process.env.POS_PROD_BASE_URL },
    user: process.env.POS_USER,
    password: process.env.POS_PASSWORD,
    clienteUnico: process.env.POS_CLIENTE_UNICO,
    cotizadorProductoNombre: process.env.POS_COTIZADOR_PRODUCTO_NOMBRE || 'motofake',
    cotizadorProductoPrecio: process.env.POS_COTIZADOR_PRODUCTO_PRECIO || '600',
    ventaMonto: process.env.POS_VENTA_MONTO,
    sucursal: process.env.POS_SUCURSAL,
    caja: process.env.POS_CAJA,
    etiquetaSku: process.env.POS_ETIQUETA_SKU,
  },

  admin: {
    baseUrl: { dev: process.env.ADMIN_DEV_BASE_URL, prod: process.env.ADMIN_PROD_BASE_URL },
    user: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
  },
};

function getBaseUrl(platform, environment) {
  const url = config[platform] && config[platform].baseUrl[environment];
  if (!url) {
    throw new Error(
      `Falta configurar la URL base: ${platform.toUpperCase()}_${environment.toUpperCase()}_BASE_URL en .env`
    );
  }
  return url.replace(/\/+$/, '');
}

// Mapa de variables de entorno requeridas por cada dato usado en los validators,
// para poder fallar temprano con un mensaje claro en vez de a medio flujo de Playwright.
const REQUIRED_ENV_BY_KEY = {
  'pos.login': ['POS_USER', 'POS_PASSWORD'],
  'pos.cotizador': ['POS_CLIENTE_UNICO'],
  'pos.venta': ['POS_VENTA_MONTO', 'POS_SUCURSAL', 'POS_CAJA'],
  'pos.etiquetas': ['POS_ETIQUETA_SKU'],
  'admin.login': ['ADMIN_USER', 'ADMIN_PASSWORD'],
};

function checkRequiredEnv(keys) {
  const missing = [];
  for (const key of keys) {
    for (const varName of REQUIRED_ENV_BY_KEY[key] || []) {
      if (!process.env[varName]) missing.push(varName);
    }
  }
  return [...new Set(missing)];
}

module.exports = { config, getBaseUrl, checkRequiredEnv };
