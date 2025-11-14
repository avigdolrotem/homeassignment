# SRE Home Test Assignment

A full-stack application demonstrating TiDB, TiCDC, Kafka, and monitoring components, packaged with Docker Compose for quick deployment.

## Prerequisites

- Docker Desktop
- Docker Compose
- Git

## Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd home_assingment
```

### 2. Start all services
```bash
docker-compose up -d
```

Docker will automatically create the `data/` directory and initialize the TiDB cluster.
**Wait 30–60 seconds** for all services to fully start.

### 3. Create the CDC Changefeed
```bash
docker-compose exec ticdc /cdc cli changefeed create   --pd=http://pd:2379   --sink-uri="kafka://kafka:29092/tidb-cdc?protocol=canal-json"   --changefeed-id="tidb-kafka-changefeed"
```

### 4. Access the application

- **Web Interface:** http://localhost:8080
- **Default Credentials:**
  - Username: `admin`
  - Password: `admin123`

## Verify Everything Works

### Check running containers:
```bash
docker-compose ps
```

### Check database status:
```bash
curl http://localhost:3000/api/db-status
```

### View API logs:
```bash
docker-compose logs api
```

### View CDC consumer logs:
```bash
docker-compose logs cdc-consumer
```

## Architecture Overview

### Components
- **Frontend:** Static HTML/JS served via Nginx (port 8080)
- **Backend API:** Node.js + Express (port 3000)
- **Database:** TiDB distributed SQL database
  - PD: Placement Driver
  - TiKV: KV storage engine
  - TiDB: SQL compute layer
- **Message Queue:** Apache Kafka + Zookeeper
- **CDC:** TiCDC for real-time change data capture
- **CDC Consumer:** Node.js Kafka consumer
- **Logging:** log4js for structured JSON logs

## Features Implemented

✔ User authentication (bcrypt + JWT)
✔ TiDB distributed SQL cluster
✔ Real-time CDC (TiCDC → Kafka → consumer)
✔ Kafka streaming pipeline
✔ Structured logging (API + CDC events)
✔ Single-command deployment
✔ Automatic DB initialization

## Testing the Full Flow

1. Login at http://localhost:8080 using `admin/admin123`.
2. Check API logs:
   ```bash
   docker-compose logs api --tail=10
   ```
3. Check CDC consumer events:
   ```bash
   docker-compose logs cdc-consumer --tail=10
   ```
4. Verify DB connectivity:
   ```bash
   curl http://localhost:3000/api/db-status
   ```


## Cleanup

### Stop all containers
```bash
docker-compose down
```

### Remove all persistent data (optional)
```bash
docker-compose down -v
rm -rf data/
```

## Troubleshooting

### Containers not starting?
```bash
docker-compose logs -f
```

### API cannot connect to DB?
```bash
docker-compose restart api
```

### Reset the entire environment
```bash
docker-compose down -v
rm -rf data/
docker-compose up -d
```
