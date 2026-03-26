# OpenClaw MVP Agent — Architecture

Kompletna architektura wielokanałowego agenta konwersacyjnego na Azure AI Foundry.

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USERS                                    │
│            (Telegram, Teams, Email)                         │
└──────────────────┬──────────────────┬───────────────────────┘
                   │                  │
       ┌───────────▼────┐    ┌────────▼──────┐
       │ ADAPTER:TG     │    │ ADAPTER:Teams  │
       │ /webhook/      │    │ /api/messages  │
       │ telegram       │    │                │
       └───────────────┬┘    └────────┬───────┘
                       │              │
                       │ UMS (JSON)   │
                       └──────┬───────┘
                              │
        ┌─────────────────────▼────────────────────┐
        │  FOUNDRY HOSTED AGENT (GPT-4o)            │
        │  + Content Safety + Guardrails            │
        │  (Agent makes decisions, calls tools)     │
        └──┬───────────────┬──────────────┬─────────┘
           │               │              │
    ┌──────▼──┐  ┌─────────▼──┐  ┌──────▼─────┐
    │ Tool:   │  │  Tool:     │  │ Tool:      │
    │ memory  │  │  graph     │  │ http/files │
    │ Events  │  │  Email     │  │            │
    │ Facts   │  │  Draft/Send│  │            │
    │ Routines│  │            │  │            │
    └────┬────┘  └─────┬──────┘  └────────────┘
         │             │
         │        ┌────▼────┐
         │        │Microsoft│
         │        │ Graph  │
         │        │API v5   │
         │        └─────────┘
    ┌────▼──────────────┐
    │  COSMOS DB        │
    │  - timeline       │
    │  - facts          │
    │  - routines       │
    │  - stats          │
    │  - drafts         │
    └───────────────────┘
```

## 📁 Repository Structure

```
agent01/
├── .devcontainer/          # GitHub Codespaces config
├── .github/workflows/      # CI/CD workflows
│   ├── infra-deploy.yml    # Deploy Bicep infrastructure
│   ├── apps-build-deploy.yml # Build & push Docker images
│   └── foundry-agent-deploy.yml # Deploy agent
│
├── infra/                  # Infrastructure as Code (Bicep)
│   ├── main.bicep          # Orchestration
│   ├── cosmos.bicep        # Cosmos DB + containers
│   ├── kv.bicep            # Key Vault
│   ├── acr.bicep           # Container Registry
│   └── ca-memory.bicep     # Container Apps
│
├── mcp/                    # MCP (Model Context Protocol) Services
│   ├── memory/             # Persistent memory (timeline, facts, routines)
│   ├── graph/              # Microsoft Graph (email draft/send)
│   ├── http/               # Safe HTTP requests with allowlist
│   └── files/              # Safe file operations
│
├── adapters/               # Channel adapters
│   ├── telegram/           # Telegram webhook adapter
│   └── teams/              # Teams Bot Framework adapter
│
├── orchestrator/           # Agent configuration
│   ├── agent.yaml          # Agent definition + policies
│   ├── safety.json         # Content Safety guardrails
│   └── schemas/            # JSON Schemas (UMS, events, facts, routines)
│
├── docs/                   # Documentation
├── package.json            # Root monorepo config
├── tsconfig.json           # TypeScript config
├── .eslintrc.json          # ESLint config
├── .prettierrc              # Prettier config
├── docker-compose.yml      # Local development
└── README.md
```

## 🔄 Data Flow Examples

### Example 1: Simple Message

```
User (Telegram): "Hello, what's the weather?"
  ↓ (webhook)
Adapter Telegram: Convert to UMS
  ↓
Foundry Agent: Interpret message
  ↓
Tool: memory.record_event (log user question)
  ↓
Tool: http.request (fetch weather from API)
  ↓
Agent: "The weather is..."
  ↓
Adapter Telegram: Send response
  ↓
User sees response ✓
```

### Example 2: Email Approval Flow (Critical!)

```
User: "Send email to adam@company.com about project status"
  ↓
Foundry Agent recognizes "send email" intent
  ↓
Tool: memory.record_event("email_intent", {to: "adam@..."})
  ↓
Tool: graph.draft_email({to, subject, body})
  ↓
Agent creates Telegram button card:
  "Draft email created. Approve sending? [✓ Approve] [✗ Reject]"
  ↓
User clicks [✓ Approve]
  ↓
Adapter receives callback_query with isApprovedAction=true
  ↓
UMS sent to Agent {messageType: "button", approval: {action: "approve"}}
  ↓
Agent receives approval → checks isApprovedAction=true ✓
  ↓
Tool: graph.send_email(draftId, isApprovedAction=true)
  ↓
Microsoft Graph sends email via agent@company.com
  ↓
Tool: memory.record_event("email_sent", {messageId: "..."})
  ↓
User sees: "Email sent ✓"
```

## 🛠️ MCP Tools Reference

### mcp-memory
**Endpoint:** `http://mcp-memory:3000`

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| record_event | POST | `/memory/record-event` | Log activity (auditing) |
| upsert_fact | POST | `/memory/upsert-fact` | Store knowledge about users |
| upsert_routine | POST | `/memory/upsert-routine` | Schedule recurring tasks |
| query | GET | `/memory/query` | Retrieve stored data |
| prune | DELETE | `/memory/prune` | Clean up old data |

### mcp-graph
**Endpoint:** `http://mcp-graph:3000`

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| draft_email | POST | `/graph/email/draft` | Create email draft |
| send_email | POST | `/graph/email/send` | **REQUIRES isApprovedAction=true** |
| get_draft | GET | `/graph/email/draft/{id}` | Retrieve draft |
| delete_draft | DELETE | `/graph/email/draft/{id}` | Discard draft |

