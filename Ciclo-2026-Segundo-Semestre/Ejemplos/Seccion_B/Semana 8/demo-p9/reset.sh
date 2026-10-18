#!/usr/bin/env bash
# Vuelve al estado inicial SIN borrar los respaldos.
set -euo pipefail
kubectl delete namespace tienda --ignore-not-found --wait
kubectl apply -f manifiestos/postgres.yaml
kubectl apply -f manifiestos/web-pdb.yaml
kubectl wait --for=condition=available --timeout=180s deploy/postgres -n tienda
kubectl uncordon dr-worker 2>/dev/null || true
kubectl uncordon dr-worker2 2>/dev/null || true
echo "==> Listo. Vuelva a ejecutar ./demo/01-datos.sh para sembrar datos."
