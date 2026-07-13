const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');

// Config general del servidor (puerto, timeouts) vive en .env; las credenciales y URLs por
// ambiente viven por separado en .env.dev / .env.prod, para nunca correr por accidente con
// credenciales del ambiente equivocado (sobre todo Producción, donde Venta mueve dinero real).
dotenv.config({ path: path.join(ROOT, '.env') });

function loadEnvFile(filename) {
  const fullPath = path.join(ROOT, filename);
  if (!fs.existsSync(fullPath)) return {};
  return dotenv.parse(fs.readFileSync(fullPath, 'utf8'));
}

const envFiles = {
  dev: loadEnvFile('.env.dev'),
  prod: loadEnvFile('.env.prod'),
};

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
};

/**
 * Config de una plataforma para un ambiente especifico, leida de .env.dev o .env.prod (nunca
 * de variables globales), para que las credenciales/URLs de un ambiente no se puedan mezclar
 * con las del otro por accidente.
 */
function getPlatformConfig(platform, environment) {
  const env = envFiles[environment] || {};

  if (platform === 'pos') {
    return {
      baseUrl: env.POS_BASE_URL,
      user: env.POS_USER,
      password: env.POS_PASSWORD,
      clienteUnico: env.POS_CLIENTE_UNICO,
      cotizadorProductoNombre: env.POS_COTIZADOR_PRODUCTO_NOMBRE || 'motofake',
      cotizadorProductoPrecio: env.POS_COTIZADOR_PRODUCTO_PRECIO || '600',
      ventaMonto: env.POS_VENTA_MONTO,
      sucursal: env.POS_SUCURSAL,
      caja: env.POS_CAJA,
      etiquetaSku: env.POS_ETIQUETA_SKU,
    };
  }

  if (platform === 'admin') {
    return {
      baseUrl: env.ADMIN_BASE_URL,
      user: env.ADMIN_USER,
      password: env.ADMIN_PASSWORD,
    };
  }

  throw new Error(`Plataforma desconocida: ${platform}`);
}

function getBaseUrl(platform, environment) {
  const { baseUrl } = getPlatformConfig(platform, environment);
  if (!baseUrl) {
    throw new Error(
      `Falta configurar ${platform.toUpperCase()}_BASE_URL en .env.${environment} (el archivo puede no existir o esa variable puede estar vacía)`
    );
  }
  return baseUrl.replace(/\/+$/, '');
}

// Mapa de campos requeridos (ya resueltos por getPlatformConfig) por cada dato usado en los
// validators, para poder fallar temprano con un mensaje claro en vez de a medio flujo de
// Playwright. El nombre de variable se guarda aparte para que el mensaje de error apunte al
// nombre real tal cual va en el .env, no al nombre del campo interno en camelCase.
const REQUIRED_FIELDS_BY_KEY = {
  'pos.login': [
    ['user', 'POS_USER'],
    ['password', 'POS_PASSWORD'],
  ],
  'pos.cotizador': [['clienteUnico', 'POS_CLIENTE_UNICO']],
  'pos.venta': [
    ['ventaMonto', 'POS_VENTA_MONTO'],
    ['sucursal', 'POS_SUCURSAL'],
    ['caja', 'POS_CAJA'],
  ],
  'pos.originacion': [
    ['sucursal', 'POS_SUCURSAL'],
    ['caja', 'POS_CAJA'],
  ],
  'pos.etiquetas': [['etiquetaSku', 'POS_ETIQUETA_SKU']],
  'admin.login': [
    ['user', 'ADMIN_USER'],
    ['password', 'ADMIN_PASSWORD'],
  ],
};

function checkRequiredEnv(keys, platform, environment) {
  const cfg = getPlatformConfig(platform, environment);
  const missing = [];
  for (const key of keys) {
    for (const [field, varName] of REQUIRED_FIELDS_BY_KEY[key] || []) {
      if (!cfg[field]) missing.push(`${varName} (.env.${environment})`);
    }
  }
  return [...new Set(missing)];
}

module.exports = { config, getPlatformConfig, getBaseUrl, checkRequiredEnv };
