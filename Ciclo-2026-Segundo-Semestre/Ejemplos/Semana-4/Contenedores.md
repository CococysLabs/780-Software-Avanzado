# Docker y Docker Compose – products-app

Explicación de cómo funcionan los Dockerfile y el `docker-compose.yml` ubicado en [products-app/](products-app/docker-compose.yml).

## 1. Estructura

```
Microservicios/
└── products-app/
    ├── docker-compose.yml   ← orquesta todos los contenedores
    ├── api-gateway/         ← API HTTP (puerto 3000)
    │   └── dockerfile
    ├── products-ms/         ← microservicio de productos (puerto 3001)
    │   └── dockerfile
    └── auth/                ← microservicio de autenticación (puerto 3002)
        └── dockerfile
```

## 2. Arquitectura

```
Cliente HTTP ──► api-gateway :3000 ──► nats-server :4222 ──► products-ms
                                                         └─► auth-ms
                                                              │
                                              (ambos ► Postgres en Neon, en la nube)
```

* Solo el **api-gateway** se publica hacia tu máquina (`localhost:3000`).
* `products-ms` y `auth-ms` **no exponen puertos**: se comunican por NATS dentro de la red de Compose.
* La base de datos **no** corre en Docker; es PostgreSQL en Neon (se configura por variables de entorno).

## 3. Los Dockerfile

Los tres son casi idénticos (imagen base `node:24.11-alpine3.23`):

```dockerfile
FROM node:24.11-alpine3.23      # imagen base ligera con Node
WORKDIR /usr/src/app            # carpeta de trabajo dentro del contenedor
COPY package*.json ./           # primero solo los package.json (aprovecha la caché de capas)
RUN npm install                 # instala dependencias
COPY . .                        # luego se copia el código
EXPOSE <puerto>                 # documenta el puerto (3000/3001/3002 según el servicio)
CMD ["npm", "run", "start:dev"] # arranca NestJS en modo desarrollo (watch)
```

Copiar `package.json` antes que el código hace que `npm install` solo se vuelva a ejecutar cuando cambian las dependencias.

## 4. El docker-compose.yml, servicio por servicio

| Servicio | Origen | Puertos | Notas |
|---|---|---|---|
| `nats-server` | imagen `nats:latest` | `8222:8222` | Broker de mensajes. 8222 = monitoreo (http://localhost:8222). El 4222 (clientes) solo es accesible dentro de la red de Compose. |
| `api-gateway` | `build: ./api-gateway` | `3000:3000` | Único punto de entrada HTTP. |
| `products-ms` | `build: ./products-ms` | ninguno | Escucha mensajes NATS; usa BD Neon. |
| `auth-ms` | `build: ./auth` | ninguno | Escucha mensajes NATS; usa BD Neon y `JWT_SECRET`. |

Opciones usadas en los servicios Node:

* **`build`**: construye la imagen a partir del Dockerfile de esa carpeta.
* **`volumes`** (`./<servicio>/src:/usr/src/app/src`): monta tu código fuente dentro del contenedor. Al guardar un archivo, `npm run start:dev` recompila automáticamente (hot reload) sin reconstruir la imagen.
* **`command: npm run start:dev`**: sobrescribe el `CMD` del Dockerfile (aquí es igual).
* **`environment`**: variables de entorno que reemplazan al archivo `.env`.
* **Red**: Compose crea una red común; cada servicio es alcanzable por su **nombre** (por eso `NATS_SERVERS=nats://nats-server:4222`).

### Variables de entorno

| Variable | Servicios | Descripción |
|---|---|---|
| `PORT` | todos | Puerto interno de la app |
| `NATS_SERVERS` | todos | `nats://nats-server:4222` |
| `DB_HOST_USER`, `DB_PORT`, `DB_USER`, `DB_PW`, `DB_NAME` | products-ms, auth-ms | Conexión a PostgreSQL (Neon) |
| `JWT_SECRET` | auth-ms | Clave para firmar los JWT |

Las plantillas están en los `.env.template` de cada servicio (para ejecutar sin Docker).

## 5. Comandos

Ejecutar desde `Microservicios/products-app`:

```bash
docker compose up --build        # construye imágenes y levanta todo
docker compose up -d             # en segundo plano
docker compose logs -f api-gateway   # ver logs de un servicio
docker compose ps                # estado de los contenedores
docker compose restart products-ms   # reiniciar un servicio
docker compose down              # detener y eliminar contenedores y red
docker compose build --no-cache  # reconstruir imágenes desde cero
```

Reconstruye (`--build`) cuando cambies `package.json` o un Dockerfile; los cambios en `src/` no lo necesitan gracias al volumen.

Pruebas rápidas: `http://localhost:3000` (API) y `http://localhost:8222` (monitoreo NATS).

## 6. Observaciones importantes

* **Credenciales en el compose**: `DB_PW` y `JWT_SECRET` están escritos en claro en `docker-compose.yml`. Para subir el repo a Git, muévelos a un archivo `.env` (ignorado por Git) y referéncialos como `${DB_PW}` o con `env_file:`. Si ya se publicaron, conviene rotar las contraseñas de Neon.
* **Modo desarrollo**: se usa `start:dev` y el código se monta por volumen; para producción conviene un Dockerfile multi-etapa con `npm run build` y `node dist/main`.
* **`EXPOSE` del api-gateway** dice 3001 pero la app corre en 3000. No afecta (el mapeo real es `3000:3000` en Compose), pero conviene corregirlo a 3000.
* Los archivos se llaman `dockerfile` (minúscula); en Windows funciona, en Linux/macOS Docker espera `Dockerfile` por defecto.
* Para Kubernetes/Helm ver [HELM-K8S.md](HELM-K8S.md); para la comunicación NATS ver [NATS-CONEXION.md](NATS-CONEXION.md).
