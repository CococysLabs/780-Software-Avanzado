# Plataforma E-commerce con Microservicios (Spring Boot 4 / Spring Cloud)

Proyecto de ejemplo de un e-commerce basado en microservicios. Usa **Java 21**, **Spring Boot 4.0.2**, **Spring Cloud**, **Keycloak** para seguridad, **RabbitMQ** para mensajería asíncrona y **Grafana LGTM + OpenTelemetry** para observabilidad.

---

## 1. Vista general

```
                         ┌────────────────────┐
                         │      Keycloak      │  (realm: ecommerce-realm, :8080)
                         │   Emite JWT/OAuth2 │
                         └─────────▲──────────┘
                                   │ valida JWT
Cliente ──► ┌───────────────────────────────────┐
            │  API Gateway (:9000)              │  Seguridad por roles + rutas lb://
            └───┬──────────────┬─────────────┬──┘
                │              │             │
        ┌───────▼─────┐ ┌──────▼──────┐ ┌────▼─────────┐
        │ product-svc │ │  order-svc  │ │ inventory-svc│
        │  (MongoDB)  │ │ (PostgreSQL)│ │   (MySQL)    │
        └─────────────┘ └──────┬──────┘ └────▲─────────┘
                               │ order.placed │ order.confirmed / order.cancelled
                               ▼              │
                         ┌──────────────────────────┐
                         │  RabbitMQ (order-events) │
                         └──────────────┬───────────┘
                                        ▼
                               ┌─────────────────┐
                               │ notification-svc│ ──► correo SMTP
                               └─────────────────┘

 Infraestructura transversal:
   Config Server (:8888)  → entrega la configuración centralizada (carpeta config-data/)
   Discovery Server (:8761, Eureka) → registro y descubrimiento de servicios
   Grafana LGTM (:3000, OTLP :4317/:4318) → trazas, logs y métricas
```

### Tabla de componentes

| Componente | Puerto | Tecnología / Persistencia | Rol |
|---|---|---|---|
| config-server | 8888 | Spring Cloud Config (perfil `native`) | Configuración centralizada |
| discovery-server | 8761 | Netflix Eureka Server | Registro de servicios |
| api-gateway | 9000 | Spring Cloud Gateway (WebFlux) + OAuth2 | Punto de entrada único, seguridad y enrutamiento |
| product-service | (según config) | MongoDB | Catálogo de productos |
| order-service | 8081 | PostgreSQL (`order-db`) | Pedidos, Outbox, publicación de eventos |
| inventory-service | 8082 | MySQL (`inventory-db`) | Stock, reserva/descuento de inventario |
| notification-service | (sin web) | RabbitMQ + JavaMail | Envío de correos al cliente |

---

## 2. Infraestructura (docker-compose.yml)

Levanta las dependencias externas:

| Contenedor | Imagen | Puerto(s) | Uso |
|---|---|---|---|
| mongodb | mongo:7.0.4 | 27017 | BD de `product-service` (usuario `root` / `password`) |
| inventory-db | mysql:8 | 3306 | BD de `inventory-service` |
| order-db | postgres:16-alpine | 5432 | BD de `order-service` (`admin`/`admin`) |
| keycloak-db | postgres:16-alpine | 5433 | BD interna de Keycloak |
| keycloak | keycloak 24.0.1 (`start-dev`) | 8080 | Servidor de identidad (admin/admin) |
| rabbitmq | rabbitmq:4.2-management | 5672 / 15672 | Broker de mensajes y consola web (guest/guest) |
| grafana-lgtm | grafana/otel-lgtm | 3000, 4317, 4318 | Loki + Grafana + Tempo + Mimir, receptor OTLP |

> El servicio `product-service` en el compose está comentado; el resto de microservicios se ejecutan localmente desde el IDE/Maven.

---

## 3. Orden de arranque recomendado

1. `docker compose up -d` (bases de datos, Keycloak, RabbitMQ, Grafana).
2. Configurar Keycloak: realm `ecommerce-realm`, cliente `api-gateway-client`, roles de realm `ADMIN` y `USER`.
3. **config-server** (8888) → debe estar primero: los demás lo importan con `spring.config.import: optional:configserver:http://localhost:8888`.
4. **discovery-server** (8761).
5. **product-service**, **inventory-service**, **order-service**, **notification-service**.
6. **api-gateway** (9000).

Cada servicio tiene un `application.yaml` mínimo (solo `spring.application.name` y la importación del Config Server); toda la configuración real vive en `config-data/<nombre-servicio>.yml`.

---

## 4. Componentes en detalle

### 4.1 config-server
- Clase `ConfigServerApplication` con `@EnableConfigServer`.
- Perfil `native`: lee los YAML desde `file:./config-data` (por eso debe ejecutarse con la raíz del proyecto como directorio de trabajo).
- Los servicios exponen `refresh` en actuator, por lo que permiten **recarga en caliente** de propiedades (`@RefreshScope`).

