# Jenkins: qué es, cómo funciona y cómo se usa en este proyecto

## 1. ¿Qué es Jenkins?

Jenkins es un servidor de **automatización** open source, escrito en Java, que se usa sobre todo para **CI/CD**:

- **CI (Integración Continua):** cada vez que alguien sube código, se instalan dependencias, se compila y se prueba automáticamente para detectar errores pronto.
- **CD (Entrega/Despliegue Continuo):** si todo sale bien, el resultado (un artefacto, una imagen Docker, etc.) se publica o despliega solo.

En lugar de ejecutar a mano `npm install`, `npm run build`, `docker build`, `docker push` en cada cambio, Jenkins lo hace por ti, siempre igual y dejando un historial.

## 2. Conceptos clave

| Concepto | Qué es |
|---|---|
| **Controller (master)** | El servidor Jenkins con la interfaz web. Planifica y coordina los trabajos. |
| **Agent (node)** | La máquina (o contenedor) que realmente ejecuta los comandos. |
| **Job / Pipeline** | La tarea automatizada que defines. |
| **Jenkinsfile** | Archivo de texto en el repositorio que describe el pipeline ("pipeline as code"). |
| **Stage** | Una fase del pipeline (Install, Build, ...). Se ven como cajas en la interfaz. |
| **Step** | Un comando dentro de un stage (`sh '...'`). |
| **Plugin** | Extensiones (Git, Docker, NodeJS, Credentials...). Jenkins se apoya mucho en ellos. |
| **Credentials** | Almacén seguro de usuarios/contraseñas/tokens, para no escribirlos en el código. |
| **Trigger** | Lo que dispara el pipeline: un push (webhook), un cron, un botón manual... |

## 3. Cómo funciona (flujo general)

```
Desarrollador ──push──▶ GitHub ──webhook / polling──▶ Jenkins (controller)
                                                          │
                                                          ▼
                                                    Agent ejecuta el Jenkinsfile
                                                          │
                              ┌───────────────────────────┼───────────────────────────┐
                              ▼                           ▼                           ▼
                        npm install                 npm run build              docker build / push
                                                                                      │
                                                                                      ▼
                                                                                 Docker Hub
```

1. Se sube código al repositorio.
2. Jenkins detecta el cambio (webhook o consulta periódica).
3. Descarga el repositorio y busca el `Jenkinsfile` en la raíz.
4. Un agent ejecuta los stages **en orden**. Si uno falla, el pipeline se detiene y se marca en rojo.
5. Queda registrado el resultado, los logs y la duración de cada ejecución.

## 4. Este mini ejemplo

Es una API hecha con **NestJS** (módulos `estudiante`, `practica`, `proyecto`) empaquetada con **Docker**. El pipeline construye la app y publica la imagen en **Docker Hub**.

Archivos relevantes:

- [Jenkinsfile](Jenkinsfile): define el pipeline.
- [Dockerfile](Dockerfile): define cómo se construye la imagen.
- `package.json`: scripts de npm (`build`, etc.).

### 4.1 El Jenkinsfile, línea por línea

```groovy
pipeline {
    agent any
```
Declarative Pipeline. `agent any` = ejecutar en cualquier agent disponible.

```groovy
    tools {
        nodejs "node18"
    }
```
Usa la instalación de Node.js llamada `node18`, configurada previamente en *Manage Jenkins → Tools* (requiere el plugin **NodeJS**). Así `npm` está disponible en el PATH.

```groovy
    environment {
        IMAGE = "kevinpozuelos/nest-app"
        TAG = "latest"
    }
```
Variables de entorno disponibles en todos los stages. La imagen final será `kevinpozuelos/nest-app:latest`.

### 4.2 Los stages

| # | Stage | Comando | Qué hace |
|---|---|---|---|
| 1 | **Install** | `npm install` | Descarga las dependencias del proyecto. |
| 2 | **Build** | `npm run build` | Compila TypeScript a JavaScript (carpeta `dist/`) con Nest. Si hay errores de compilación, el pipeline falla aquí. |
| 3 | **Docker Build** | `docker build -t $IMAGE:$TAG .` | Construye la imagen usando el `Dockerfile`. |
| 4 | **Push** | `docker login` + `docker push` | Inicia sesión en Docker Hub y sube la imagen. |

