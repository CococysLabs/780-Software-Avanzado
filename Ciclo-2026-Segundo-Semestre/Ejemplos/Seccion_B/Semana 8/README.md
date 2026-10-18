# Demostración en clase — Práctica 9

Recuperación ante desastres, demostrada en vivo sobre un clúster local `kind`.
Sin nube, sin costos y reproducible en 15 minutos de preparación.

---

## La idea que hace didáctica esta demostración

El almacén de respaldos **no vive dentro del clúster**. Corre como un contenedor
de Docker aparte (MinIO), conectado a la red del clúster. Por eso se puede
destruir el clúster entero delante de la clase y los respaldos siguen ahí.

Esa separación es exactamente lo que le costó la empresa a Code Spaces en 2014,
y aquí se ve funcionando en dos minutos.

---

## Qué se demuestra

| Momento | Qué ve el estudiante | Duración |
|---|---|---|
| Datos reales | 100 pedidos en una base de datos con volumen persistente | 1 min |
| Respaldo con hooks | El volcado ocurre antes de copiar el volumen | 2 min |
| Desastre pequeño | El namespace completo desaparece | 1 min |
| Recuperación | Los 100 pedidos vuelven, verificados uno por uno | 3 min |
| Desastre total | El clúster se destruye y se recrea vacío | 5 min |
| Pérdida de nodo | Se drena un nodo y el servicio no cae, gracias al PDB | 3 min |

---

## Contenido

```
demo-p9/
├── setup.sh                      Prepara todo (antes de la clase)
├── reset.sh                      Vuelve al estado inicial sin borrar respaldos
├── kind.yaml                     Clúster de 3 nodos (para la prueba de drenaje)
├── manifiestos/
│   ├── postgres.yaml             Base de datos con PVC y hooks de Velero
│   ├── web-pdb.yaml              4 réplicas + PodDisruptionBudget + distribución
│   └── velero-schedule.yaml      Respaldo programado con retención (TTL)
└── demo/
    ├── 01-datos.sh               Siembra 100 pedidos verificables
    ├── 02-respaldo.sh            Respaldo bajo demanda, con hooks
    ├── 03-desastre-namespace.sh  Borra el namespace completo
    ├── 04-desastre-cluster.sh    Destruye y recrea el clúster entero
    ├── 05-recuperar.sh           Restaura y verifica el contenido
    ├── 06-drenaje.sh             Drena un nodo con el PDB actuando
    └── trafico.sh                Bucle de curl para el panel derecho
```

---

# PARTE A — Preparación (antes de la clase, ~15 minutos)

## Requisitos

Docker Desktop corriendo con backend WSL 2 y **al menos 6 GB de RAM asignados**
(Velero, MinIO, Postgres y tres nodos juntos no caben en los 2 GB por defecto).
Además `kind`, `kubectl` y el CLI de `velero`.

En Windows, trabaje dentro de WSL: los scripts son Bash. La guía
`README_WINDOWS.md` de la demostración de la P8 cubre la instalación de
herramientas; para esta agregue el CLI de Velero:

```bash
curl -Lo velero.tar.gz https://github.com/vmware-tanzu/velero/releases/latest/download/velero-linux-amd64.tar.gz
tar -xzf velero.tar.gz && sudo install -m 755 velero-*/velero /usr/local/bin/
```

## Levantar todo

```bash
cd demo-p9
./setup.sh
```

El script descarga las imágenes, levanta MinIO como contenedor aparte, crea el
clúster de tres nodos, precarga las imágenes, instala Velero apuntando al MinIO
externo, despliega la base de datos y el servicio web, y activa el respaldo
programado.

## Ensayar

Corra la secuencia completa una vez y **grábela**. El paso 04 (destruir el
clúster) es el más lento y el que más depende de su máquina: cronométrelo para
saber si le cabe en la clase o si conviene proyectar la grabación.

---

# PARTE B — La clase, paso a paso

Dos paneles de terminal con letra grande. El derecho, durante la prueba de
drenaje, corre `./demo/trafico.sh`.

---

## Momento 1 — Los datos existen (1 min)

```bash
./demo/01-datos.sh
```

Se ven 100 pedidos con nombres y montos. **Que la clase vea los últimos cinco**:
son los que van a desaparecer y volver. Sin datos concretos en pantalla, la
recuperación no impresiona a nadie.

