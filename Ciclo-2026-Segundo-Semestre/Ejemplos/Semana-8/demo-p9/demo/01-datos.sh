#!/usr/bin/env bash
# Crea datos reales y verificables. Lo que se pierde y se recupera en la demo.
set -euo pipefail
POD=$(kubectl get pod -n tienda -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n tienda "$POD" -- psql -U postgres -d tienda -c "
  CREATE TABLE IF NOT EXISTS pedidos (id serial primary key, cliente text, monto numeric, creado timestamp default now());
  INSERT INTO pedidos (cliente, monto)
  SELECT 'cliente-' || g, (random()*500)::numeric(10,2) FROM generate_series(1,100) g;"
echo ""
echo "=== Pedidos en la base ==="
kubectl exec -n tienda "$POD" -- psql -U postgres -d tienda -t -c "SELECT count(*) FROM pedidos;"
kubectl exec -n tienda "$POD" -- psql -U postgres -d tienda -c "SELECT * FROM pedidos ORDER BY id DESC LIMIT 5;"
