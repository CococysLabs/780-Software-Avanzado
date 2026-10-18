# Cómo funciona Keycloak en el proyecto

Keycloak es el **servidor de identidad** (OAuth2 / OpenID Connect). Autentica a los usuarios y emite **JWT** firmados; los microservicios solo los validan.

## 1. Piezas y configuración

| Elemento | Valor | Dónde |
|---|---|---|
| Imagen | `quay.io/keycloak/keycloak:24.0.1`, modo `start-dev` | `docker-compose.yml` |
| Puerto | `8080` | `docker-compose.yml` |
| Consola admin | `admin` / `admin` (`KEYCLOAK_ADMIN*`) | `docker-compose.yml` |
| Base de datos | `keycloak-db` (Postgres 16, host `5433`) | `docker-compose.yml` |
| Realm | `ecommerce-realm` | `issuer-uri` en `config-data/` |
| Cliente | `api-gateway-client` (con *client secret*) | `config-data/api-gateway.yml` |
| Roles de realm | `ADMIN`, `USER` | enum `Role` del gateway |

Consola: <http://localhost:8080> → *Administration Console*.

Configuración manual necesaria tras el primer arranque (la BD es persistente en el volumen `keycloak_data`):

1. Crear el realm **ecommerce-realm**.
2. Crear el cliente **api-gateway-client** (OpenID Connect, *Client authentication* ON → genera el secreto en la pestaña *Credentials*; ese valor va en `client-secret` del YAML).
3. Crear los **Realm roles** `ADMIN` y `USER`.
4. Crear usuarios, ponerles contraseña (*Credentials*, desactivar *Temporary*) y asignarles rol (*Role mapping*).

## 2. Arquitectura de seguridad

```
 ┌──────────┐ 1. login / token      ┌──────────────┐
 │ Cliente  │ ────────────────────▶ │  Keycloak    │
 │          │ ◀──────────────────── │  :8080       │
 └────┬─────┘ 2. JWT (access token) └──────▲───────┘
      │                                     │ 4. claves públicas (JWKS),
      │ 3. Authorization: Bearer <JWT>      │    una vez y en caché
      ▼                                     │
 ┌─────────────┐  5. valida firma, emisor,  │
 │ api-gateway │ ───expiración + roles──────┤
 │   :9000     │                            │
 └──────┬──────┘                            │
        │ 6. reenvía Authorization          │
        ▼                                   │
 ┌───────────────┐ 7. vuelve a validar ─────┘
 │ order-service │    el JWT (resource server)
 │   :8081       │ 8. usa `sub` como userId
 └───────────────┘
```

Es el patrón **OAuth2 Resource Server**: los servicios nunca ven contraseñas ni llaman a Keycloak por cada petición. Verifican la firma del token con la clave pública (JWKS) que descubren desde el `issuer-uri`.

## 3. Paso a paso

### 3.1 Obtener el token

El cliente se autentica contra Keycloak (el flujo exacto depende de cómo se haya configurado el cliente: Postman/OAuth2 authorization code, o *password grant* si está habilitado *Direct access grants*). Ejemplo de referencia:

```bash
curl -X POST http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=api-gateway-client" \
  -d "client_secret=<secreto>" \
  -d "username=<usuario>" -d "password=<clave>"
```

La respuesta incluye `access_token` (JWT). Su payload contiene, entre otros:

```json
{
  "iss": "http://localhost:8080/realms/ecommerce-realm",
  "sub": "b5c1...-uuid-del-usuario",
  "exp": 1760000000,
  "realm_access": { "roles": ["USER"] },
  "scope": "openid profile email"
}
```

Puedes inspeccionarlo en <https://jwt.io>.

### 3.2 API Gateway: validación + autorización

[`SecurityConfig` del gateway](api-gateway/src/main/java/com/ecommerce/api_gateway/config/SecurityConfig.java) (WebFlux):