---

## Momento 2 — El respaldo, y dónde vive (2 min)

```bash
./demo/02-respaldo.sh
```

Mientras corre, abra `http://localhost:9001` (usuario `minio`, contraseña
`minio12345`) y muestre el bucket `respaldos` llenándose.

**Qué decir:** ese almacén no está en el clúster. Es un contenedor aparte. Si el
clúster desaparece, el respaldo sigue aquí. Y fíjense en los hooks: antes de
copiar el volumen, Velero le pidió a Postgres un volcado consistente. Copiar los
archivos de una base que está escribiendo produce un respaldo que se reporta
exitoso y no sirve.

---

## Momento 3 — El desastre pequeño (1 min)

```bash
./demo/03-desastre-namespace.sh
```

El namespace entero desaparece: aplicación, volumen y datos.

**Qué preguntar:** si tuvieran GitOps configurado, ¿qué volvería solo? La
respuesta es la aplicación, pero no los datos. Esa distinción entre
*reconstruir* y *recuperar* es la idea central de la práctica.

---

## Momento 4 — La recuperación (3 min)

```bash
./demo/05-recuperar.sh
```

Los 100 pedidos vuelven y el script imprime los últimos cinco. **Compárelos en
pantalla con los del momento 1.** Ese es el instante que justifica toda la
práctica: restaurar no es que exista el volumen, es que el contenido esté ahí.

---

## Momento 5 — El desastre total (5 min)

```bash
./demo/04-desastre-cluster.sh   # destruye y recrea el clúster
./demo/05-recuperar.sh          # restaura en el clúster nuevo
```

El clúster completo se borra y se recrea vacío. Velero se reinstala apuntando al
mismo MinIO, ve los respaldos anteriores y restaura los datos en un clúster que
nunca los tuvo.

**Qué decir:** esto es el RTO real. Cronométrenlo. Y noten lo que se perdió: todo
lo ocurrido entre el último respaldo y el desastre. Ese es el RPO.

Si el tiempo aprieta, proyecte aquí la grabación del ensayo.

---

## Momento 6 — La pérdida de un nodo (3 min)

En el panel derecho:

```bash
./demo/trafico.sh
```

En el izquierdo:

```bash
./demo/06-drenaje.sh
```

Se ve la distribución de réplicas entre nodos, el PodDisruptionBudget exigiendo
un mínimo de tres disponibles, y el drenaje ocurriendo **sin que el flujo de
códigos 200 se interrumpa**.

Para el contraste, borre el PDB y repita: ahí sí aparecen errores.

```bash
kubectl delete pdb web -n tienda
kubectl uncordon dr-worker && ./demo/06-drenaje.sh
```

---

## Cierre

Vuelva a preguntar lo del inicio: si perdieran su clúster ahora mismo, ¿cuánto
tardarían en volver y qué datos no volverían. Después de ver esto, la pregunta ya
no es retórica.

---

# Operación

**Repetir un momento:**

```bash
./reset.sh && ./demo/01-datos.sh
```

**Si todo se rompe:**

```bash
kind delete cluster --name dr && ./setup.sh
```

**Si solo tiene 20 minutos:** quédese con los momentos 1, 2, 3 y 4. El desastre
total y el drenaje son el complemento.

---

# Advertencias

- **El respaldo programado corre cada 10 minutos**, valor elegido para que
  durante la clase se vea ocurrir. En producción sería diario o cada varias
  horas; dígalo en voz alta para que nadie copie ese cron.
- **El hook de Postgres escribe el volcado dentro del propio volumen**, lo cual
  simplifica la demostración pero no es lo ideal en producción, donde el volcado
  debería ir a un destino separado. Es un buen punto para señalar en clase.
- **MinIO con credenciales en texto plano** está bien para una demostración
  local. En la práctica se pide gestión de secretos; no deje que nadie copie
  este patrón a su entrega.
- **`kind delete cluster` borra los volúmenes del clúster, no el volumen de
  Docker de MinIO.** Ese es justamente el punto, pero significa que para empezar
  de cero de verdad hay que borrar también `minio-dr-datos`.
- **El nombre de los nodos** es `dr-worker` y `dr-worker2`. Si cambia el nombre
  del clúster en `kind.yaml`, ajuste el argumento de `06-drenaje.sh`.
