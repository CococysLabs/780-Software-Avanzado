# Usar Helm para desplegar los microservicios en Kubernetes

Helm es el "gestor de paquetes" de Kubernetes: agrupa los YAML (Deployments, Services, Secrets...) en un **chart** parametrizable con `values.yaml`.
Esta guía parte del chart de ejemplo en [K8s/ejemplo](products-app/K8s/ejemplo).

## 1. Requisitos

* Un clúster local o remoto (Docker Desktop con Kubernetes, minikube, kind, GKE...).
* `kubectl` y `helm` instalados.

```bash
kubectl get nodes
helm version
```

## 2. Estructura de un chart

```
K8s/ejemplo/
├── Chart.yaml        # nombre y versión del chart
├── values.yaml       # valores configurables
├── .helmignore
└── templates/        # YAML con plantillas Go ({{ .Values... }})
    ├── api-gateway/
    │   ├── deployment.yml
    │   └── service.yml
    ├── products-ms/
    └── auth-ms/
```

`helm create <nombre>` genera plantillas de ejemplo (nginx). Para este proyecto se **borra** el contenido de `templates/` y se escriben los YAML propios.

## 3. Comandos básicos

| Acción | Comando |
|---|---|
| Crear chart | `helm create <nombre>` |
| Instalar | `helm install <release> .` |
| Actualizar | `helm upgrade <release> .` |
| Instalar o actualizar | `helm upgrade --install <release> .` |
| Ver releases | `helm list` |
| Ver YAML generado sin aplicar | `helm template <release> .` |
| Validar el chart | `helm lint .` |
| Simular instalación | `helm install <release> . --dry-run --debug` |
| Volver a versión anterior | `helm rollback <release> <revisión>` |
| Historial | `helm history <release>` |
| Desinstalar | `helm uninstall <release>` |

## 4. Paso 1: construir las imágenes

Con clúster local el ejemplo usa `imagePullPolicy: Never`, así que la imagen debe existir en el Docker del clúster.

```bash
docker build -t api-gateway ./api-gateway
docker build -t products-ms ./products-ms
docker build -t auth-ms ./auth

# minikube: cargar las imágenes al clúster
minikube image load api-gateway
minikube image load products-ms
minikube image load auth-ms
```

> Los dockerfiles actuales ejecutan `npm run start:dev`. Para Kubernetes conviene una imagen de producción (`npm run build` + `node dist/main`).
> Con registro remoto (Artifact Registry, Docker Hub) se usa `imagePullPolicy: IfNotPresent` y un `imagePullSecret` (ver [README](README.md)).

## 5. Paso 2: instalar NATS

Los microservicios necesitan el broker dentro del clúster. Lo más simple es el chart oficial:

```bash
helm repo add nats https://nats-io.github.io/k8s/helm/charts/
helm repo update
helm install nats nats/nats
kubectl get svc          # debe aparecer el Service "nats" en el puerto 4222
```

Dentro del clúster se accede por DNS: `nats://nats:4222` (o `nats://nats.<namespace>.svc.cluster.local:4222`).
Eso es lo que va en `NATS_SERVERS` (el deployment de ejemplo usa `nats://nats`; poner el puerto explícito es más seguro).

## 6. Paso 3: parametrizar con values.yaml

Reemplazar el `values.yaml` por uno propio. Ejemplo:

```yaml
nats:
  servers: "nats://nats:4222"

apiGateway:
  image: api-gateway
  tag: latest
  replicas: 1
  port: 3000
  pullPolicy: Never
  serviceType: NodePort     # accesible desde fuera del clúster

productsMs:
  image: products-ms
  tag: latest
  replicas: 2
  port: 3001
  pullPolicy: Never

authMs:
  image: auth-ms
  tag: latest
  replicas: 1
  port: 3002
  pullPolicy: Never
```

## 7. Paso 4: plantillas

### 7.1 `templates/api-gateway/deployment.yml`

Convierte el [deployment actual](products-app/K8s/ejemplo/templates/api-gateway/deployment.yml) (valores fijos) en plantilla:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  labels:
    app: api-gateway
spec:
  replicas: {{ .Values.apiGateway.replicas }}
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: "{{ .Values.apiGateway.image }}:{{ .Values.apiGateway.tag }}"
          imagePullPolicy: {{ .Values.apiGateway.pullPolicy }}
          ports:
            - containerPort: {{ .Values.apiGateway.port }}
          env:
            - name: PORT
              value: "{{ .Values.apiGateway.port }}"
            - name: NATS_SERVERS
              value: "{{ .Values.nats.servers }}"
```

### 7.2 `templates/api-gateway/service.yml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  type: {{ .Values.apiGateway.serviceType }}
  selector:
    app: api-gateway
  ports:
    - port: {{ .Values.apiGateway.port }}
      targetPort: {{ .Values.apiGateway.port }}
