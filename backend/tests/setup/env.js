// Corre en cada worker antes de cargar la app: apunta TODO a la BD de pruebas.
require('dotenv').config();

const test = process.env.DATABASE_URL_TEST;
if (!test) throw new Error('Falta DATABASE_URL_TEST: las pruebas no usan la BD de desarrollo');
if (test === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST no puede ser igual a DATABASE_URL');

process.env.DATABASE_URL = test;
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.PRECIO_M2_REFERENCIA = '170';
process.env.OVERPASS_URL = 'http://overpass.test/api/interpreter';
process.env.OVERPASS_RADIO_M = '2000';
process.env.OVERPASS_TIMEOUT_MS = '500';
process.env.OVERPASS_REINTENTOS = '2';
process.env.OVERPASS_REINTENTO_ESPERA_MS = '1';
process.env.VALIDAR_VIAS = 'false';        // las pruebas de R3 lo activan y simulan Overpass
process.env.VALIDAR_RATE_MAX = '100000';
