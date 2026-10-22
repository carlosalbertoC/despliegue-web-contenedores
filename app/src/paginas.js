'use strict';

function escaparHtml(valor) {
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function documento(titulo, cuerpo) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtml(titulo)}</title>
  <link rel="stylesheet" href="/estilos.css">
</head>
<body>
  ${cuerpo}
</body>
</html>`;
}

function paginaIngreso(mensaje) {
  const alerta = mensaje
    ? `<p class="alerta" role="alert">${escaparHtml(mensaje)}</p>`
    : '';

  return documento(
    'Iniciar sesión',
    `<main class="marco">
      <section class="presentacion">
        <div class="texto">
          <p class="curso">Cloud Computing</p>
          <h1>Portal de acceso</h1>
          <p>Ingrese su usuario y su contraseña. La aplicación los comprueba contra la base de datos y solo entonces abre la página de bienvenida.</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-contenido">
          <h2>Iniciar sesión</h2>
          ${alerta}
          <form method="post" action="/ingresar" accept-charset="UTF-8" autocomplete="off">
            <label for="usuario">Usuario</label>
            <input id="usuario" name="usuario" required maxlength="50" autocapitalize="none" spellcheck="false" autocomplete="off">
            <label for="clave">Contraseña</label>
            <input id="clave" name="clave" type="password" required maxlength="72" autocomplete="off">
            <button type="submit">Iniciar sesión</button>
          </form>
        </div>
      </section>
    </main>`
  );
}

function paginaBienvenida(cuenta) {
  const nombre = escaparHtml(cuenta.nombre);
  const usuario = escaparHtml(cuenta.usuario);

  return documento(
    `Bienvenido, ${cuenta.nombre}`,
    `<main class="marco">
      <section class="presentacion">
        <div class="texto">
          <p class="curso">Sesión iniciada</p>
          <h1>Bienvenido, ${nombre}</h1>
          <p>La cuenta <strong>${usuario}</strong> fue validada contra la base de datos.</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-contenido">
          <h2>Página protegida</h2>
          <p>Esta vista solo se muestra cuando existe una sesión válida. Al cerrarla, el saludo deja de estar disponible.</p>
          <form method="post" action="/salir">
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </section>
    </main>`
  );
}

function paginaSimple(titulo, texto) {
  return documento(
    titulo,
    `<main class="marco marco-simple">
      <section class="presentacion">
        <div class="texto">
          <p class="curso">Portal de acceso</p>
          <h1>${escaparHtml(titulo)}</h1>
          <p>${escaparHtml(texto)}</p>
          <p><a class="enlace" href="/">Volver al inicio de sesión</a></p>
        </div>
      </section>
    </main>`
  );
}

module.exports = {
  paginaIngreso,
  paginaBienvenida,
  paginaSimple,
};
