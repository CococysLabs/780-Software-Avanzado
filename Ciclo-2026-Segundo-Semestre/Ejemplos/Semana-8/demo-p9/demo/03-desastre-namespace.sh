#!/usr/bin/env bash
# Desastre pequeno: se pierde el namespace completo. 30 segundos.
set -euo pipefail
echo "==> Borrando el namespace 'tienda' con todo adentro..."
kubectl delete namespace tienda --wait=true
echo ""
kubectl get all -n tienda 2>&1 | tail -1
echo "==> Ya no existe nada. Ni la aplicacion, ni el volumen, ni los datos."