### 4.2 discovery-server
- Eureka Server (`@EnableEurekaServer`) en el puerto 8761; no se registra a sí mismo.
- Todos los servicios se registran con `eureka.client.service-url.defaultZone=http://localhost:8761/eureka/`.
- Permite el balanceo con URIs `lb://NOMBRE-SERVICIO`.

### 4.3 api-gateway (puerto 9000)
**Rutas** (definidas en `config-data/api-gateway.yml` y también en `GatewayConfig.java`):

| Ruta | Destino |
|---|---|
| `/api/v1/product/**` | `lb://product-service` |
| `/api/v1/order/**` | `lb://order-service` |
| `/api/v1/inventory/**` | `lb://inventory-service` |

- Filtro por defecto `TokenRelay`: reenvía el JWT a los servicios downstream.
- **Seguridad** (`SecurityConfig`, WebFlux, resource server JWT con Keycloak). Los roles se extraen del claim `realm_access.roles` y se convierten a `ROLE_*`:

| Recurso | Regla |
|---|---|
| `GET /api/v1/product/**`, `GET /api/v1/inventory/**` | Público |
| Resto de `/api/v1/product/**` y `/api/v1/inventory/**` (POST/PUT/DELETE) | `ADMIN` |
| `POST /api/v1/order` | `USER` |
| `GET /api/v1/order/**` | `ADMIN` o `USER` |
| `PUT` / `DELETE /api/v1/order/**` | `ADMIN` |
| Cualquier otra | Autenticado |

- Enum `Role`: `ADMIN`, `USER`.

