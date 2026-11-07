# Principios SOLID

Ejemplos en TypeScript de los cinco principios SOLID. Cada principio se ilustra con uno o más archivos de esta carpeta.

| Principio | Archivos |
|-----------|----------|
| S: Responsabilidad única | `srp.ts` |
| O: Abierto/cerrado | `open-close-a.ts`, `open-close-b.ts` |
| L: Sustitución de Liskov | `liskov-a.ts`, `liskov-b.ts` |
| I: Segregación de interfaces | `segregation.ts` |
| D: Inversión de dependencias | `dependency-a.ts`, `dependency-b.ts`, `dependency-c.ts` |

---

## S: Principio de responsabilidad única (`srp.ts`)

**Idea:** una clase debe tener una sola razón para cambiar, es decir, una sola responsabilidad.

**Qué muestra el ejemplo:** el trabajo se reparte en tres clases, cada una con un propósito claro.

- `ProductService`: guarda y consulta productos (`saveProduct`, `getProduct`).
- `Mailer`: envía correos electrónicos (`sendMail`) con una plantilla `to-client` o `to-admin`.
- `ProductBloc`: coordina la vista. Recibe los dos servicios por constructor y delega en ellos (`loadProduct`, `saveProduct`, `notifyClients`).

`ProductBloc` no sabe cómo se guarda un producto ni cómo se envía un correo. Si cambia la persistencia, solo se toca `ProductService`. Si cambia el envío de correos, solo se toca `Mailer`.

El código se ejecuta dentro de una función autoejecutable y al final crea los objetos y llama a los tres métodos del `ProductBloc`.

---

## O: Principio abierto/cerrado (`open-close-a.ts` y `open-close-b.ts`)

**Idea:** el código debe estar abierto a extensión y cerrado a modificación. Para añadir comportamiento nuevo no debería ser necesario reescribir lo que ya funciona.

**Qué muestra el ejemplo:**

- `open-close-b.ts` define tres servicios (`TodoService`, `PostService`, `PhotosService`) que consultan la API pública `jsonplaceholder.typicode.com`. También define `HttpClient`, que encapsula la llamada `fetch` y devuelve `{ data, status }`.
- `open-close-a.ts` es el programa principal. Importa los tres servicios, los instancia y los consulta con `await`. Al final imprime en consola los tres resultados juntos.

La lógica de las peticiones HTTP vive en un solo lugar, `HttpClient`. Los servicios la reutilizan sin duplicarla. Si cambia la forma de hacer peticiones, se modifica `HttpClient` y los servicios no se tocan.

**Limitaciones del código tal como está:**

- Cada servicio crea su propio `HttpClient` internamente. Para cambiar de cliente HTTP habría que editar los tres servicios. Inyectar el cliente por constructor lo resolvería.
- `HttpClient.get` no espera el resultado de `resp.json()`, así que `data` es una promesa. Funciona porque quien la recibe usa `await`.
- El campo `status` está fijo en 500 y no refleja la respuesta real.

---

## L: Principio de sustitución de Liskov (`liskov-a.ts` y `liskov-b.ts`)

**Idea:** cualquier subclase debe poder usarse en lugar de su clase base sin que el programa se comporte mal.

**Qué muestra el ejemplo:**

- `liskov-b.ts` declara la clase abstracta `Vehicle` con el método abstracto `getNumberOfSeats()`. Hay seis subclases: `Tesla`, `Audi`, `Toyota`, `Honda`, `Volvo` y `Ford`. Todas implementan el método y devuelven su número de asientos.
- `liskov-a.ts` define `printCarSeats`, que recibe un arreglo de `Vehicle[]` y recorre cada elemento llamando a `getNumberOfSeats()`.

La función trabaja con la abstracción y no necesita saber qué marca es cada auto. Se puede pasar cualquier subclase y todas responden igual al contrato.

El archivo conserva comentado el enfoque incorrecto: una cadena de `instanceof` por cada marca. Ese estilo obliga a editar la función cada vez que aparece un vehículo nuevo y rompe el principio. También se conserva comentada la versión anterior del método base, que lanzaba un error `Method not implemented`. Convertirlo en abstracto hace que el compilador exija la implementación en cada subclase.

---

## I: Principio de segregación de interfaces (`segregation.ts`)

**Idea:** es mejor tener varias interfaces pequeñas y específicas que una interfaz grande. Una clase no debe verse obligada a implementar métodos que no usa.

**Qué muestra el ejemplo:** el comportamiento de las aves se divide en interfaces independientes.

| Interfaz | Método |
|----------|--------|
| `Bird` | `eat()` |
| `FlyingBird` | `fly()` |
| `RunningBird` | `run()` |
| `SwimmerBird` | `swim()` |

Cada ave implementa solo lo que le corresponde:

- `Tucan` y `Humminbird`: `Bird` y `FlyingBird`.
- `Ostrich`: `Bird` y `RunningBird`.
- `Penguin`: `Bird` y `SwimmerBird`.

Con una única interfaz `Bird` que incluyera `fly()`, el avestruz y el pingüino tendrían que implementar un método que no pueden cumplir.

---

## D: Principio de inversión de dependencias (`dependency-a.ts`, `dependency-b.ts` y `dependency-c.ts`)

**Idea:** los módulos de alto nivel no deben depender de implementaciones concretas, sino de abstracciones.

**Qué muestra el ejemplo:**

- `dependency-c.ts` define la abstracción `PostProvider`, con el método `getPosts()`. Hay tres implementaciones:
  - `LocalDataBaseService`: devuelve dos posts escritos directamente en el código.
  - `JsonDataBaseService`: devuelve los posts del archivo `../data/local-database.json`.
  - `WebApiPostService`: obtiene los posts de `jsonplaceholder.typicode.com/posts` con `fetch`.
- `dependency-b.ts` define la interfaz `Post` y la clase `PostService`. Esta recibe un `PostProvider` por constructor y no sabe de dónde vienen los datos.
- `dependency-a.ts` es el programa principal. Elige el proveedor (`WebApiPostService` está activo y los otros dos están comentados), crea el `PostService` y muestra los posts.

Cambiar la fuente de datos solo requiere cambiar la línea donde se crea el proveedor. `PostService` no se modifica.

**Requisitos para ejecutarlo:**

- `JsonDataBaseService` necesita que exista `../data/local-database.json` y que `resolveJsonModule` esté activado en la configuración de TypeScript. Ese archivo no está dentro de esta carpeta.
- `dependency-b.ts` y `dependency-c.ts` se importan entre sí. Funciona porque `dependency-b` solo usa `PostProvider` como tipo.

---

## Cómo ejecutar los ejemplos

Cada archivo con código ejecutable (`srp.ts`, `open-close-a.ts`, `liskov-a.ts`, `dependency-a.ts`) se puede correr con `ts-node`:

```bash
npx ts-node srp.ts
npx ts-node open-close-a.ts
npx ts-node liskov-a.ts
npx ts-node dependency-a.ts
```

Los ejemplos que usan `fetch` necesitan conexión a internet y Node.js 18 o superior. `segregation.ts` solo declara interfaces y clases, por lo que no imprime nada.
