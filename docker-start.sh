#!/bin/bash
# Start docker services with proper group permissions
cd /home/renanccastro/Work/maillm
docker compose up -d postgres redis
