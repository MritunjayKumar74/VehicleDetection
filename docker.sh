#!/bin/bash

case "$1" in

  up)
    docker-compose up 2>&1 | grep -v "vehicle_mongo"
    ;;

  down)
    docker-compose down
    ;;

  frontend)
    echo "Building frontend..."
    docker-compose build --no-cache frontend
    docker-compose up -d frontend
    echo "Frontend rebuilt and restarted."
    ;;

  backend)
    echo "Building backend..."
    docker-compose build --no-cache backend
    docker-compose up -d backend
    echo "Backend rebuilt and restarted."
    ;;

  build)
    echo "Building all services..."
    docker-compose build --no-cache
    docker-compose up 2>&1 | grep -v "vehicle_mongo"
    ;;

  seed)
    docker exec -it vehicle_backend node src/seed.js
    ;;

  logs)
    docker-compose logs -f
    ;;

  restart)
    docker-compose down
    docker-compose build --no-cache
    docker-compose up 2>&1 | grep -v "vehicle_mongo"
    ;;

  *)
    echo "Usage: ./docker.sh [up|down|frontend|backend|build|seed|logs|restart]"
    ;;

esac