# SRE Home Test Assignment

Full-stack application with TiDB distributed database, real-time CDC pipeline via Kafka, and structured logging.

## Prerequisites

- Docker Desktop (with Docker Compose)
- Git

## Quick Start

```bash
# Clone and start
git clone https://github.com/avigdolrotem/homeassignment/
cd home_assingment
docker-compose up -d

# Wait 60-90 seconds for initialization
docker-compose logs ticdc-init -f  # Monitor CDC setup (optional)
```

Access the application at **http://localhost:8080**

**Default credentials:** `admin` / `admin123`

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Client    │────▶│  API (JWT)  │────▶│  TiDB Cluster    │
│  (Nginx)    │     │  (Node.js)  │     │  (PD/TiKV/TiDB)  │
└─────────────┘     └─────────────┘     └──────────────────┘
                            │                      │
                            │                      ▼
                            │              ┌──────────────┐
                            │              │    TiCDC     │
                            │              │ (CDC Stream) │
                            │              └──────┬───────┘
                            │                     │
                            ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │   log4js     │     │    Kafka     │
                    │  (Logging)   │     │  (Message Q) │
                    └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                                         ┌──────────────┐
                                         │ CDC Consumer │
                                         │  (Node.js)   │
                                         └──────────────┘
```

### Components

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| **Client** | Nginx | 8080 | Static frontend |
| **API** | Node.js + Express | 3000 | RESTful API with JWT auth |
| **TiDB** | Distributed SQL | 4000 | Primary database |
| **PD** | Placement Driver | 2379 | TiDB cluster coordination |
| **TiKV** | Key-Value Store | — | Distributed storage engine |
| **TiCDC** | Change Data Capture | 8300 | Real-time data streaming |
| **Kafka** | Apache Kafka | 9092 | Message broker |
| **Zookeeper** | Apache ZooKeeper | 2181 | Kafka coordination |
| **CDC Consumer** | Node.js + KafkaJS | — | Processes CDC events |

## Features

✅ **Authentication**: Bcrypt password hashing + JWT tokens  
✅ **Distributed Database**: TiDB cluster with automatic initialization  
✅ **Real-time CDC**: TiCDC → Kafka → Consumer pipeline  
✅ **Structured Logging**: log4js with JSON format (user activity + DB changes)  
✅ **Automatic Setup**: Single-command deployment with health-checked init  
✅ **Idempotent Operations**: Safe restarts with persistent data  

## Verification

### Check service health
```bash
docker-compose ps                              # All services status
curl http://localhost:3000/api/health          # API health
curl http://localhost:3000/api/db-status       # Database connectivity
```

### Monitor logs
```bash
docker-compose logs api -f                     # User authentication logs
docker-compose logs cdc-consumer -f            # Database change events
docker-compose logs ticdc-init                 # CDC initialization
```

### Verify CDC changefeed
```bash
docker-compose exec ticdc /cdc cli changefeed list --pd=http://pd:2379
```

## Testing the Complete Flow

1. **Login** at http://localhost:8080 with `admin` / `admin123`
2. **View authentication log** in API container:
   ```bash
   docker-compose logs api --tail=20
   ```
   Expected: JSON log with `userId`, `action: "login_success"`, `timestamp`, `ipAddress`

3. **View CDC events** in consumer:
   ```bash
   docker-compose logs cdc-consumer --tail=20
   ```
   Expected: Database insert events for tokens table

## Technical Implementation

### Database Initialization
- Auto-creates `appdb` database on startup
- Creates `users` and `tokens` tables with foreign key constraints
- Seeds default admin user with bcrypt-hashed password
- Connection pooling with automatic retries

### CDC Pipeline
- **TiCDC** captures all DML operations (INSERT/UPDATE/DELETE)
- Streams changes to Kafka in Canal-JSON protocol
- **CDC Consumer** processes events with structured logging
- **Automatic initialization** via health-checked init container

### Authentication Flow
- Password validation with bcrypt
- JWT token generation (24h expiry)
- Tokens stored in database and sent via HTTP `Authorization` header
- Middleware validates tokens for protected routes

## Project Structure

```
.
├── api/                    # Backend API service
│   ├── server.js          # Express server + auth logic
│   ├── logger.js          # log4js configuration
│   └── Dockerfile
├── client/                 # Frontend
│   ├── index.html         # Login interface
│   └── Dockerfile
├── cdc-consumer/           # Kafka consumer
│   ├── consumer.js        # CDC event processor
│   └── Dockerfile
├── scripts/
│   └── init-cdc.sh        # CDC initialization script
└── docker-compose.yml      # Service orchestration
```

## Cleanup

```bash
# Stop all services
docker-compose down

# Remove all data (full reset)
docker-compose down -v
rm -rf data/
```

## Troubleshooting

**Services not starting?**
```bash
docker-compose logs -f
```

**CDC changefeed not created?**
```bash
docker-compose logs ticdc-init
docker-compose restart ticdc-init
```

**API cannot connect to database?**
```bash
docker-compose logs tidb
docker-compose restart api
```

**Complete environment reset:**
```bash
docker-compose down -v
rm -rf data/
docker-compose up -d
```

## Technology Stack

- **Frontend**: HTML5 + Vanilla JavaScript
- **Backend**: Node.js 18 + Express.js
- **Database**: TiDB (MySQL-compatible distributed SQL)
- **CDC**: TiCDC with Canal-JSON protocol
- **Message Queue**: Apache Kafka 7.5 + Zookeeper
- **Logging**: log4js (structured JSON)
- **Authentication**: bcrypt + jsonwebtoken
- **Containerization**: Docker + Docker Compose