# TypeORM en el microservicio de productos (products-ms)

Cómo `products-ms` usa **TypeORM** con PostgreSQL (Neon) y NATS. Código en [products-app/products-ms/src](products-app/products-ms/src).

## 1. Flujo general

```
api-gateway ──NATS──► ProductController ──► ProductService ──► Repository<Product> ──► PostgreSQL (Neon)
                      @MessagePattern       lógica             TypeORM                 tabla "product"
```

El microservicio no expone HTTP: arranca con `NestFactory.createMicroservice` y transporte NATS ([main.ts](products-app/products-ms/src/main.ts)). Un `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) valida los DTO y rechaza campos no declarados.

## 2. Dependencias

```bash
npm i @nestjs/typeorm typeorm pg @nestjs/config
npm i @nestjs/microservices nats class-validator class-transformer @nestjs/mapped-types
```

## 3. Conexión a la base de datos ([app.module.ts](products-app/products-ms/src/app.module.ts))

```ts
TypeOrmModule.forRoot({
  type: 'postgres',
  host: process.env.DB_HOST_USER,
  port: +(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PW,
  database: process.env.DB_NAME,
  autoLoadEntities: true,
  synchronize: true,
  ssl: { rejectUnauthorized: false },
})
```

| Opción | Qué hace |
|---|---|
| `type: 'postgres'` | Usa el driver `pg`. |
| `host/port/username/password/database` | Se leen de variables de entorno (en Docker vienen del `docker-compose.yml`). |
| `autoLoadEntities: true` | Registra automáticamente las entidades declaradas con `forFeature`, sin listarlas aquí. |
| `synchronize: true` | Crea/actualiza las tablas según las entidades al arrancar. Cómodo en desarrollo; **en producción usar migraciones** (puede alterar o borrar datos). |
| `ssl` | Neon exige SSL; `rejectUnauthorized: false` acepta su certificado sin verificarlo. |

`ConfigModule.forRoot({ isGlobal: true })` carga el `.env` para que `process.env` tenga esos valores.

## 4. Entidad ([product.entity.ts](products-app/products-ms/src/product/entities/product.entity.ts))

```ts
@Entity('product')
export class Product {
  @PrimaryGeneratedColumn('uuid') id: number;
  @Column('text', { unique: true }) name: string;
  @Column('float', { default: 0 }) price: number;
}
```

Genera la tabla `product`:

| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid | Clave primaria generada automáticamente |
| `name` | text | Único: no se pueden repetir nombres |
| `price` | float | Por defecto 0 |

> Nota: `id` está tipado como `number` pero la columna es `uuid` (string). Conviene cambiarlo a `string`.

## 5. Módulo ([product.module.ts](products-app/products-ms/src/product/product.module.ts))

`TypeOrmModule.forFeature([Product])` registra el repositorio de `Product` para poder inyectarlo en este módulo.

## 6. Servicio ([product.service.ts](products-app/products-ms/src/product/product.service.ts))

```ts
constructor(@InjectRepository(Product) private readonly productoRepository: Repository<Product>) {}

create(dto)  { const p = this.productoRepository.create(dto); return this.productoRepository.save(p); }
findAll()    { return this.productoRepository.find(); }
```

* `@InjectRepository(Product)` inyecta el `Repository<Product>` de TypeORM.
* `create()` solo crea la instancia en memoria; `save()` hace el `INSERT` y devuelve el registro con su `id`.
* `find()` hace `SELECT * FROM product`.

## 7. Controlador y mensajes NATS ([product.controller.ts](products-app/products-ms/src/product/product.controller.ts))

| Patrón NATS | Método | Payload | Respuesta |
|---|---|---|---|
| `{ cmd: 'create_product' }` | `create` | `{ name, price }` | Producto creado |
| `{ cmd: 'find_all' }` | `findAll` | — | Lista de productos |

El gateway invoca por ejemplo `client.send({ cmd: 'find_all' }, {})`. Los decoradores `@Post()`/`@Get()` del controlador no se usan por NATS; solo cuentan los `@MessagePattern`.

## 8. DTO ([create-product.dto.ts](products-app/products-ms/src/product/dto/create-product.dto.ts))

* `name`: `@IsString()`.
* `price`: `@IsNumber({ maxDecimalPlaces: 4 })`, `@Min(0)` y `@Type(() => Number)`.
* `UpdateProductDto` extiende `PartialType(CreateProductDto)` (todos los campos opcionales), aún sin uso en el controlador.

## 9. Variables de entorno

`PORT`, `NATS_SERVERS` se validan con Joi en [config/envs.ts](products-app/products-ms/src/config/envs.ts). Las `DB_*` las lee TypeORM directamente de `process.env`:

```
DB_HOST_USER, DB_PORT, DB_USER, DB_PW, DB_NAME
```

## 10. Pruebas y errores comunes

* Levantar todo: `docker compose up --build` desde `products-app` (ver [README.md](README.md)).
* Ver la tabla creada: conectarse a Neon (DataGrip, psql) y consultar `SELECT * FROM product;`.
* Crear un nombre repetido lanza un error de violación de unicidad (código `23505`); hoy no se captura y llega como error genérico al gateway.
* Si no conecta: revisar `DB_*` y que el SSL esté activo (Neon lo requiere).
