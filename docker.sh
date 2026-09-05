#!/bin/bash

case "$1" in
  up)
    docker-compose up 2>&1 | grep -v "vehicle_mongo"
    ;;
  down)
    docker-compose down
    ;;
  build)
    docker-compose up --build 2>&1 | grep -v "vehicle_mongo"
    ;;
  seed)
    docker exec -it vehicle_backend node src/seed.js
    ;;
  logs)
    docker-compose logs -f
    ;;
  restart)
    docker-compose down && docker-compose up 2>&1 | grep -v "vehicle_mongo"
    ;;
  *)
    echo "Usage: ./docker.sh [up|down|build|seed|logs|restart]"
    ;;
esac