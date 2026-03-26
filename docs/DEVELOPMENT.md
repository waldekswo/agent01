# Development

## Setup DevContainer

```bash
# Open in VS Code with DevContainer
# Click "Reopen in Container"

# Inside container:
npm install
npm run install:all
npm run dev
```

## Local Testing

### Unit Tests

```bash
npm run test                # Run all tests
npm run test:watch         # Watch mode
```

### Integration Testing (docker-compose)

```bash
# Start all services
docker-compose up -d

# Test mcp-memory
curl -X POST http://localhost:3001/memory/record-event \
  -H "Content-Type: application/json" \
  -d '{
    "type": "test_event",
    "payload": {"message": "hello"},
    "userId": "user123"
  }'

# Test mcp-graph
curl -X POST http://localhost:3002/graph/email/draft \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "to": ["test@example.com"],
    "subject": "Test",
    "body": "Test email"
  }'

# Stop services
docker-compose down
```

## Debugging

### VS Code Launch Config

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "mcp-memory debug",
      "program": "${workspaceFolder}/mcp/memory/dist/index.js",
      "outFiles": ["${workspaceFolder}/mcp/memory/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

### Logs

```bash
# Real-time logs for all services
npm run dev:logs

# Specific service
docker-compose logs -f mcp-memory
```

## Linting & Formatting

```bash
npm run lint          # Check all services
npm run lint:fix      # Auto-fix issues
npm run format        # Format code (Prettier)
npm run format:check  # Check formatting
```

## Git Workflow

```bash
# Before commit
npm run precommit      # Runs lint:fix + format

# Commit
git add .
git commit -m "feat: add feature"
git push origin main   # Triggers GitHub Actions
```

---

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for deployment instructions.
