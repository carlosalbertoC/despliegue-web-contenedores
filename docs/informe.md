# Despliegue de una aplicación web con base de datos en contenedores

**Facultad de Ingeniería e Inteligencia Artificial**  
**Curso:** Cloud Computing  
**Actividad calificada, semana 10**

| Dato | Valor |
| --- | --- |
| Integrantes | Completar nombre y código de cada integrante del grupo |
| Fecha | Octubre de 2026 |
| URL pública (HTTPS) | Completar con la URL de Blitz Cloud |
| Repositorio | Completar con el enlace de GitHub |
| Imagen | `USUARIO/portal-acceso:1.0.0` en Docker Hub |

## 1. Arquitectura

La solución separa la entrada pública, la lógica de acceso y el almacenamiento. En local hay tres contenedores. En Blitz Cloud el proxy y la base administrada los resuelve la plataforma, y la imagen de la aplicación es la misma.

```text
Usuario
   |  HTTP, puerto 80
   v
Nginx 1.27.5                 red web, único puerto publicado
   |
   v
Aplicación Node.js 22        red web y red datos, sin puerto en el host
   |
   v
PostgreSQL 17.6              red datos, sin puerto público
   |
   +-- volumen pgdata
```

El diagrama está en `docs/arquitectura.svg`.

En la nube la entrada cambia de forma:

```text
Usuario -- HTTPS --> Blitz Cloud --> contenedor portal-acceso:1.0.0
                                         |
                                         | DATABASE_URL, red interna de la cuenta
                                         v
                                    PostgreSQL 17 administrado
                                    sin dirección pública
```

### Decisiones

**Tres procesos en local.** El proxy, la aplicación y la base tienen ciclos de vida distintos. Nginx puede cambiar de configuración sin reconstruir la aplicación. La base se recrea sin perder datos porque el directorio de PostgreSQL está en un volumen, no en la capa escribible del contenedor. La aplicación se reemplaza publicando otra etiqueta de la imagen.

**Dos redes.** `web` une al proxy con la aplicación. `datos` une a la aplicación con PostgreSQL. El servicio `db` no está en `web` y no tiene `ports` en Compose, así que no es alcanzable desde el navegador ni desde Nginx. Solo el proceso de la aplicación abre conexiones hacia el puerto 5432 interno.

**PostgreSQL 17.6.** La opción A de la actividad usa PostgreSQL 17 administrado. En local se fijó la misma versión mayor, con la etiqueta `17.6` y no `latest`, para que el script SQL y el cliente `pg` se comporten igual en los dos entornos.

**Node.js y Express.** La aplicación es un solo proceso HTTP. Express recibe el formulario, express-session guarda la sesión y `pg` ejecuta la consulta. El algoritmo de las contraseñas es bcrypt, mediante la biblioteca `bcryptjs`, que no necesita compilación nativa dentro de la imagen.

**La aplicación también aplica el esquema.** La imagen oficial de PostgreSQL ejecuta `docker-entrypoint-initdb.d` solo cuando el volumen está vacío. Blitz no usa ese entrypoint: entrega una base vacía y la variable `DATABASE_URL`. Por eso `app/src/datos.js` lee `app/db/init.sql` al arrancar. El script crea la tabla si no existe e inserta las cuentas con `ON CONFLICT (usuario) DO NOTHING`. En local puede ejecutarse dos veces (entrypoint y aplicación) sin duplicar filas. En Blitz se ejecuta una vez, al iniciar el contenedor.

**Nginx no sirve el HTML.** El formulario cambia según el resultado del acceso (error, sesión ya iniciada, campos vacíos). Esa decisión depende de la aplicación y de la base. Nginx queda como único punto de entrada: termina la conexión del navegador y reenvía a `app:3000`. En Blitz ese papel lo cumple la plataforma, que además termina TLS. Por eso el contenedor de Nginx no se despliega en la nube, tal como indica la opción A.

## 2. Opción de despliegue

Se eligió la **opción A (Blitz Cloud)**.

La rúbrica pide la arquitectura de tres contenedores en el entorno local y, en la nube, una URL HTTPS con la base fuera de internet. La opción A cumple las dos cosas: Compose demuestra proxy, aplicación, base, redes y volumen; Blitz ejecuta la imagen propia y conecta PostgreSQL 17 sin dirección pública. El plan gratuito no pide tarjeta, incluye una base y entrega el certificado HTTPS. La opción B exige una máquina virtual en AWS, Azure o Google Cloud, abre el puerto del proxy en un grupo de seguridad y suele pedir tarjeta o créditos que vencen. Para esta entrega, el servicio administrado reduce la operación de la base (respaldos nocturnos, red privada) y deja el esfuerzo en la imagen, el esquema y el control de acceso.

