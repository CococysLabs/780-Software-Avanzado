#!/usr/bin/env bash
# Perdida de un nodo con el servicio recibiendo peticiones.
# El PodDisruptionBudget impide que Kubernetes desaloje demasiadas replicas.
set -euo pipefail
NODO="${1:-dr-worker}"
echo "==> Distribucion actual de replicas:"
kubectl get pods -n tienda -l app=web -o wide | awk '{print $1, $7}'
echo ""
echo "==> Estado del PodDisruptionBudget:"
kubectl get pdb -n tienda
echo ""
echo "==> Drenando el nodo $NODO (deje corriendo el bucle de curl en otra terminal)"
kubectl drain "$NODO" --ignore-daemonsets --delete-emptydir-data --force
echo ""
kubectl get pods -n tienda -l app=web -o wide | awk '{print $1, $7}'
echo ""
echo "==> Para devolver el nodo:  kubectl uncordon $NODO"
