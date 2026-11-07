#!/usr/bin/env bash
# =============================================================================
#  setup.sh - Prepara la demostracion de recuperacion ante desastres.
#  Ejecutar UNA VEZ antes de la clase. Requiere docker, kind, kubectl, velero.
#
#  Idea clave: el respaldo NO vive en el cluster. Corre en un MinIO aparte,
#  como contenedor de Docker. Por eso el cluster se puede borrar entero y los
#  respaldos sobreviven.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Carga imagenes en el cluster kind.
# Docker Desktop con el almacen de containerd guarda solo la arquitectura
# nativa, y "kind load docker-image" importa con --all-platforms: falla con
# "content digest ... not found". El rodeo oficial es exportar unicamente
# linux/amd64 y cargar el archivo resultante.
cargar_imagenes() {
  for img in "$@"; do
    if kind load docker-image "$img" --name dr 2>/dev/null; then
      echo "    cargada: $img"
      continue
    fi
    echo "    $img: usando exportacion de una sola plataforma"
    tar="/tmp/$(echo "$img" | tr '/:' '__').tar"
    docker image save --platform linux/amd64 -o "$tar" "$img"
    kind load image-archive "$tar" --name dr
    rm -f "$tar"
  done
}

echo "==> 1/6 Descargando y preparando imagenes"
docker pull postgres:16-alpine
docker pull nginx:1.27-alpine
docker pull quay.io/minio/minio:latest   # Docker Hub retiro las imagenes de MinIO

echo "==> 2/6 Levantando MinIO FUERA del cluster (almacen de respaldos)"
docker rm -f minio-dr 2>/dev/null || true
docker volume create minio-dr-datos >/dev/null
# El bucket se crea como directorio en el volumen ANTES de arrancar el servidor:
# no depende de que la imagen traiga el cliente 'mc'.
docker run --rm -v minio-dr-datos:/data nginx:1.27-alpine mkdir -p /data/respaldos
docker run -d --name minio-dr \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio12345 \
  -v minio-dr-datos:/data \
  quay.io/minio/minio:latest server /data --console-address ":9001"
sleep 5
docker exec minio-dr mc alias set local http://localhost:9000 minio minio12345 >/dev/null 2>&1 || true
docker exec minio-dr mc mb --ignore-existing local/respaldos >/dev/null 2>&1 || true
docker ps --filter name=minio-dr --format "    MinIO: {{.Status}}"

echo "==> 3/6 Creando el cluster kind"
kind delete cluster --name dr 2>/dev/null || true
kind create cluster --config kind.yaml
cargar_imagenes postgres:16-alpine nginx:1.27-alpine

echo "==> 4/6 Conectando MinIO a la red del cluster"
docker network connect kind minio-dr 2>/dev/null || true

echo "==> 5/6 Instalando Velero apuntando al MinIO externo"
cat > /tmp/credenciales-minio <<CRED
[default]
aws_access_key_id=minio
aws_secret_access_key=minio12345
CRED
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.14.2 \
  --bucket respaldos \
  --secret-file /tmp/credenciales-minio \
  --use-volume-snapshots=false \
  --use-node-agent \
  --backup-location-config region=minio,s3ForcePathStyle=true,s3Url=http://minio-dr:9000
kubectl wait --for=condition=available --timeout=300s deploy/velero -n velero

echo "==> 6/6 Desplegando la aplicacion con datos"
kubectl apply -f manifiestos/postgres.yaml
kubectl apply -f manifiestos/web-pdb.yaml
kubectl wait --for=condition=available --timeout=180s deploy/postgres -n tienda
kubectl wait --for=condition=available --timeout=180s deploy/web -n tienda
kubectl apply -f manifiestos/velero-schedule.yaml

echo ""
echo "==> Listo. Siguiente paso: ./demo/01-datos.sh"
echo "    Consola de MinIO: http://localhost:9001  (minio / minio12345)"
