# Portal de acceso

Aplicación web con inicio de sesión. El usuario y la contraseña se validan contra PostgreSQL. La página de bienvenida solo se muestra si la sesión es válida.

El entorno local usa tres contenedores orquestados con Docker Compose:

- **proxy**: Nginx 1.27.5, único puerto publicado (80).
- **app**: imagen propia de Node.js. Escucha en el puerto 3000, sin publicarlo al host.
- **db**: PostgreSQL 17.6, imagen oficial, sin puerto público y con volumen persistente.

En la nube (opción A) se publica solo la imagen de la aplicación en Blitz Cloud. La plataforma entrega el HTTPS y una base PostgreSQL 17 administrada. El Compose de tres contenedores se conserva para la demostración local.

## Requisitos

- Docker Desktop o Docker Engine con Compose v2.
- Una cuenta de Docker Hub para publicar la imagen.
- Una cuenta de Blitz Cloud para la URL pública con HTTPS.

## Configuración

Desde la raíz del repositorio:

```bash
cp .env.example .env
```

Edite `.env` y cambie `POSTGRES_PASSWORD` y `SESSION_SECRET`. El secreto de sesión debe tener al menos 24 caracteres. Ese archivo no se sube a Git: está en `.gitignore` y el contexto de construcción de la imagen es solo la carpeta `app/`.

## Ejecución local

```bash
docker compose up -d --build
docker compose ps
```

Abra http://localhost/

El contenedor del proxy escucha en el puerto 80. Si ese puerto ya está ocupado en la máquina, cambie en `docker-compose.yml` la línea `"80:80"` por `"8080:80"` y use http://localhost:8080/

Para ver los registros:

```bash
docker compose logs -f app
```

Al arrancar, Express escribe un aviso: la sesión vive en memoria y no escala a varios procesos. Es el comportamiento previsto de esta entrega, que usa una sola instancia.

Para detener los contenedores sin borrar los datos:

```bash
docker compose down
```

`docker compose down -v` elimina el volumen. No lo use si va a demostrar que los usuarios persisten.

## Usuarios de prueba

Son datos ficticios. No reutilice estas contraseñas en ningún otro servicio.

| Usuario | Contraseña | Nombre en el saludo |
| --- | --- | --- |
| ana.garcia | Nube-Ana-2026 | Ana García |
| luis.torres | Nube-Luis-2026 | Luis Torres |

El usuario se acepta en mayúsculas o minúsculas. La contraseña distingue mayúsculas.

## Comprobaciones

1. Entre con `ana.garcia` y `Nube-Ana-2026`. Debe aparecer **Bienvenido, Ana García**.
2. Cierre la sesión e intente una contraseña incorrecta. El formulario muestra el rechazo y no abre la bienvenida.
3. En una ventana privada, abra http://localhost/bienvenida. Debe volver al formulario con el aviso de que hace falta iniciar sesión.
4. Muestre que la base no guarda la contraseña en claro:

```bash
docker compose exec db psql -U portal -d portal -c "SELECT usuario, nombre, hash_contrasena FROM usuarios;"
```

El valor de `hash_contrasena` empieza por `$2a$12$`. Si cambió `POSTGRES_USER` o `POSTGRES_DB` en `.env`, use esos nombres en lugar de `portal`.

5. Recree solo el contenedor de la base y compruebe que las cuentas siguen:

```bash
docker compose stop db
docker compose rm -f db
docker compose up -d
docker compose restart app
docker compose exec db psql -U portal -d portal -c "SELECT usuario, nombre FROM usuarios;"
```

El volumen `pgdata` no se borra al eliminar el contenedor. El script de `docker-entrypoint-initdb.d` no vuelve a correr porque el directorio de datos ya existe. La aplicación, además, aplica `app/db/init.sql` al arrancar con `ON CONFLICT DO NOTHING`, así el mismo script sirve en Blitz Cloud, donde no hay entrypoint de PostgreSQL.

## Publicar la imagen

La imagen que se sube a Docker Hub tiene que ser `linux/amd64`, también si la laptop es Apple Silicon. Constrúyala desde la raíz del repositorio, con un access token de Docker Hub. No guarde el token en el repositorio ni en la imagen.

```bash
docker login -u USUARIO
docker build --platform linux/amd64 -t USUARIO/portal-acceso:1.0.0 ./app
docker image inspect USUARIO/portal-acceso:1.0.0 --format '{{.Architecture}}'
docker push USUARIO/portal-acceso:1.0.0
```

`docker image inspect` debe imprimir `amd64`. La etiqueta de la entrega es `1.0.0`.

## Despliegue en Blitz Cloud

1. En el panel, elija **Host something new** y luego **An app from Docker Hub**.
2. Seleccione la imagen `USUARIO/portal-acceso` y la etiqueta `1.0.0`.
3. Indique que la aplicación escucha en el puerto **3000**.
4. Active la base de datos y deje el motor en **PostgreSQL**. La plataforma inyecta `DATABASE_URL`. La base no tiene dirección pública.
5. Defina estas variables de la aplicación:
   - `SESSION_SECRET`: una cadena distinta a la del `.env` local, de 24 caracteres o más.
   - `COOKIE_SECURE`: `true`.
6. No hace falta completar `PGHOST`, `PGUSER`, `PGPASSWORD` ni `PGDATABASE` si `DATABASE_URL` quedó configurada. La aplicación usa `DATABASE_URL` primero.
7. Publique la aplicación y abra la URL HTTPS.
8. El primer arranque crea la tabla `usuarios` y las dos cuentas de prueba.

La aplicación del plan gratuito se duerme tras 30 minutos sin visitas. Ábrala unos minutos antes de la exposición.

En Blitz no se despliega el contenedor de Nginx: el HTTPS lo termina la plataforma. La arquitectura de tres contenedores, las dos redes y el volumen se demuestran en local con los comandos de este archivo.

## Qué no debe subirse a GitHub

- El archivo `.env`.
- Tokens de Docker Hub.
- Contraseñas reales. Las de la tabla de arriba son solo de la demostración; la clave de PostgreSQL y `SESSION_SECRET` viven en `.env` y en el panel de Blitz.

Antes del primer commit:

```bash
git status
```

`.env` no debe aparecer en la lista. `node_modules/` tampoco.

## Estructura

```text
docker-compose.yml          tres servicios, redes web y datos, volumen pgdata
nginx/Dockerfile            imagen del proxy, basada en nginx:1.27.5-alpine
nginx/nginx.conf            reenvío hacia app:3000
app/Dockerfile              imagen propia, Node.js 22.23.1, linux/amd64 al publicarla
app/src/servidor.js         formulario, sesión y página protegida
app/src/datos.js            conexión, esquema y consulta parametrizada
app/src/paginas.js          HTML del formulario y de la bienvenida
app/db/init.sql             tabla usuarios y dos cuentas con hash
app/public/estilos.css
.env.example                plantilla sin secretos
docs/informe.md             informe técnico
docs/presentacion.html      presentación de la sustentación
docs/arquitectura.svg       diagrama de la arquitectura local
```
