# Conectar microservicios con NATS (NestJS)

Guía basada en el proyecto `products-app`: `api-gateway` (HTTP), `products-ms` y `auth` (microservicios).

## 1. Idea general

```
Cliente HTTP ──► api-gateway ──► NATS (broker) ──► products-ms
                     │                         └─► auth-ms
                     └── ClientProxy.send(patrón, datos)
```

* Solo el **api-gateway** expone HTTP. Los microservicios **no** exponen puerto HTTP: se suscriben a NATS.
* El gateway **envía** mensajes (`send`) con un *patrón*; el microservicio que tenga un `@MessagePattern` igual **responde**.
* NATS desacopla: el gateway no necesita saber la IP ni el puerto de cada microservicio, solo la del servidor NATS.

## 2. Instalar dependencias

En **cada** proyecto (gateway y microservicios):

```bash
npm i @nestjs/microservices nats
npm i joi dotenv      # validación de variables de entorno
```

## 3. Levantar el servidor NATS

En `docker-compose.yml`:

```yaml
services:
  nats-server:
    image: nats:latest
    ports:
      - "8222:8222"   # monitoreo (http://localhost:8222)
      # 4222 es el puerto de clientes; dentro de la red de compose no hace falta publicarlo
```

Los demás servicios usan el nombre del servicio como host: `NATS_SERVERS=nats://nats-server:4222`.
Si hay varios nodos se separan por coma: `nats://n1:4222,nats://n2:4222`.

## 4. Variables de entorno

Cada servicio recibe `NATS_SERVERS`. Se valida con joi y se convierte a arreglo
([envs.ts](products-app/api-gateway/src/config/envs.ts)):

```ts
const envsSchema = joi.object({
  PORT: joi.number().required(),
  NATS_SERVERS: joi.array().items(joi.string()).required(),
}).unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS ? process.env.NATS_SERVERS.split(',') : [],
});
```

## 5. Lado cliente: el API Gateway

### 5.1 Token de inyección

[services.ts](products-app/api-gateway/src/config/services.ts):

```ts
export const NATS_SERVICE = 'NATS_SERVICE';
```

### 5.2 Módulo de transporte (reutilizable)

[nats-module.module.ts](products-app/api-gateway/src/transports/nats-module/nats-module.module.ts):

```ts
@Module({
  imports: [
    ClientsModule.register([
      {
        name: NATS_SERVICE,
        transport: Transport.NATS,
        options: { servers: envs.natsServer },
      },
    ]),
  ],
  exports: [ClientsModule],   // se exporta para que otros módulos inyecten el cliente
})
export class NatsModule {}
```

Cualquier módulo que necesite hablar con los microservicios importa `NatsModule`
(`ProductsModule`, `AuthModule`, ...).

### 5.3 Enviar mensajes desde un controlador

[products.controller.ts](products-app/api-gateway/src/products/products.controller.ts):

```ts
@Controller('products')
export class ProductsController {
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  @Post()
  createProduct(@Body() dto: CreateProductDto) {
    return this.client.send({ cmd: 'create_product' }, dto);
  }

  @Get()
  findAllProduct() {
    return this.client.send({ cmd: 'find_all' }, {});
  }
}
```

* `send(patrón, datos)` → request/response (devuelve un `Observable`; Nest lo resuelve solo).
* `emit(patrón, datos)` → evento *fire and forget* (sin respuesta).

## 6. Lado servidor: los microservicios

### 6.1 Arrancar como microservicio (no HTTP)

[products-ms/src/main.ts](products-app/products-ms/src/main.ts):

```ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.NATS,
  options: { servers: envs.natsServers },
});

app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
await app.listen();
```

Se usa `createMicroservice` en vez de `NestFactory.create`.

### 6.2 Responder a patrones

[product.controller.ts](products-app/products-ms/src/product/product.controller.ts):

```ts
@MessagePattern({ cmd: 'create_product' })
create(@Payload() dto: CreateProductDto) {
  return this.productService.create(dto);
}

@MessagePattern({ cmd: 'find_all' })
findAll() {
  return this.productService.findAll();
}
```

El patrón del `@MessagePattern` debe ser **idéntico** al que envía el gateway.
El microservicio `auth` usa patrones tipo string ([auth.controller.ts](products-app/auth/src/auth/auth.controller.ts)):

```ts
@MessagePattern('auth.register.user')
@MessagePattern('auth.login.user')
@MessagePattern('auth.verify.user')
```

Y el gateway los invoca con `this.client.send('auth.login.user', loginDto)`.

## 7. Resumen de patrones del proyecto

| Servicio     | Patrón                     | Desde el gateway |
|--------------|----------------------------|------------------|
| products-ms  | `{ cmd: 'create_product' }`| `POST /products` |
| products-ms  | `{ cmd: 'find_all' }`      | `GET /products`  |
| auth         | `'auth.register.user'`     | registro         |
| auth         | `'auth.login.user'`        | login            |
| auth         | `'auth.verify.user'`       | guard JWT        |

## 8. Probar

```bash
docker compose up --build
# monitoreo de NATS
http://localhost:8222
# petición vía gateway
curl http://localhost:3000/products
```

## 9. Errores comunes

| Síntoma | Causa probable |
|---|---|
| `CONNECTION_REFUSED` al iniciar | `NATS_SERVERS` apunta a `localhost` dentro de un contenedor; usar el nombre del servicio (`nats-server`) |
| El gateway se queda esperando y da timeout | El patrón no coincide, o el microservicio no está levantado/suscrito |
| `Config validation error` | Falta `NATS_SERVERS` o `PORT` |
| Error de validación del DTO | `forbidNonWhitelisted: true` rechaza propiedades no declaradas |
| Excepciones no llegan como HTTP correcto | En el microservicio lanzar `RpcException` y en el gateway capturarla con un filtro/`catchError` |

## 10. Seguridad

El `docker-compose.yml` actual contiene credenciales de base de datos y `JWT_SECRET` en texto plano.
Muévelas a un archivo `.env` (en `.gitignore`) o a *Secrets* de Kubernetes, y **rota** las contraseñas ya expuestas.