La limitación se acepta a cambio: la aplicación del plan gratuito se suspende tras 30 minutos sin tráfico y hay que abrir la URL antes de la sustentación. La memoria del plan es reducida (la base reserva 128 MB de un conjunto de 512 MB). Con un solo proceso Node y un pool de cinco conexiones, el tamaño cabe en ese límite.

## 3. Servicios y herramientas

| Nombre | Rol | Versión o imagen |
| --- | --- | --- |
| Nginx | Proxy inverso y único puerto público en local | `nginx:1.27.5-alpine`, configuración del grupo |
| Node.js | Runtime de la aplicación | `node:22.23.1-bookworm-slim` |
| Express | HTTP, formulario y redirecciones | 4.22.3 |
| express-session | Cookie de sesión firmada | 1.19.0 |
| pg | Cliente PostgreSQL y consultas parametrizadas | 8.23.1 |
| bcryptjs | Hash bcrypt, factor de costo 12 | 2.4.3 |
| PostgreSQL local | Usuarios y hashes, volumen `pgdata` | `postgres:17.6` |
| PostgreSQL en Blitz | Base administrada, solo visible por la aplicación | PostgreSQL 17 |
| Docker Compose | Redes `web` y `datos`, volumen, salud de los servicios y variables | Compose v2 |
| Docker Hub | Registro de `portal-acceso:1.0.0` | etiqueta `1.0.0`, arquitectura `linux/amd64` |
| Blitz Cloud | Ejecución de la imagen, HTTPS y base administrada | plan gratuito |

## 4. Pasos del despliegue

Los comandos se ejecutan en la raíz del repositorio. Las capturas de cada paso se insertan al final, en el anexo.

### 4.1 Entorno local

```bash
cp .env.example .env
```

Se completan `POSTGRES_PASSWORD` y `SESSION_SECRET` en `.env`. Ese archivo no entra al repositorio.

```bash
docker compose up -d --build
docker compose ps
```

Deben verse `proxy`, `app` y `db` en ejecución. En `docker compose ps` la base no muestra un puerto del host. El proxy muestra `0.0.0.0:80->80/tcp`.

### 4.2 Pruebas funcionales

Se abre http://localhost/ y se inicia sesión con `ana.garcia` / `Nube-Ana-2026`. La respuesta es la página **Bienvenido, Ana García**.

Se cierra la sesión y se envía una contraseña incorrecta. El formulario informa que el usuario o la contraseña no son correctos.

En una ventana sin cookie se abre http://localhost/bienvenida. La aplicación responde 302 hacia `/?e=3` y el formulario pide iniciar sesión. El HTML de la bienvenida no viaja en esa respuesta.

### 4.3 Hash y persistencia

```bash
docker compose exec db psql -U portal -d portal \
  -c "SELECT usuario, nombre, hash_contrasena FROM usuarios;"
```

```bash
docker compose stop db
docker compose rm -f db
docker compose up -d
docker compose restart app
docker compose exec db psql -U portal -d portal \
  -c "SELECT usuario, nombre FROM usuarios;"
```

`restart app` solo recicla el proceso web. Los datos están en el volumen, no en ese contenedor. Tras recrear `db`, `ana.garcia` y `luis.torres` siguen en la tabla.

### 4.4 Imagen en Docker Hub

```bash
docker login -u USUARIO
docker build --platform linux/amd64 -t USUARIO/portal-acceso:1.0.0 ./app
docker image inspect USUARIO/portal-acceso:1.0.0 --format '{{.Architecture}}'
docker push USUARIO/portal-acceso:1.0.0
```

La inspección debe devolver `amd64`. El login usa un access token de Docker Hub, que no se escribe en el repositorio ni en el Dockerfile.

### 4.5 Blitz Cloud

1. **Host something new** → **An app from Docker Hub**.
2. Imagen `USUARIO/portal-acceso`, etiqueta `1.0.0`, puerto **3000**.
3. Base de datos **PostgreSQL**. La plataforma define `DATABASE_URL`. La base no tiene dirección pública.
4. Variables de la aplicación: `SESSION_SECRET` (distinto del local) y `COOKIE_SECURE=true`.
5. Se publica y se anota la URL HTTPS.
6. Se repiten las pruebas de acceso válido, acceso inválido y apertura directa de `/bienvenida`.

