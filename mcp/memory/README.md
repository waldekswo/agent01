# mcp-memory

Persistent memory service for OpenClaw Agent. Stores events, facts, and routines in Azure Cosmos DB.

## Quick Start

### Development

```bash
npm install
npm run dev
```

Server will start on `http://localhost:3000`

### Docker

```bash
docker build -t mcp-memory .
docker run -p 3000:3000 -e AZURE_COSMOS_ENDPOINT=... mcp-memory
```

## API Endpoints

### Health Check
```bash
GET /healthz
```

### Record Event
```bash
POST /memory/record-event
{
  "type": "user.asked_question",
  "source": "telegram",
  "payload": {"question": "What time is it?"},
  "labels": ["general"],
  "pii": false,
  "userId": "user123"
}
```

### Upsert Fact
```bash
POST /memory/upsert-fact
{
  "subject": "user:john",
  "predicate": "prefers_language",
  "object": "pl",
  "confidence": 0.95,
  "userId": "user123"
}
```

### Query Memory
```bash
GET /memory/query?kind=events&userId=user123&top=50
```

### Prune Old Items
```bash
DELETE /memory/prune
{
  "kind": "timeline",
  "olderThan": "2025-01-01T00:00:00Z"
}
```

## Environment Variables

- `AZURE_COSMOS_ENDPOINT` - Cosmos DB endpoint
- `AZURE_COSMOS_KEY` - Cosmos DB primary key
- `COSMOS_DATABASE` - Database name
- `MCP_MEMORY_PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Log level (default: info)

## TODO

- [ ] TTL + confidence decay for facts
- [ ] Cron job for routine distillation
- [ ] Query optimization & indexing
- [ ] Backup/Archive strategy
- [ ] Rate limiting
