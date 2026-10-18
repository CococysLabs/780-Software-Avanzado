# OpenTelemetry en el proyecto

Cómo funciona la observabilidad (trazas, logs y métricas) con **OpenTelemetry (OTel)** y **Grafana LGTM**.

## 1. Visión general

```
 Cliente
    │
    ▼
┌─────────────┐  HTTP (traceparent)  ┌───────────────┐  HTTP (traceparent)  ┌──────────────────┐
│ api-gateway │ ───────────────────▶ │ order-service │ ───────────────────▶ │ inventory-service│
│   :9000     │                      │    :8081      │   (WebClient + LB)   │      :8082       │
└──────┬──────┘                      └───────┬───────┘                      └────────┬─────────┘
       │ OTLP/HTTP                           │ OTLP/HTTP                             │ OTLP/HTTP
       └──────────────────────────┬──────────┴───────────────────────────────────────┘
                                  ▼
                  ┌────────────────────────────────┐
                  │ grafana/otel-lgtm              │
                  │ receptor OTLP :4317 (gRPC)     │
                  │               :4318 (HTTP)     │
                  │ Tempo (trazas) · Loki (logs)   │
                  │ Mimir (métricas) · Grafana :3000│
                  └────────────────────────────────┘
```

Cada servicio instrumentado **empuja** (push) sus datos por **OTLP sobre HTTP** al puerto `4318`. No hay Collector intermedio: el contenedor `grafana/otel-lgtm` ya incluye un collector que reparte cada señal a su backend.

| Señal | Backend | Endpoint OTLP |
|---|---|---|
| Trazas | Tempo | `http://localhost:4318/v1/traces` |
| Logs | Loki | `http://localhost:4318/v1/logs` |
| Métricas | Mimir (Prometheus) | `http://localhost:4318/v1/metrics` |

## 2. Servicios instrumentados

| Servicio | OTel | Config |
|---|---|---|
| api-gateway | Sí | `config-data/api-gateway.yml` |
| order-service | Sí | `config-data/order-service.yml` |
| inventory-service | Sí | `config-data/inventory-service.yml` |
| product-service | No | — |
| notification-service | No | — |
| config-server / discovery-server | No | — |

Las configuraciones viven en `config-data/` y las sirve el **config-server**; por eso los `application.yaml` locales de cada servicio no contienen la parte de OTel.

## 3. Las piezas

### 3.1 Dependencias (`pom.xml` de gateway, order e inventory)

- `spring-boot-starter-opentelemetry`: starter de Spring Boot 4. Trae el SDK de OTel, el puente de Micrometer Tracing → OTel y los exportadores OTLP. Con él, Spring Boot autoconfigura el bean `OpenTelemetry`.
- `opentelemetry-logback-appender-1.0` (`2.21.0-alpha`): appender de Logback que convierte cada línea de log en un *LogRecord* de OTel.

### 3.2 Configuración (`management.*` en los YAML de `config-data/`)

```yaml
management:
  tracing:
    sampling:
      probability: 1.0            # muestrea el 100% de las trazas
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: http://localhost:4318/v1/traces
    logging:
      export:
        otlp:
          endpoint: http://localhost:4318/v1/logs
  otlp:
    metrics:
      export:
        url: http://localhost:4318/v1/metrics
```

- `sampling.probability: 1.0` → todas las peticiones generan traza. Ideal para desarrollo; en producción conviene bajarlo (p. ej. `0.1`).
- Los tres bloques activan el exportador de cada señal y definen su URL.
- `endpoints.web.exposure.include` expone `prometheus` (además de `health`, `refresh`, y `circuitbreakers` en order) para poder consultar métricas también vía scraping.

### 3.3 Logs → OTel (`logback-spring.xml` + `InstallOpenTelemetryAppender`)

Los logs requieren dos piezas porque el appender de Logback se crea **antes** que el contexto de Spring:

1. [`logback-spring.xml`](order-service/src/main/resources/logback-spring.xml) declara el appender `OTEL` y lo añade al `root` junto con `CONSOLE`: los logs salen por consola **y** hacia OTel.
2. La clase `InstallOpenTelemetryAppender` (en `config/` de gateway, order e inventory) implementa `InitializingBean` y llama a `OpenTelemetryAppender.install(openTelemetry)`. Así el appender, ya declarado pero sin conexión, recibe el bean `OpenTelemetry` de Spring y empieza a exportar.

> Sin la clase `InstallOpenTelemetryAppender`, el appender existiría pero no enviaría nada.

### 3.4 Correlación en consola

```yaml
logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{trace_id:-},%X{span_id:-}]"
```

Micrometer Tracing pone `trace_id` y `span_id` en el MDC; este patrón los imprime:

```
 INFO [order-service,4bf92f3577b34da6a3ce929d0e0e4736,00f067aa0ba902b7] Creando pedido...
```

Ese `trace_id` es el mismo que ves en Tempo y en los logs de Loki.

### 3.5 Infraestructura (`docker-compose.yml`)

```yaml
grafana-lgtm:
  image: 'grafana/otel-lgtm:latest'
  ports:
    - '3000:3000'   # Grafana UI
    - '4317:4317'   # OTLP gRPC
    - '4318:4318'   # OTLP HTTP  ← el que usan los servicios
  environment:
    - OTEL_METRIC_EXPORT_INTERVAL=5000   # exporta métricas cada 5 s
```

## 4. Flujo de una petición

1. El cliente llama al gateway (`/api/v1/order/**`). El gateway **crea la traza** (`trace_id`) y su primer span.
2. El gateway reenvía a `order-service` (`lb://order-service`) añadiendo la cabecera W3C `traceparent` con el `trace_id` y el span padre.
3. `order-service` lee `traceparent`, crea sus spans como hijos (controlador, JPA/JDBC, etc.) bajo el mismo `trace_id`.
4. `order-service` llama a `inventory-service` con `WebClient` (`@LoadBalanced`, ver `WebClientConfig`). El `WebClient.Builder` inyectado lo gestiona Spring, así que la instrumentación de Micrometer añade también `traceparent` en esa llamada saliente.
5. Cada servicio exporta sus spans por OTLP a `:4318`. Tempo los une por `trace_id` y en Grafana se ve **una sola traza** que atraviesa los tres servicios.
6. En paralelo, cada log emitido durante esa petición lleva el `trace_id`/`span_id` activo, y Loki puede enlazarlo con su traza.

## 5. Cómo verlo

1. Levanta la infraestructura: `docker compose up -d`.
2. Arranca config-server, discovery-server y luego gateway, order, inventory.
3. Haz una petición a través del gateway (con token de Keycloak).
4. Abre Grafana en <http://localhost:3000> (usuario/clave por defecto: `admin` / `admin`).
   - **Explore → Tempo**: busca por servicio o `trace_id` y verás el árbol de spans.
   - **Explore → Loki**: filtra por `service_name` o por `trace_id` para ver los logs de esa petición.
   - **Explore → Prometheus/Mimir**: métricas JVM, HTTP (`http_server_requests_*`), Resilience4j, etc.

## 6. Limitaciones y puntos a revisar

- **Mensajería RabbitMQ:** el flujo de pedidos usa RabbitMQ (order → inventory → notification) y no hay configuración de observación para `RabbitTemplate`/`@RabbitListener` (p. ej. `spring.rabbitmq.template.observation-enabled` y `spring.rabbitmq.listener.simple.observation-enabled`). Por tanto, es probable que la traza **se corte** en los saltos asíncronos. Además, `notification-service` y `product-service` no tienen OTel.
- **Muestreo al 100%:** correcto para desarrollo, costoso en producción.
- **Endpoints fijos a `localhost`:** en Docker/Kubernetes habría que apuntar al host del collector (variable de entorno o perfil).
- **Versión `alpha`** del appender de Logback (`2.21.0-alpha`): la API puede cambiar entre versiones.
- **Secretos en `config-data/api-gateway.yml`** (`client-secret` de Keycloak): no es de OTel, pero conviene no versionarlo.