### 4.4 product-service
- API REST `/api/v1/product` (CRUD): `POST`, `GET`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`.
- Persistencia en **MongoDB** (colección `product`): `id`, `name`, `description`, `price`.
- Capas: `controller` → `service` (`ProductServiceImpl`) → `repository` → `model`; `mapper` (DTO ↔ entidad) y `GlobalControllerAdvice` para errores (`ResourceNotFoundException`).
- `MongoConfig`: configura el cliente Mongo manualmente con credenciales y base `product-db`.
- `TestDataLoader`: al arrancar inserta un producto de prueba (Samsung Galaxy S24).
- `ProductController` usa `@RefreshScope` con la propiedad `app.maintenance.message`, que se devuelve en el header `X-Maintenance-Message` (demo de config dinámica).
- `GET /test-fail`: endpoint que lanza excepción a propósito (prueba de manejo de errores/observabilidad).
- Incluye `Dockerfile` multi-etapa (Maven + Temurin 21 JRE).

### 4.5 inventory-service (puerto 8082)
- Persistencia en **MySQL**, tabla `t_inventory` (`id`, `sku`, `quantity`). Hibernate `ddl-auto: update`, hilos virtuales habilitados.
- API REST `/api/v1/inventory`:

| Método | Ruta | Función |
|---|---|---|
| GET | `/{sku}?quantity=N` | ¿Hay stock suficiente? (boolean) |
| GET | `/` | Lista todo el inventario |
| POST | `/` | Crea inventario (falla si el SKU ya existe) |
| PUT | `/{id}` | Actualiza SKU/cantidad |
| PUT | `/reduce/{sku}?quantity=N` | Reduce stock |
| DELETE | `/{id}` | Elimina |

- `inventory.allow-backorders` (config, `@RefreshScope`): si es `true`, `isInStock` siempre responde `true` (modo backorder).
- **Listener RabbitMQ** (`OrderEventsListener`) sobre `inventory-queue` (binding `order.placed`):
  1. Verifica que **todos** los ítems tengan stock.
  2. Si no hay stock → publica `order.cancelled` con el motivo.
  3. Si hay → descuenta el stock y publica `order.confirmed`.
  4. Ante cualquier excepción → publica `order.cancelled` ("Error técnico…").

### 4.6 order-service (puerto 8081)
- Persistencia en **PostgreSQL**: `t_orders`, `t_order_line_items` y `outbox_events`.
- Estados (`OrderStatus`): `PLACED` → `CONFIRMED` | `CANCELLED`.
- Seguridad: resource server JWT; `/actuator/**` abierto, el resto autenticado.
- API REST `/api/v1/order`:

| Método | Ruta | Función |
|---|---|---|
| POST | `/` | Crea un pedido (usa el `sub` del JWT como `userId`) |
| GET | `/` | Lista pedidos: todos si es ADMIN, solo los propios si es USER |
| GET | `/{id}` | Consulta por id |
| DELETE | `/{id}` | Elimina |

- Flag `order.enabled` (`@RefreshScope`): si es `false`, rechaza nuevos pedidos (modo mantenimiento).
- `InventoryClient` (HTTP Interface + `WebClient` `@LoadBalanced` hacia `INVENTORY-SERVICE`) y Resilience4j (circuit breaker `inventory` y retry con backoff exponencial) están configurados, pero las anotaciones en `OrderServiceImpl` están comentadas: hoy la comunicación con inventario es **asíncrona por eventos**.
- **Patrón Outbox** (garantía de entrega):
  1. `placeOrder` guarda el pedido y construye `OrderPlacedEvent`.
  2. Intenta publicar `order.placed` en RabbitMQ inmediatamente.
  3. Guarda el evento en `outbox_events` con `processed = true/false` según el éxito del envío.
  4. `MessageRelayer` (`@Scheduled` cada 10 s) reenvía los eventos con `processed = false` y los marca como procesados.
- **Listener** (`OrderEventListener`): escucha `order-confirmed-queue` y `order-cancelled-queue` y actualiza el estado del pedido (`updateOrderStatus`).

### 4.7 notification-service
- Sin API web: es un consumidor de `notification-queue` (bindings `order.confirmed` y `order.cancelled`).
- `OrderEventsListener` con `@RabbitHandler` distingue el evento y envía un correo con `JavaMailSender`:
  - Confirmación: "Orden Confirmada – <nº>".
  - Cancelación: incluye el motivo.
- `RabbitMQConfig`: mapea las clases de eventos del emisor (`com.ecommerce.inventory_service.event.*`) a las clases locales, y define una **Dead Letter Queue** (`notification-dlx` → `notification-dlq`) para mensajes fallidos.

---

## 5. Flujo principal: realizar un pedido

```
1. Cliente (rol USER) → POST /api/v1/order  (con Bearer JWT)
2. API Gateway valida JWT y rol → enruta a order-service
3. order-service guarda el pedido (PLACED) + registro Outbox
        └─ publica  "order.placed"  en exchange `order-events`
4. inventory-service (inventory-queue) recibe el evento
        ├─ stock OK    → descuenta stock → publica "order.confirmed"
        └─ sin stock   → publica "order.cancelled" (con motivo)
5. Consumidores de la respuesta:
        ├─ order-service (order-confirmed/cancelled-queue) → pasa a CONFIRMED / CANCELLED
        └─ notification-service (notification-queue)       → envía el correo al cliente
```

### Mensajería (RabbitMQ)

| Exchange | Routing key | Cola | Consumidor |
|---|---|---|---|
| `order-events` (topic) | `order.placed` | `inventory-queue` | inventory-service |
| `order-events` | `order.confirmed` | `order-confirmed-queue` | order-service |
| `order-events` | `order.confirmed` / `order.cancelled` | `notification-queue` | notification-service |
| `order-events` | `order.cancelled` | `order-cancelled-queue` | order-service |
| `notification-dlx` (direct) | `notification.dead` | `notification-dlq` | (revisión manual) |

Eventos: `OrderPlacedEvent(orderNumber, email, items[sku, price, quantity])`, `OrderConfirmedEvent(orderNumber, email)`, `OrderCancelledEvent(orderNumber, email, reason)`. Se serializan como JSON (`JacksonJsonMessageConverter`).

---

## 6. Observabilidad

Los servicios (gateway, order, inventory) exportan por **OTLP HTTP** a Grafana LGTM (`localhost:4318`):
- **Trazas** (`sampling.probability: 1.0`), **logs** (vía `InstallOpenTelemetryAppender`) y **métricas**.
- El patrón de log incluye `[servicio, trace_id, span_id]` para correlacionar.
- Actuator expone `refresh`, `health`, `prometheus` (y `circuitbreakers` en order-service).
- Visualización en Grafana: <http://localhost:3000>.

---

## 7. Conceptos de arquitectura que demuestra el proyecto

- API Gateway + seguridad centralizada (OAuth2/OIDC con Keycloak, RBAC).
- Configuración centralizada y refrescable (Config Server + `@RefreshScope`).
- Service Discovery y balanceo de carga (Eureka + `lb://`).
- Persistencia políglota (MongoDB, PostgreSQL, MySQL).
- Arquitectura orientada a eventos con coreografía (RabbitMQ, topic exchange).
- Patrón **Outbox** y **Dead Letter Queue** para fiabilidad.
- Resiliencia (Resilience4j, preparado pero desactivado).
- Observabilidad unificada (OpenTelemetry + Grafana LGTM).
- Hilos virtuales de Java 21.

---

## 8. Observaciones / puntos a revisar

- En `config-data/` solo existen `api-gateway.yml`, `inventory-service.yml` y `order-service.yml`. **Faltan** `product-service.yml` (necesita `spring.data.mongodb.*` y `server.port`) y `notification-service.yml` (necesita configuración SMTP `spring.mail.*` y RabbitMQ). Sin ellos esos servicios no arrancan correctamente.
- Las rutas del gateway están duplicadas (YAML y `GatewayConfig.java`).
- El `client-secret` de Keycloak y las credenciales de BD están en texto plano en `config-data/`; en producción deberían ir en variables de entorno o un gestor de secretos.
- Keycloak y el gateway usan el puerto 8080 / 9000; `product-service` no tiene puerto definido en el repositorio, conviene asignar uno distinto de 8080 (ocupado por Keycloak).
- `TestDataLoader` inserta un producto en cada arranque (datos duplicados); `GET /test-fail` es solo de pruebas.
