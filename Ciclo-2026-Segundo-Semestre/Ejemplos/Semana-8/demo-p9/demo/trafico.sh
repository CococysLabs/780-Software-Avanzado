#!/usr/bin/env bash
# Bucle de trafico: dejarlo corriendo en un panel aparte durante el drenaje.
while true; do
  curl -s -o /dev/null -w "%{http_code} " http://localhost:8080/
  sleep 0.3
done
