#!/usr/bin/env bash
# Restauracion. Funciona igual tras perder el namespace o el cluster completo.
set -euo pipefail
RESPALDO="${1:-$(cat /tmp/ultimo-respaldo-p9 2>/dev/null || velero backup get -o name | head -1 | cut -d/ -f2)}"
echo "==> Restaurando desde: $RESPALDO"
velero restore create --from-backup "$RESPALDO" --wait
kubectl wait --for=condition=available --timeout=300s deploy/postgres -n tienda
echo ""
POD=$(kubectl get pod -n tienda -l app=postgres -o jsonpath='{.items[0].metadata.name}')
echo "=== Pedidos despues de la restauracion ==="
kubectl exec -n tienda "$POD" -- psql -U postgres -d tienda -t -c "SELECT count(*) FROM pedidos;"
kubectl exec -n tienda "$POD" -- psql -U postgres -d tienda -c "SELECT * FROM pedidos ORDER BY id DESC LIMIT 5;"
