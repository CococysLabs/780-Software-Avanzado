#!/usr/bin/env bash
# Desastre total: se pierde el cluster entero. Los respaldos sobreviven en MinIO.
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
echo "==> Destruyendo el cluster completo..."
kind delete cluster --name dr
echo "==> Recreando un cluster VACIO..."
kind create cluster --config kind.yaml
cargar_imagenes postgres:16-alpine nginx:1.27-alpine
docker network connect kind minio-dr 2>/dev/null || true
echo "==> Reinstalando Velero apuntando al MISMO almacen de respaldos..."
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.14.2 \
  --bucket respaldos \
  --secret-file /tmp/credenciales-minio \
  --use-volume-snapshots=false \
  --use-node-agent \
  --backup-location-config region=minio,s3ForcePathStyle=true,s3Url=http://minio-dr:9000
kubectl wait --for=condition=available --timeout=300s deploy/velero -n velero
echo ""
echo "==> Cluster nuevo y vacio. Respaldos visibles desde el:"
velero backup get