Al arrancar, la aplicación ejecuta `init.sql` sobre la base administrada. Las mismas dos cuentas de prueba quedan disponibles.

## 5. Seguridad

**Contraseñas.** `init.sql` no contiene la clave en claro. Guarda un hash bcrypt de 60 caracteres con sal propia y factor 12. `bcrypt.compare` verifica el formulario contra ese hash. Si el usuario no existe, se compara igualmente contra un hash de relleno para no delatar, por el tiempo de respuesta, si la cuenta está en la tabla. El mensaje de rechazo es único: «Usuario o contraseña incorrectos.»

**Consultas.** El usuario del formulario viaja como parámetro `$1`. No se concatena al texto SQL. Un valor como `' OR 1=1 --` se busca como texto literal y no altera la consulta.

**Secretos.** La clave de PostgreSQL y `SESSION_SECRET` entran por variables de entorno. En local las inyecta Compose desde `.env`. En Blitz, `DATABASE_URL` la inyecta la plataforma y el secreto de sesión se escribe en el panel. El Dockerfile no declara esas variables con valores. El contexto de `docker build` es `app/`, así que `.env` ni siquiera está en la carpeta que se copia.

**Red y puertos.** En Compose solo Nginx publica el puerto 80. PostgreSQL no tiene `ports`. Está únicamente en la red `datos`. La aplicación escucha en `0.0.0.0:3000` dentro de su red; ese puerto no se mapea al host. En Blitz el único acceso externo es el HTTPS de la plataforma, y la base permanece sin dirección pública.

**Sesión.** La cookie `portal.sid` es `httpOnly` y `SameSite=Lax`. El identificador se regenera al entrar, para no reutilizar el de la visita anónima. La página `/bienvenida` redirige si `req.session.usuario` no existe. Cerrar sesión destruye la sesión y borra la cookie. En local `COOKIE_SECURE` queda en `false` porque el proxy habla HTTP. En Blitz se pone en `true`: el navegador solo envía la cookie por HTTPS, aunque Node reciba la petición ya descifrada por la plataforma. `trust proxy` está activo para respetar `X-Forwarded-*` detrás de Nginx o de Blitz.

**Otras medidas de la aplicación.** Las respuestas llevan `nosniff`, `X-Frame-Options: DENY` y una política de contenido que solo admite el propio origen. El nombre de la persona se escapa al escribir el HTML. El POST de acceso responde 303 y el navegador pide la bienvenida con GET, de modo que recargar no reenvía la contraseña. Nginx anuncia un cuerpo máximo de 8 KB y oculta su versión (`server_tokens off`).

La sesión vive en memoria del proceso. Sirve para una sola instancia. Si se escalara a varias réplicas, haría falta un almacén de sesión compartido. No forma parte del alcance de esta entrega.

## 6. Problemas y cómo se resolvieron

**Arquitectura de la imagen.** Una construcción hecha en Apple Silicon queda en `arm64`. Blitz ejecuta `linux/amd64`. El comando de publicación fija `--platform linux/amd64` y se comprueba con `docker image inspect` antes del `push`. El `docker compose build` local puede seguir en la arquitectura de la laptop; esa imagen local no es la que se sube.

**Inicialización de la base.** Si el esquema dependiera solo del entrypoint oficial, en Blitz la tabla no existiría, y en local desaparecería la posibilidad de recrear el esquema cuando el volumen ya tiene datos de un intento anterior fallido. Un único `init.sql`, idempotente, corre en el entrypoint (volumen vacío) y en cada arranque de la aplicación.

**El carácter `$` del hash.** Un hash bcrypt contiene signos de dólar (`$2a$12$...`). Dentro de comillas simples PostgreSQL los trata como texto. La consulta de acceso no interpola ese hash ni la contraseña: usa `$1` como parámetro, que el protocolo envía separado del enunciado.

**Cookie Secure.** Si `COOKIE_SECURE=true` en local, el navegador no guarda la cookie porque el sitio es HTTP y el ingreso parece no tener efecto. Por eso el valor es `false` en `.env` y `true` solo en Blitz.

**Puerto 80 ocupado.** El contenedor sigue escuchando en 80, que es el puerto exigido al proxy. Si el host no puede publicarlo, el mapeo se cambia a `8080:80` sin tocar la red interna.

## 7. Costos, límites y limpieza

En local el costo de nube es cero. Docker solo consume CPU, memoria y disco de la máquina del grupo.

