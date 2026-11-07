# Ver trazas, logs y métricas en Grafana + cómo se capturan las métricas

Complemento de [OPENTELEMETRY.md](OPENTELEMETRY.md). Aquí: (1) cómo se capturan las métricas con la configuración de `config-data/` y (2) cómo explorarlo todo en Grafana.

---

## 1. Cómo se capturan las métricas

### 1.1 La cadena completa

```
Actuator + Micrometer (instrumentación automática)
        │  mide JVM, HTTP, JDBC, RabbitMQ...
        ▼
Registro OTLP de Micrometer  (viene con spring-boot-starter-opentelemetry)
        │  cada ~60 s por defecto (step); el contenedor LGTM añade OTEL_METRIC_EXPORT_INTERVAL=5000
        ▼  HTTP POST  http://localhost:4318/v1/metrics
Collector de grafana/otel-lgtm  ──▶  Mimir (almacén tipo Prometheus)  ──▶  Grafana
```

No hay código propio que registre métricas: **todo sale de la autoconfiguración de Spring Boot**. Lo único "manual" es la config de `management.*` en `config-data/`.

### 1.2 Qué línea de `config-data` hace qué

| Propiedad | Efecto |
|---|---|
| `management.otlp.metrics.export.url: http://localhost:4318/v1/metrics` | **Activa** el exportador OTLP de métricas y define a dónde empuja (push). Sin esta línea las métricas no salen. |
| `spring.application.name` | Se convierte en el atributo de recurso `service.name`; en Grafana aparece como `service_name` y `job`. Es lo que distingue un servicio de otro. |
| `management.endpoints.web.exposure.include: "...prometheus"` | Expone `/actuator/prometheus` (modo *pull*). **Ojo:** ese endpoint solo existe si el proyecto incluye `micrometer-registry-prometheus`, y no aparece en ningún `pom.xml`; es probable que devuelva 404. No afecta al flujo OTLP, que es el que realmente usa Grafana. |
| `management.endpoint.health.show-details: always` (order) | Detalle del health; no es una métrica, pero alimenta el estado de los indicadores. |
| `management.health.circuitbreakers.enabled: true` (order) | Incluye los circuit breakers en `/actuator/health`. |
| `management.tracing.sampling.probability` | **No** afecta a métricas, solo a trazas. |

### 1.3 Qué métricas se generan (automáticas)

Nombres en Micrometer → nombre en Mimir/Prometheus (los `.` pasan a `_` y se añade la unidad):

| Familia | Métrica en Grafana | Servicios | Para qué sirve |
|---|---|---|---|
| **HTTP servidor** | `http_server_requests_seconds_count / _sum / _bucket` | order, inventory | Peticiones, latencia, errores por `uri`, `method`, `status`, `outcome` |
| **Gateway** | `spring_cloud_gateway_requests_seconds_*` | api-gateway | Peticiones por ruta (`routeId`) y estado |
| **HTTP cliente** | `http_client_requests_seconds_*` | order (WebClient→inventory), gateway | Latencia de llamadas salientes |
| **JVM memoria** | `jvm_memory_used_bytes`, `jvm_memory_max_bytes` | todos | Heap / non-heap |
| **JVM GC / hilos** | `jvm_gc_pause_seconds_*`, `jvm_threads_live_threads`, `jvm_threads_states_threads` | todos | Pausas de GC, hilos (útil con *virtual threads* activados) |
| **CPU / sistema** | `process_cpu_usage`, `system_cpu_usage`, `process_uptime_seconds` | todos | Carga y uptime |
| **Clases / logs** | `jvm_classes_loaded_classes`, `logback_events_total` | todos | Logs por nivel (ERROR/WARN…) |
| **Pool de BD** | `hikaricp_connections_active / _idle / _pending / _max`, `hikaricp_connections_acquire_seconds_*` | order, inventory | Saturación de conexiones |
| **JDBC / datasource** | `jdbc_connections_*` | order, inventory | Estado de conexiones |
| **Tomcat** | `tomcat_sessions_*`, `tomcat_threads_*` (si aplica) | order, inventory | Servidor web |
| **Spring Security** | `spring_security_http_secured_requests_seconds_*` | order | Peticiones pasando por el filtro de seguridad |
| **RabbitMQ** | `rabbitmq_connections`, `rabbitmq_channels`, `rabbitmq_published_total`, `rabbitmq_consumed_total`, `rabbitmq_acknowledged_total` | order, inventory | Mensajería (si el `ConnectionFactory` está instrumentado) |
| **Resilience4j** | `resilience4j_circuitbreaker_*`, `resilience4j_retry_calls_*` | order | **Solo si** hay circuit breakers/retries en uso (ver nota) |

> **Nota Resilience4j:** `order-service.yml` define las instancias `inventory`, pero en `OrderServiceImpl` los imports de `@CircuitBreaker`/`@Retry` están comentados. Mientras las anotaciones no se usen, no habrá series de `resilience4j_*` con datos.
>
> **Nota product-service / notification-service:** no tienen OTel, no emiten nada a Grafana.

La lista exacta que recibe tu stack se ve en Grafana (sección 2.3); depende de qué se haya ejercitado.