### mcp-http
**Endpoint:** `http://mcp-http:3000`

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| request | POST | `/http/request` | Safe HTTP fetch (allowlist validated) |

**URLs in allowlist (env: HTTP_ALLOWLIST_URLS):**
- `https://api.example.com`
- `https://graph.microsoft.com`
- (configured via env var)

### mcp-files
**Endpoint:** `http://mcp-files:3000`

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| list_files | GET | `/files` | List all files |
| read_file | GET | `/files/{filename}` | Read file |
| write_file | PUT | `/files/{filename}` | Write file |
| delete_file | DELETE | `/files/{filename}` | Delete file |

**Sandbox:** `/data/agent/` only

## 🔐 Security Measures

1. **Email Approval:** `send_email` REQUIRES `isApprovedAction=true` (human-in-the-loop)
2. **Content Safety:** Agent respects Foundry guardrails (hate speech, violence, sexual blocked)
3. **URL Allowlist:** HTTP requests only to whitelisted domains
4. **File Sandbox:** File operations limited to `/data/agent/`
5. **PII Masking:** Sensitive data (emails, phone) masked in logs
6. **OIDC Federation:** GitHub Actions → Azure without secrets
7. **Key Vault:** All sensitive credentials encrypted at rest

## 📦 Cosmos DB Schema

```sql
-- timeline container (events log)
{
  "_id": "event-uuid",
  "userId": "user123",
  "type": "email_sent",
  "source": "telegram",
  "payload": {...},
  "timestamp": "2026-03-26T10:00:00Z"
  // TTL: -1 (no auto-expire)
}

-- facts container (knowledge)
{
  "_id": "fact-uuid",
  "userId": "user123",
  "subject": "user:john@company.com",
  "predicate": "prefers_language",
  "object": "pl",
  "confidence": 0.95,
  "updatedAt": "2026-03-26T10:00:00Z"
  // TTL: -1
}

-- drafts container (email waiting approval)
{
  "_id": "draft-uuid",
  "userId": "user123",
  "to": ["adam@company.com"],
  "subject": "Project Update",
  "body": "...",
  "status": "draft" | "approved" | "sent" | "rejected",
  "createdAt": "2026-03-26T10:00:00Z"
  // TTL: 86400 (1 day - auto-cleanup)
}
```

## 🚀 Development & Deployment

### Local Development (docker-compose)

```bash
# Clone repo
git clone https://github.com/waldekswo/agent01
cd agent01

# Copy env template
cp .env.example .env.local

# Build & start all services
npm install
npm run dev

# Check health
curl http://localhost:3001/healthz  # mcp-memory
curl http://localhost:3002/healthz  # mcp-graph
curl http://localhost:3010/healthz  # adapter-telegram

# Run tests
npm run test
```

### Azure Deployment

```bash
# 1. Setup OIDC (one-time manual setup)
# (Follow instructions in IMPLEMENTATION-SPECIFICATION-v1.md)

# 2. Deploy infrastructure
git push origin main  # triggers infra-deploy.yml

# 3. Deploy applications
# (apps-build-deploy.yml auto-runs on code push)

# 4. Deploy agent
# (foundry-agent-deploy.yml auto-runs on orchestrator/ changes)
```

## 📝 UMS (Unified Message Specification)

All messages flow through UMS to normalize different channels.

```typescript
interface UMS {
  channel: "telegram" | "teams";
  threadId: string;           // Conversation ID
  userId: string;             // User ID
  messageType: "text" | "command" | "button";
  text?: string;              // Message content
  metadata: {
    locale?: string;          // User language
    isApprovedAction?: boolean; // Whether action is approved
    approval?: {              // For button clicks
      draftId: string;
      action: "approve" | "reject";
    };
  };
}
```

## 🔄 CI/CD Workflows

### infra-deploy.yml
- **Trigger:** Push to `infra/` or manual
- **Steps:**
  1. Azure login (OIDC)
  2. Validate Bicep
  3. What-If deployment
  4. Create infrastructure (Cosmos, KV, ACR, Container Apps)

### apps-build-deploy.yml
- **Trigger:** Push to `mcp/`, `adapters/`, or manual
- **Steps:**
  1. Build Node.js services
  2. Run tests & linting
  3. Build Docker images
  4. Push to Azure Container Registry
   5. (TODO: Deploy to Container Apps)

### foundry-agent-deploy.yml
- **Trigger:** Push to `orchestrator/` or manual
- **Steps:**
  1. Validate agent.yaml
  2. (TODO: azd ai agent provision/deploy)

## 🎯 Next Steps (TODO)

- [ ] **Week 1:** Manual OIDC setup + first Bicep deployment
- [ ] **Week 2:** Deploy MCP services to Container Apps
- [ ] **Week 3:** Connect Telegram bot (BotFather token setup)
- [ ] **Week 4:** Connect Teams bot (Azure Bot Service)
- [ ] **Week 5:** Deploy Foundry Agent + integration tests
- [ ] **Week 6:** E2E testing (email flow, memory, guardrails)

## 📚 References

- [Azure AI Foundry](https://ai.azure.com/)
- [Cosmos DB Documentation](https://docs.microsoft.com/azure/cosmos-db/)
- [Bicep Language](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)
- [Microsoft Graph API](https://graph.microsoft.com/)
- [Bot Framework](https://dev.botframework.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

**Version:** 1.0 | **Last Updated:** March 2026