1. `oauth2ResourceServer().jwt()` valida el token: firma, `iss` = `issuer-uri`, `exp`.
2. Un **converter propio** lee `realm_access.roles` y los convierte en autoridades `ROLE_ADMIN` / `ROLE_USER`. (Spring por defecto solo mira `scope`; Keycloak pone los roles en `realm_access`, por eso hace falta.)
3. Se aplican las reglas por ruta (RBAC):

| Recurso | Quién puede |
|---|---|
| `GET /api/v1/product/**`, `GET /api/v1/inventory/**` | Público (sin token) |
| Resto de `/api/v1/product/**` y `/api/v1/inventory/**` | `ADMIN` |
| `POST /api/v1/order` | `USER` |
| `GET /api/v1/order/**` | `ADMIN` o `USER` |
| `PUT` / `DELETE /api/v1/order/**` | `ADMIN` |
| Cualquier otra | Autenticado |

Resultados: sin token en ruta protegida → **401**; token válido pero rol insuficiente → **403**.

### 3.3 Propagación al servicio destino

El gateway tiene el filtro `TokenRelay` y la cabecera `Authorization: Bearer ...` de la petición original viaja hacia el servicio. (En este proyecto el token ya llega como `Bearer` del cliente, por lo que se reenvía tal cual.)

### 3.4 order-service: segunda validación y uso de identidad

- [`SecurityConfig` de order](order-service/src/main/java/com/ecommerce/order_service/config/SecurityConfig.java): todo requiere autenticación excepto `/actuator/**`; valida el JWT otra vez con el mismo `issuer-uri` (**defensa en profundidad**: no confía ciegamente en el gateway).
- [`OrderController`](order-service/src/main/java/com/ecommerce/order_service/controller/OrderController.java) recibe `@AuthenticationPrincipal Jwt jwt` y usa:
  - `jwt.getSubject()` → **ID del usuario** (`sub`), guardado como dueño del pedido.
  - `realm_access.roles` → si contiene `ADMIN`, `GET /api/v1/order` devuelve **todos** los pedidos; si no, solo los del usuario.

## 4. Quién protege qué

| Servicio | Seguridad |
|---|---|
| api-gateway | ✅ Resource server + RBAC por ruta |
| order-service | ✅ Resource server (solo "autenticado"; el rol se evalúa a mano en el controlador) |
| inventory-service / product-service | ❌ Sin Spring Security: confían en que el tráfico viene del gateway |
| notification-service | ❌ Solo consume mensajes de RabbitMQ |
| config-server / discovery-server | ❌ Sin seguridad |

## 5. Puntos a revisar

- **Acceso directo:** inventory (`8082`) y product exponen sus puertos sin autenticación; quien llegue directo se salta el gateway. En producción, restringir por red o añadir resource server en cada uno.
- **Login interactivo del gateway:** el YAML define un `registration` OAuth2 (`authorization_code`, `redirect-uri`), pero `SecurityConfig` solo configura `oauth2ResourceServer`, no `oauth2Login`. Es decir, el gateway **no** hace el redirect a Keycloak por sí mismo: espera que el cliente llegue ya con token. El `client-secret` no se usa en ese flujo.
- **Roles en order-service:** la autoridad por defecto sale de `scope` (`SCOPE_*`), no de `realm_access`; por eso el rol se comprueba manualmente. Reutilizar el converter del gateway lo unificaría (y permitiría `@PreAuthorize`).
- **`issuer-uri` = `localhost:8080`:** si los servicios corren en Docker, `localhost` apuntaría al propio contenedor; hay que usar el nombre del servicio y mantener el `iss` coherente con el que emite Keycloak.
- **Secretos en texto plano:** `client-secret` en `config-data/api-gateway.yml`. Moverlo a variable de entorno / gestor de secretos y rotar el actual.
- **`start-dev`:** modo desarrollo (HTTP, sin hardening). No usar en producción.
- **Arranque:** los servicios que usan `issuer-uri` consultan Keycloak al iniciar o en la primera petición; Keycloak debe estar levantado antes.