En Blitz el plan gratuito incluye una base PostgreSQL. Esa base reserva 128 MB de los 512 MB de memoria del plan y 1 GB de almacenamiento. Cada noche se copia fuera del servidor de la aplicación y el plan conserva siete copias. No se puede conectar a esa base desde la laptop con `psql`; por eso el hash se muestra en el PostgreSQL local. La aplicación se duerme a los 30 minutos sin visitas y la primera petición después de eso tarda más.

No se eligió una máquina virtual de AWS, Azure o Google Cloud. Esos créditos vencen y, si los recursos siguen creados, pueden generar cobro. Aun así, al terminar la exposición hay que borrar lo que sí se creó:

1. En Blitz, eliminar la aplicación y, cuando lo pregunte, eliminar también la base y sus copias.
2. En la laptop o en el Codespace, `docker compose down`. Cuando ya no haga falta demostrar el volumen, `docker compose down -v`.
3. Detener el Codespace si se usó.

Los usuarios de prueba son ficticios. Conviene no dejar la URL pública activa después de la sustentación, porque las contraseñas de demostración están en este informe y en el README.

## 8. Conclusiones

La imagen propia concentra el runtime y el código. La misma etiqueta `1.0.0` puede ejecutarse en la laptop, en un Codespace o en Blitz. Esa es la portabilidad que se busca al empaquetar una aplicación de nube nativa: el entorno de destino no tiene que instalar Node.js ni las bibliotecas a mano.

La base ilustra la diferencia entre un servicio autogestionado y uno administrado. En local el grupo elige la versión, el volumen, la red y el respaldo (el volumen protege del recreado del contenedor, no de la pérdida del disco). En Blitz la plataforma opera PostgreSQL 17, lo aísla de internet y hace la copia nocturna. La aplicación no cambia de código: solo cambia de dónde lee la conexión (`PGHOST` y variables afines, o `DATABASE_URL`).

El plan gratuito se comporta como un acuerdo de límites, no como capacidad infinita. Hay un tope de memoria, una sola base y suspensión por inactividad. Escalar de verdad exigiría más de una instancia y una sesión compartida. Hoy hay una instancia, y el diseño lo deja dicho en lugar de simular un clúster que la entrega no pide.

El acceso queda cerrado por capas. El proxy es la única puerta local. La base no tiene puerto público. La contraseña no se guarda en claro. La página de bienvenida no existe para quien no tiene sesión. Esas cuatro decisiones son las que la demostración tiene que volver visibles.

## 9. Referencias

Blitz Cloud. (2026, 26 de septiembre). *Deploy an app with a PostgreSQL database*. https://blitz.cloud/guides/deploy-app-with-postgres/

Blitz Cloud. (s. f.). *Deploy a Docker container for free*. https://blitz.cloud/guides/deploy-docker-container-free/

Docker Inc. (s. f.). *Docker documentation*. https://docs.docker.com/

Docker Inc. (s. f.). *nginx*. Docker Hub. https://hub.docker.com/_/nginx

Docker Inc. (s. f.). *postgres*. Docker Hub. https://hub.docker.com/_/postgres

Joyanes Aguilar, L. (2022). *Computación en la nube: Estrategias de cloud computing en organizaciones y empresas* (2.ª ed.). Alfaomega. Capítulo 9.

Node.js. (s. f.). *Node.js documentation*. https://nodejs.org/docs/latest-v22.x/api/

OpenJS Foundation. (s. f.). *Express*. https://expressjs.com/

OWASP. (s. f.). *Password storage cheat sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

node-postgres. (s. f.). *Queries*. https://node-postgres.com/features/queries

## Anexo. Capturas que faltan por tomar

Insertar cada imagen debajo de su número, con el comando o la pantalla todavía visibles.

1. `docker compose ps` con los tres servicios en ejecución y sin puerto publicado en `db`.
2. Formulario de inicio de sesión en http://localhost/.
3. Página **Bienvenido, Ana García** tras un acceso válido.
4. Mensaje de rechazo con una contraseña incorrecta.
5. Apertura directa de `/bienvenida` sin sesión, de vuelta en el formulario.
6. Resultado de `SELECT usuario, nombre, hash_contrasena FROM usuarios;`.
7. El mismo `SELECT` de usuarios después de recrear el contenedor `db`.
8. `docker image inspect` mostrando `amd64` y la página de la etiqueta `1.0.0` en Docker Hub.
9. Panel de Blitz con la aplicación y la base PostgreSQL asociada.
10. URL pública HTTPS: formulario, acceso válido, acceso inválido y `/bienvenida` sin sesión.
