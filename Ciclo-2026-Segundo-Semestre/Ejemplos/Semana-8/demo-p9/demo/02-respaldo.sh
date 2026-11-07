#!/usr/bin/env bash
# Respaldo bajo demanda. Dispara los hooks: vuelca la base ANTES de copiar el volumen.
set -euo pipefail
NOMBRE="clase-$(date +%H%M%S)"
velero backup create "$NOMBRE" --include-namespaces tienda --default-volumes-to-fs-backup --wait
echo ""
velero backup describe "$NOMBRE" --details | head -30
echo ""
echo "El respaldo vive FUERA del cluster: http://localhost:9001 -> bucket 'respaldos'"
echo "$NOMBRE" > /tmp/ultimo-respaldo-p9