### 4.3 El stage Push y las credenciales

```groovy
withCredentials([usernamePassword(
    credentialsId: 'dockerhub',
    usernameVariable: 'DOCKER_USER',
    passwordVariable: 'DOCKER_PASS'
)]) {
    sh '''
    echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
    docker push $IMAGE:$TAG
    '''
}
```

- `dockerhub` es el **ID de una credencial** guardada en Jenkins (*Manage Jenkins → Credentials*), con tu usuario y token de Docker Hub.
- `withCredentials` inyecta usuario y contraseña como variables **solo dentro de ese bloque**, y Jenkins las enmascara (`****`) en los logs.
- `--password-stdin` evita que la contraseña aparezca en la línea de comandos.
- Así el secreto nunca vive en el repositorio.

### 4.4 El Dockerfile (multi-stage)

Tiene tres etapas para que la imagen final sea pequeña:

1. **deps:** instala `node_modules`.
2. **build:** copia el código y ejecuta `npm run build`.
3. **prod:** copia solo `node_modules` y `dist/`, expone el puerto `3000` y arranca con `node dist/main.js`.

Los compiladores y el código fuente TypeScript no acaban en la imagen final.

### 4.5 Resumen visual del pipeline

```
[Install] ──▶ [Build] ──▶ [Docker Build] ──▶ [Push]
npm install   nest build   docker build     docker login + push
                                              └─▶ Docker Hub: kevinpozuelos/nest-app:latest
```

## 5. Requisitos para que funcione

- Jenkins con los plugins **Pipeline**, **Git**, **NodeJS**, **Credentials Binding**.
- Una instalación de Node configurada con el nombre exacto `node18`.
- Un agent con **Docker instalado**, y el usuario `jenkins` con permiso para usarlo (grupo `docker`). Si Jenkins corre en un contenedor, hay que montar el socket `/var/run/docker.sock`.
- Una credencial de tipo *Username with password* con ID `dockerhub`.
- Un job de tipo **Pipeline** (o Multibranch) apuntando al repositorio, con *Script Path* = `Jenkinsfile`.
- Agent Linux/macOS: se usa `sh`. En Windows habría que usar `bat`.

## 6. Cómo ejecutarlo

1. En Jenkins: *New Item → Pipeline*.
2. En *Pipeline*, elegir **Pipeline script from SCM**, seleccionar Git, poner la URL del repo y la rama `main`.
3. Guardar y pulsar **Build Now**.
4. Revisar *Console Output* para ver los logs de cada stage.
5. (Opcional) Configurar un webhook de GitHub para que se ejecute en cada push.

## 7. Posibles mejoras

- **Tests:** añadir un stage `npm test` antes del build (hay `test/` y Jest en el proyecto).
- **Lint:** stage con `npm run lint` (ya existe `eslint.config.mjs`).
- **Etiquetas únicas:** usar `TAG = "${BUILD_NUMBER}"` o el hash del commit en vez de `latest`, para poder volver a versiones anteriores.
- **Limpieza:** bloque `post { always { sh 'docker logout' } }`.
- **Despliegue:** stage final que haga `docker run`/`kubectl`/`docker compose` en el servidor.
- **Notificaciones:** avisar por correo o Slack si el build falla.
- **Condiciones:** hacer `Push` solo en la rama `main` con `when { branch 'main' }`.
- **Variables sensibles de la app:** la app usa un `.env` (ver `.env.template`); no debe incluirse en la imagen, pásalo en tiempo de ejecución.

## 8. Glosario rápido

- **Pipeline as code:** el proceso de build vive versionado junto al código.
- **Declarative vs Scripted:** este ejemplo es *Declarative* (estructura fija `pipeline { ... }`), más simple y legible que *Scripted* (Groovy libre).
- **Artefacto:** el resultado del build; aquí, la imagen Docker.
- **Webhook:** aviso HTTP que GitHub envía a Jenkins cuando hay un push.
