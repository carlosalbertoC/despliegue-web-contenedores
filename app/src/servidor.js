'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const { crearPool, iniciarBase, buscarUsuario } = require('./datos');
const { paginaIngreso, paginaBienvenida, paginaSimple } = require('./paginas');

const MENSAJES = {
  1: 'Ingrese el usuario y la contraseña.',
  2: 'Usuario o contraseña incorrectos.',
  3: 'Debe iniciar sesión para ver la página de bienvenida.',
  4: 'No se pudo validar el acceso. Intente de nuevo.',
};

function exigirSecreto() {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 24) {
    throw new Error('Defina SESSION_SECRET con al menos 24 caracteres');
  }
  return secreto;
}

function cookieSegura() {
  return process.env.COOKIE_SECURE === 'true';
}

function exigirSesion(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect(302, '/?e=3');
  }
  return next();
}

function codigoError(valor) {
  return typeof valor === 'string' ? valor : '';
}

async function main() {
  const secreto = exigirSecreto();
  const pool = crearPool();
  await iniciarBase(pool);

  // Si el usuario no existe se compara contra un hash válido
  // para que el tiempo de respuesta no revele si la cuenta existe.
  const hashFicticio = await bcrypt.hash('clave-ficticia-de-relleno', 12);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    );
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use(session({
    name: 'portal.sid',
    secret: secreto,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSegura(),
      path: '/',
      maxAge: 30 * 60 * 1000,
    },
  }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/salud', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ estado: 'ok' });
    } catch (error) {
      console.error(error.message);
      res.status(503).json({ estado: 'no-disponible' });
    }
  });

  app.get('/', (req, res) => {
    if (req.session.usuario) {
      return res.redirect(302, '/bienvenida');
    }
    const mensaje = MENSAJES[codigoError(req.query.e)] || '';
    return res.type('html').send(paginaIngreso(mensaje));
  });

  app.post('/ingresar', async (req, res) => {
    const cuerpo = req.body || {};
    const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
    const clave = String(cuerpo.clave || '');

    if (!usuario || !clave) {
      return res.redirect(303, '/?e=1');
    }

    if (usuario.length > 50 || clave.length > 72) {
      return res.redirect(303, '/?e=2');
    }

    try {
      const registro = await buscarUsuario(pool, usuario);
      const hash = registro ? registro.hash_contrasena : hashFicticio;
      const coincide = await bcrypt.compare(clave, hash);

      if (!registro || !coincide) {
        console.log('Acceso rechazado');
        return res.redirect(303, '/?e=2');
      }

      req.session.regenerate((error) => {
        if (error) {
          console.error(error.message);
          return res.redirect(303, '/?e=4');
        }

        req.session.usuario = {
          id: registro.id,
          usuario: registro.usuario,
          nombre: registro.nombre,
        };

        req.session.save((errorGuardar) => {
          if (errorGuardar) {
            console.error(errorGuardar.message);
            return res.redirect(303, '/?e=4');
          }
          console.log(`Acceso concedido a ${registro.usuario}`);
          return res.redirect(303, '/bienvenida');
        });
      });
    } catch (error) {
      console.error('Fallo al validar el acceso:', error.message);
      return res.redirect(303, '/?e=4');
    }
  });

  app.get('/bienvenida', exigirSesion, (req, res) => {
    res.type('html').send(paginaBienvenida(req.session.usuario));
  });

  app.post('/salir', (req, res, next) => {
    const opciones = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSegura(),
    };

    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('portal.sid', opciones);
      return res.redirect(303, '/');
    });
  });

  app.use((req, res) => {
    res
      .status(404)
      .type('html')
      .send(paginaSimple('Página no encontrada', 'La dirección solicitada no existe.'));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error.message);
    res
      .status(500)
      .type('html')
      .send(paginaSimple('No se pudo completar la solicitud', 'Intente de nuevo en unos segundos.'));
  });

  const puerto = Number(process.env.PORT || 3000);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('PORT no es válido');
  }

  const servidor = app.listen(puerto, '0.0.0.0', () => {
    console.log(`Aplicación escuchando en el puerto ${puerto}`);
  });

  let cerrando = false;
  function cerrar() {
    if (cerrando) return;
    cerrando = true;
    servidor.close(async () => {
      try {
        await pool.end();
      } finally {
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
