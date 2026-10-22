'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function crearPool() {
  const comun = {
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    query_timeout: 5000,
    application_name: 'portal-acceso',
  };

  const url = (process.env.DATABASE_URL || '').trim();
  if (url) {
    console.log('Conexión a PostgreSQL mediante DATABASE_URL');
    return new Pool({ connectionString: url, ...comun });
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = Number(process.env.PGPORT || 5432);

  if (!host || !user || !password || !database) {
    throw new Error(
      'Defina DATABASE_URL o las variables PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE'
    );
  }

  console.log(`Conexión a PostgreSQL en ${host}:${port}/${database}`);
  return new Pool({ host, port, user, password, database, ...comun });
}

function esperar(ms) {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}

async function esperarBase(pool) {
  let ultimoError = new Error('sin detalle');

  for (let intento = 1; intento <= 30; intento += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      ultimoError = error;
      console.log(`PostgreSQL aún no responde (intento ${intento}/30)`);
      await esperar(2000);
    }
  }

  throw new Error(`No se pudo conectar a PostgreSQL: ${ultimoError.message}`);
}

async function aplicarEsquema(pool) {
  const ruta = path.join(__dirname, '..', 'db', 'init.sql');
  const sql = fs.readFileSync(ruta, 'utf8');
  await pool.query(sql);
  console.log('Esquema de usuarios verificado');
}

async function iniciarBase(pool) {
  await esperarBase(pool);
  await aplicarEsquema(pool);
}

// $1 viaja aparte del texto SQL. El valor no se concatena a la consulta.
async function buscarUsuario(pool, usuario) {
  const resultado = await pool.query(
    `SELECT id, usuario, hash_contrasena, nombre
       FROM usuarios
      WHERE usuario = $1`,
    [usuario]
  );
  return resultado.rows[0] || null;
}

module.exports = {
  crearPool,
  iniciarBase,
  buscarUsuario,
};
