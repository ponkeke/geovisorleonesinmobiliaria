require('dotenv').config();
const { Pool, types } = require('pg');

// NUMERIC (oid 1700) llega como string por defecto; lo devolvemos como número.
types.setTypeParser(1700, parseFloat);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
