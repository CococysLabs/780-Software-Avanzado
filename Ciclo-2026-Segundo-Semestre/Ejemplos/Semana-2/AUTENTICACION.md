# Autenticación con JWT (NestJS)

Proyecto de ejemplo en [jwt-example/](jwt-example/) que implementa **registro, login y protección de rutas** usando **JWT**, **Passport**, **TypeORM + PostgreSQL** y **bcrypt**.

## Stack

| Tecnología | Uso |
|---|---|
| NestJS 11 | Framework backend |
| `@nestjs/jwt` | Firmar tokens JWT |
| `@nestjs/passport` + `passport-jwt` | Validar el token en cada petición |
| `bcrypt` | Hash de contraseñas |
| TypeORM + `pg` | Persistencia de usuarios en PostgreSQL |
| `class-validator` | Validación de los DTO |

## Estructura

```
jwt-example/src/
├── main.ts                      # Arranque + ValidationPipe global
├── app.module.ts                # Config, conexión a PostgreSQL, AuthModule
└── auth/
    ├── auth.module.ts           # Registra TypeORM, Passport y JwtModule
    ├── auth.controller.ts       # Endpoints /auth/*
    ├── auth.service.ts          # Lógica: crear usuario, login, firmar JWT
    ├── dto/
    │   ├── create-user.dto.ts   # Validación del registro
    │   └── login-user.dto.ts    # Validación del login
    ├── entities/user.entity.ts  # Tabla "Users"
    ├── interfaces/              # JwtPayload y enum ValidRoles
    ├── strategies/jwt.strategy.ts   # Valida el token y carga el usuario
    ├── Guards/user-role.guard.ts    # Control de acceso por roles
    └── Decorators/get-user.decorator.ts # Obtiene el usuario de la request
```

## Variables de entorno (`.env`)

```
PORT=3000
DB_HOST=...
DB_PORT=5432
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=<un secreto largo y aleatorio>
```

## Endpoints

| Método | Ruta | Protegida | Descripción |
|---|---|---|---|
| POST | `/auth/register` | No | Crea un usuario y devuelve el usuario + token |
| POST | `/auth/login` | No | Valida credenciales y devuelve el token |
| GET | `/auth/check-status` | Sí (Bearer token) | Verifica que el token es válido |

### Ejemplos

**Registro**
```json
POST /auth/register
{ "email": "user@mail.com", "password": "Abc123", "fullname": "Juan Pérez" }
```

**Login**
```json
POST /auth/login
{ "email": "user@mail.com", "password": "Abc123" }
```
Respuesta: `{ "id": "...", "email": "...", "token": "eyJhbGci..." }`

**Ruta protegida**
```
GET /auth/check-status
Authorization: Bearer <token>
```

## Cómo funciona

### 1. Validación de entrada
`main.ts` activa un `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`: se descartan/rechazan campos que no estén en el DTO. Los DTO exigen email válido, contraseña de 6–50 caracteres con mayúscula, minúscula y número/símbolo, y `fullname` no vacío.

### 2. Registro (`AuthService.create`)
1. Separa `password` del resto de datos.
2. Hashea la contraseña con `bcrypt.hashSync(password, 10)` (nunca se guarda en texto plano).
3. Guarda el usuario en la tabla `Users`.
4. Devuelve el usuario con un token JWT firmado con `{ id }`.
5. Si el email ya existe (error Postgres `23505`) responde `400 Bad Request`; otros errores dan `500`.

### 3. Login (`AuthService.login`)
1. Busca al usuario por email, seleccionando explícitamente `password` (la entidad lo usa para comparar).
2. Si no existe o `bcrypt.compareSync` falla → `401 Unauthorized`.
3. Si es correcto, devuelve el token JWT.

### 4. El token
- Se firma con `JWT_SECRET` y expira en **2 horas** (`JwtModule.registerAsync` en `auth.module.ts`).
- El payload solo contiene el `id` del usuario (`JwtPayload`).

### 5. Validación del token (`JwtStrategy`)
En cada petición protegida, Passport:
1. Extrae el token del header `Authorization: Bearer ...`.
2. Verifica firma y expiración con `JWT_SECRET`.
3. Ejecuta `validate(payload)`: busca al usuario por `id`; si no existe → `401 Token not valid`; si `isActive` es `false` → `401 User is inactive`.
4. Lo que retorna `validate` queda disponible en `req.user`.

### 6. Roles y decorador
- La entidad `User` tiene `rols: string[]` (por defecto `['user']`) y `isActive`.
- `ValidRoles` define: `admin`, `super-user`, `user`.
- `UserRoleGuard` compara los roles del usuario con los roles permitidos de la ruta y lanza `403 Forbidden` si no coincide.
- `@GetUser()` es un decorador de parámetro que extrae `req.user` (o una propiedad concreta, p. ej. `@GetUser('email')`).

### Flujo resumido

```
Registro/Login ──► bcrypt ──► JWT (id, 2h) ──► cliente
cliente ──► Authorization: Bearer <JWT> ──► JwtStrategy.validate ──► req.user ──► controlador
```

## Ejecutar

```bash
cd jwt-example
npm install
npm run start:dev
```

## Puntos a revisar (estado actual del código)

El ejemplo está incompleto en algunos puntos; conviene corregirlos para que funcione la protección de rutas:

1. **`JwtStrategy` no está registrada** en `providers` de `AuthModule` (ni exportada). Sin esto Passport no tiene la estrategia `jwt`.
2. **`@UseGuards(AuthGuard)`** en `check-status` debería ser `@UseGuards(AuthGuard())` (o `AuthGuard('jwt')`); se está pasando la clase sin invocar.
3. **`checkAuthStatus()`** solo hace `console.log`; debería devolver el usuario (`@GetUser()`) y un token renovado.
4. **`UserRoleGuard`** lee los roles con `reflector.get(GetUser, ...)`, que no es una clave de metadata válida. Debería usar un decorador `@RoleProtected(...roles)` con `SetMetadata('roles', roles)` y leer esa clave.
5. En `create` se devuelve el objeto `user` completo, incluido el hash de `password`; conviene eliminarlo de la respuesta.
6. `synchronize: true` y `ssl.rejectUnauthorized: false` en `app.module.ts` son aceptables para laboratorio, pero no para producción.
7. `JwtStrategy` usa `'default-secret'` como respaldo si falta `JWT_SECRET`; mejor fallar al arrancar.
