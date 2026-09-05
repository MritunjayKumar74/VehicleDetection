# Vehicle Detection System

A federated database system for real-time uninsured vehicle detection.

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** Node.js + Express + Mongoose
- **Database:** MongoDB
- **Containerization:** Docker + Docker Compose

## Prerequisites
- Docker Desktop installed
- WSL2 (for Windows users)
- Node.js 20+

## Getting Started

### Windows
1. Right click `setup-windows.bat` → **Run as Administrator**
2. Open http://localhost:3000 (Frontend)
3. Open http://localhost:5000 (Backend API)

### Linux / Mac
```bash
./docker.sh build
```
Then open http://localhost:3000

## Available Commands (docker.sh)
```bash
./docker.sh up        # Start all containers
./docker.sh down      # Stop all containers
./docker.sh build     # Rebuild and start
./docker.sh seed      # Populate database with sample data
./docker.sh logs      # View logs
./docker.sh restart   # Restart all containers
```