### 1.4 Etiquetas (labels) importantes

| Label | Origen |
|---|---|
| `service_name` / `job` | `spring.application.name` |
| `service_instance_id` | Instancia (útil si levantas varias réplicas) |
| `uri`, `method`, `status`, `outcome`, `exception` | Dimensiones de `http_server_requests` |
| `routeId` | Ruta del gateway |
| `area`, `id` | JVM memory (`heap`/`nonheap`, pool) |

---

## 2. Cómo verlo en Grafana

### 2.1 Entrar

1. `docker compose up -d` (servicio `grafana-lgtm`).
2. Abre <http://localhost:3000>. Usuario / clave por defecto: `admin` / `admin`.
3. Genera tráfico: haz varias peticiones al gateway (`http://localhost:9000/api/v1/...`). Las métricas tardan unos segundos en aparecer; las trazas, casi inmediato.

El contenedor ya trae **datasources preconfigurados**: Prometheus (Mimir), Tempo y Loki. No hay que crear nada.

### 2.2 Trazas (Tempo)

1. Menú **Explore** → datasource **Tempo**.
2. Pestaña **Search**: filtra por *Service Name* (`api-gateway`, `order-service`, `inventory-service`), *Span name* o duración mínima.
3. Abre una traza: verás el árbol gateway → order → inventory con la duración de cada span.
4. Para buscar por ID: pestaña **TraceQL** → pega el `trace_id` que sale en la consola (`[order-service,<trace_id>,<span_id>]`).
5. Consulta TraceQL de ejemplo para errores: `{ status = error }`.

### 2.3 Métricas (Prometheus / Mimir)

1. **Explore** → datasource **Prometheus**.
2. Usa **Metrics browser** o escribe `{service_name="order-service"}` para ver qué series existen.
3. Consultas PromQL útiles:

| Qué | PromQL |
|---|---|
| Peticiones/s por servicio | `sum by (service_name) (rate(http_server_requests_seconds_count[1m]))` |
| Errores 5xx/s | `sum by (service_name, uri) (rate(http_server_requests_seconds_count{status=~"5.."}[1m]))` |
| Latencia media | `sum(rate(http_server_requests_seconds_sum[1m])) / sum(rate(http_server_requests_seconds_count[1m]))` |
| Latencia p95 | `histogram_quantile(0.95, sum by (le, service_name) (rate(http_server_requests_seconds_bucket[5m])))` *(solo si hay buckets de histograma activados)* |
| Heap usado | `sum by (service_name) (jvm_memory_used_bytes{area="heap"})` |
| CPU del proceso | `process_cpu_usage` |
| Conexiones BD activas | `hikaricp_connections_active` |
| Peticiones por ruta del gateway | `sum by (routeId) (rate(spring_cloud_gateway_requests_seconds_count[1m]))` |

4. Para construir un panel: **Dashboards → New → New dashboard → Add visualization**, elige *Prometheus* y pega la consulta. Alternativamente, **Dashboards → Import** con dashboards de la comunidad para Spring Boot / JVM (p. ej. el de *JVM Micrometer*, ID `4701`), ajustando la variable de aplicación a `service_name`.

> Si un nombre no aparece, ve al *Metrics browser* y busca por prefijo (`http_`, `jvm_`, `hikari`): según la versión, las unidades y sufijos (`_seconds`, `_bytes`, `_total`) pueden variar ligeramente.

### 2.4 Logs (Loki)

1. **Explore** → datasource **Loki**.
2. Selector base: `{service_name="order-service"}`.
3. Filtros: `|= "ERROR"` o `|= "<trace_id>"`.
4. Los logs que llegan por OTLP traen `trace_id` y `span_id` como *structured metadata*. Si el datasource está configurado con *derived fields*, aparece un enlace **Tempo** junto a la línea que salta a la traza completa.

### 2.5 Correlacionar las tres señales (el flujo ideal)

1. Detectas un pico de errores en el panel de métricas (`status=~"5.."`).
2. En Tempo buscas trazas con `{ status = error }` en ese intervalo.
3. Abres la traza → ves qué servicio falló y cuánto tardó cada span.
4. Desde el span, "Logs for this span" (o por `trace_id` en Loki) → ves el log exacto del error.

### 2.6 Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| No aparece ningún servicio | ¿Está arriba `grafana-lgtm`? ¿Los puertos 4317/4318 mapeados? ¿El servicio arrancó con config del Config Server (`config-data`)? |
| Hay trazas pero no métricas | Verifica `management.otlp.metrics.export.url` en el YAML del servicio y espera unos segundos (intervalo de exportación). |
| Hay trazas pero no logs | Falta `logback-spring.xml` con el appender `OTEL` o la clase `InstallOpenTelemetryAppender`. |
| Una traza queda cortada | Los saltos por RabbitMQ no propagan contexto salvo que se active la observación en Rabbit (ver OPENTELEMETRY.md §6). |
| Servicio ausente (product/notification) | No tienen dependencia ni config de OTel. |
| `/actuator/prometheus` da 404 | Falta `micrometer-registry-prometheus`; no es necesario para el flujo OTLP. |
