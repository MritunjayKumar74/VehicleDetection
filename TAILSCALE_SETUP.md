# VehicleDetection: 5 logical databases on 3 devices

## Device split

- **Sukhmani — 100.123.96.57**
  - DB2 Insurance PostgreSQL
  - DB5 MOT PostgreSQL
  - Backend
  - Frontend
- **Sourabh — 100.68.229.43**
  - DB1 Camera MongoDB (`cameradb`)
  - DB4 Theft MongoDB (`theftdb`)
- **Mritunjay — 100.121.88.41**
  - DB3 RTO MySQL (`rtodb`)

Tailscale only provides the private network. The database data remains on the device hosting each database.

## 1. Apply the patch on all three copies of the repository

From the repository root:

```bash
git apply tailscale-3-device-setup.patch
```

## 2. Verify Tailscale

Each person should run:

```bash
tailscale status
tailscale ip -4
```

Sukhmani should verify both remote devices:

```bash
tailscale ping 100.68.229.43
tailscale ping 100.121.88.41
```

## 3. Stop the normal all-in-one stack

Before starting the device-specific files, run this on each machine:

```bash
docker compose down
```

## 4. Sourabh: start Camera + Theft MongoDB

```bash
docker compose -f docker-compose.sourabh.yml up -d
docker ps
```

Expected port:

```text
0.0.0.0:27017->27017
```

MongoDB contains the two logical databases used by the application: `cameradb` and `theftdb`.

## 5. Mritunjay: start RTO MySQL

```bash
docker compose -f docker-compose.mritunjay.yml up -d
docker ps
```

Expected port:

```text
0.0.0.0:3306->3306
```

If Windows Firewall asks whether Docker may accept connections, allow it on the private network.

## 6. Sukhmani: verify remote database ports

After Sourabh and Mritunjay have started their services:

```bash
nc -vz 100.68.229.43 27017
nc -vz 100.121.88.41 3306
```

Both tests must succeed before starting the federated backend.

## 7. Sukhmani: create the distributed environment file

```bash
cp .env.tailscale.example .env.tailscale
```

The supplied defaults are the current three Tailscale addresses. If an address changes, edit `.env.tailscale`.

## 8. Sukhmani: start Insurance + MOT + backend + frontend

```bash
docker compose --env-file .env.tailscale -f docker-compose.sukhmani.yml up -d --build
```

Check:

```bash
docker ps
```

Sukhmani should have:

```text
vehicle_postgres
vehicle_postgres_mot
vehicle_backend
vehicle_frontend
```

Sukhmani should not need a local `vehicle_mongo` or `vehicle_mysql` in distributed mode.

## 9. Check all five logical source connections

```bash
docker logs vehicle_backend --tail 100
```

Expected connection messages:

```text
[DB1] MongoDB cameradb connected
[DB4] MongoDB theftdb connected
[DB2] PostgreSQL insurancedb connected + schema ready
[DB3] MySQL rtodb connected + schema ready
[DB5] PostgreSQL motdb connected + schema ready
```

## 10. Seed only if these distributed database instances need data

Run only if the team agrees that the databases should be seeded/reset:

```bash
docker exec -it vehicle_backend node src/seed.js
```

Because the backend is connected to the distributed hosts, seeding writes to the databases across the three devices.

## 11. Open the application

```text
http://localhost:3001
```

Test:

```text
Show red Tata SUVs near Gurugram
```

Physical source placement:

- DB1 Camera -> Sourabh
- DB2 Insurance -> Sukhmani
- DB3 RTO -> Mritunjay
- DB4 Theft -> Sourabh
- DB5 MOT -> Sukhmani

## 12. Demonstrate source autonomy

Mritunjay can temporarily stop RTO:

```bash
docker stop vehicle_mysql
```

Run a federated query and observe the source becoming unavailable while the other independent sources remain available.

Restore it:

```bash
docker start vehicle_mysql
```

## Shutdown

Sukhmani:

```bash
docker compose --env-file .env.tailscale -f docker-compose.sukhmani.yml down
```

Sourabh:

```bash
docker compose -f docker-compose.sourabh.yml down
```

Mritunjay:

```bash
docker compose -f docker-compose.mritunjay.yml down
```