```

* `ClusterIP`: solo dentro del clúster. `NodePort`: accesible desde fuera.
* **Solo el gateway necesita Service.** `products-ms` y `auth-ms` solo hablan con NATS (conexiones salientes), no reciben tráfico directo, así que **no requieren Service**.

### 7.3 `templates/products-ms/deployment.yml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: products-ms
  labels:
    app: products-ms
spec:
  replicas: {{ .Values.productsMs.replicas }}
  selector:
    matchLabels:
      app: products-ms
  template:
    metadata:
      labels:
        app: products-ms
    spec:
      containers:
        - name: products-ms
          image: "{{ .Values.productsMs.image }}:{{ .Values.productsMs.tag }}"
          imagePullPolicy: {{ .Values.productsMs.pullPolicy }}
          env:
            - name: PORT
              value: "{{ .Values.productsMs.port }}"
            - name: NATS_SERVERS
              value: "{{ .Values.nats.servers }}"
            - name: DB_HOST_USER
              valueFrom: { secretKeyRef: { name: products-db, key: host } }
            - name: DB_PORT
              valueFrom: { secretKeyRef: { name: products-db, key: port } }
            - name: DB_USER
              valueFrom: { secretKeyRef: { name: products-db, key: user } }
            - name: DB_PW
              valueFrom: { secretKeyRef: { name: products-db, key: password } }
            - name: DB_NAME
              valueFrom: { secretKeyRef: { name: products-db, key: name } }
```

`templates/auth-ms/deployment.yml` es igual, cambiando nombres, `authMs`, el secret `auth-db` y añadiendo `JWT_SECRET` desde un secret.

Con varias réplicas de `products-ms` NATS reparte las peticiones entre ellas solo si comparten *queue group*. Para el patrón request/response de Nest, define `queue: 'products-ms'` en las `options` del transporte NATS del microservicio para que **una sola** réplica procese cada mensaje:

```ts
options: { servers: envs.natsServers, queue: 'products-ms' }
```

## 8. Paso 5: secretos (no los pongas en values.yaml)

Crear los secretos con `kubectl` antes de instalar el chart:

```bash
kubectl create secret generic products-db \
  --from-literal=host=<HOST> --from-literal=port=5432 \
  --from-literal=user=<USER> --from-literal=password=<PASSWORD> \
  --from-literal=name=<DB>

kubectl create secret generic auth-db \
  --from-literal=host=<HOST> --from-literal=port=5432 \
  --from-literal=user=<USER> --from-literal=password=<PASSWORD> \
  --from-literal=name=<DB>

kubectl create secret generic jwt --from-literal=secret=<JWT_SECRET>
```

Más detalles (editar, exportar, secrets de registro de imágenes) en el [README](README.md).

## 9. Paso 6: desplegar

Desde `K8s/ejemplo`:

```bash
helm lint .
helm template ejemplo .          # revisar el YAML resultante
helm install ejemplo .           # primera vez
helm upgrade ejemplo .           # tras cambiar plantillas o values
```

Cambiar un valor sin editar archivos:

```bash
helm upgrade ejemplo . --set productsMs.replicas=3
# o con otro archivo de valores por entorno
helm upgrade --install ejemplo . -f values-prod.yaml
```

## 10. Verificar

```bash
kubectl get pods
kubectl get deployments
kubectl get services
kubectl logs deployment/products-ms
kubectl describe pod <nombre-del-pod>
```

Acceso al gateway:

```bash
# minikube
minikube service api-gateway --url
# cualquier clúster (túnel local)
kubectl port-forward svc/api-gateway 3000:3000
curl http://localhost:3000/products
```

## 11. Errores comunes

| Síntoma | Causa / solución |
|---|---|
| `ErrImageNeverPull` | La imagen no está en el clúster: `minikube image load <img>` o construirla con el Docker del clúster |
| `ImagePullBackOff` | Registro privado sin `imagePullSecret`, o nombre/tag incorrecto |
| `CrashLoopBackOff` | Ver `kubectl logs <pod>`; normalmente falta una variable de entorno o NATS no es alcanzable |
| `CreateContainerConfigError` | El secret referenciado no existe (créalo antes de `helm install`) |
| Gateway da timeout | NATS no está instalado, `NATS_SERVERS` mal escrito, o el microservicio no corre |
| `helm install` dice "cannot re-use a name" | Ya existe la release: usar `helm upgrade` o `helm uninstall` |
| Error de codificación en YAML (PowerShell) | Generar con `\| Out-File ./deployment.yml -Encoding UTF8` |

## 12. Flujo de trabajo recomendado

1. `docker build` de la imagen modificada y cargarla al clúster.
2. Editar plantillas o `values.yaml`.
3. `helm lint .` → `helm template ejemplo .`.
4. `helm upgrade --install ejemplo .`.
5. `kubectl get pods` / `kubectl logs` para validar.
6. Si algo falla: `helm rollback ejemplo <revisión>`.
