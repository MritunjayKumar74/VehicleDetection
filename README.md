# Vehicle Detection System

A federated database system for real-time uninsured vehicle detection. Aggregates data from 5 independently-designed data sources — camera sightings, insurance records, RTO registration, theft records, and MOT reports — into a single, unified vehicle profile via a mediator/wrapper architecture.

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** Node.js + Express + Mongoose
- **Databases:**
  - MongoDB — camera sightings (`cameradb`), theft records (`theftdb`), materialized view cache
  - PostgreSQL — insurance records (`insurancedb`), MOT reports (`motdb`)
  - MySQL — RTO vehicle registrations (`rtodb`), search logs
- **Containerization:** Docker + Docker Compose

## Architecture

Each data source is designed in isolation with its own schema and field names. A federated query engine queries all 5 sources in parallel, maps local fields to a global canonical schema (`schemaRegistry.js`), and merges the results into a single `VehicleProfile`. Results are cached in a MongoDB-backed materialized view for fast repeat lookups, with staleness tracking and manual refresh support. A consistency checker validates data across sources.

```
Search plate
     ↓
Check materialized view (cache)
     ↓ HIT                    ↓ MISS / STALE
Return cached profile     Federated query (5 sources, parallel)
                                  ↓
                           Map to global schema
                                  ↓
                           Store in materialized view
                                  ↓
                           Return profile
```

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
./docker.sh seed
```
Then open http://localhost:3000

## Available Commands (docker.sh)
```bash
./docker.sh up        # Start all containers
./docker.sh down      # Stop all containers
./docker.sh build     # Rebuild and start all containers
./docker.sh seed      # Populate all 5 databases with sample data (40 vehicles)
./docker.sh logs      # View logs
./docker.sh restart   # Restart all containers
./docker.sh frontend  # Rebuild & restart frontend only
./docker.sh backend   # Rebuild & restart backend only
```

## API Routes
```
GET /api/vehicle/:plate           # Full federated lookup for a plate (cache-first)
GET /api/vehicle/:plate?refresh=true  # Force a fresh federated query, bypassing cache
GET /api/vehicle/history/recent   # Recent search history
```

## Sample Data
`./docker.sh seed` generates 40 vehicles distributed roughly as:
- 65% clear
- 15% uninsured
- 12% expired insurance
- 8% stolen
