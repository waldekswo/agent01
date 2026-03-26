# SPECYFIKACJA IMPLEMENTACJI PROJEKTU
## OpenClaw-Inspired Agent (MVP) na Azure AI Foundry

**Wersja:** 1.0  
**Data:** Marzec 2026  
**Status:** WERSJA ROBOCZA - OCZEKUJE NA ZATWIERDZENIE SZCZEGÓŁÓW

---

## EXECUTIVE SUMMARY

Projekt ma na celu stworzenie uproszczonego agenta konwersacyjnego opartego na architekturze OpenClaw, działającego na **Azure AI Foundry (Hosted Agent)** z obsługą komunikatorów **Telegram** i **Microsoft Teams**, trwałą pamięcią opartą na **Azure Cosmos DB**, oraz automatycznym wdrażaniem infrastruktury poprzez **GitHub Actions** i **Bicep**.

**Cel MVP:** Demonstracja zdolności agenta do:
- Komunikacji na wielu kanałach (Telegram, Teams)
- Pamięci trwałej (zdarzenia, fakty, rutyny)
- Przepływu maili z zatwierdzeniem człowieka (draft → approval → send)
- Bezpiecznego wdrażania infrastruktury IaC

---

## 1. DECYZJE WSTĘPNE (WYMAGAJĄ TWOJEGO ZATWIERDZENIA)

### 1.1 Język programowania dla MCP Services
**Opcje:**
- [x] Node.js + TypeScript (preferowane - szybkie prototypowanie, hoły ekosystem)
- [ ] Python (alternatywa - prostsze, popularne w AI)

**Wybór:** `________Node.js + TypeScript ______________` (TBD)

### 1.2 Model Azure AI (Foundry)
**Opcje dostępne:**
- [x] Azure OpenAI GPT-4o (najnowszy, najlepsze abilities)
- [ ] Azure OpenAI GPT-4 Turbo
- [ ] Anthropic Claude (jeśli dostępny w Foundry)

**Wybór:** `Azure OpenAI GPT-4o` ✅  
**Nazwa deployment'u w Foundry:** `waldunio-agent-gpt-4o-mvp` ✅

### 1.3 Rejon Azure (Region)
**Dostępne regiony:** East US, West Europe, Southeast Asia, itp.

**Wybór:** `________West Europe______________` (recommendation: West Europe dla EU compliance)

### 1.4 Obsługa maili (Microsoft Graph)
- **Mailbox:** Dedykowana/wspólna skrzynka agenta czy osoba?
  - **Opcja A:** Dedykowana skrzynka (agent@company.com) — łatwie, bardziej autonomiczny
  - **Opcja B:** Uprawnienia delegowane do użytkownika — bardziej restrykcyjne
  
**Wybór:** `_________A_____________` (Recommendation: Opcja A)

---

## 2. ARCHITEKTURA SYSTEMU

### 2.1 Diagram architektury (ogólny)

```
┌─────────────────────────────────────────────────────────────┐
│                    UŻYTKOWNIK                               │
└──────────────────┬──────────────────┬───────────────────────┘
                   │                  │
        ┌──────────▼───┐     ┌────────▼──────┐
        │   TELEGRAM   │     │   MS TEAMS     │
        │   Webhook    │     │   Bot Service  │
        └──────────────┘     └────────────────┘
                   │                  │
                   └──────────┬───────┘
                              │
                    ┌─────────▼─────────┐
                    │  UMS (JSON)       │
                    │  Message Bus      │
                    └────────┬──────────┘
                             │
        ┌────────────────────▼─────────────────────┐
        │   FOUNDRY HOSTED AGENT                   │
        │   (GPT-4o, Claude, etc.)                 │
        │   + Content Safety/Guardrails            │
        └────┬────────────┬────────────┬───────────┘
             │            │            │
    ┌────────▼──┐  ┌──────▼─────┐  ┌──▼──────────────┐
    │ mcp-memory│  │ mcp-graph  │  │  mcp-http      │
    │(Timeline/ │  │(Email      │  │ mcp-files      │
    │Facts/     │  │draft/send) │  │(Secure fetch)  │
    │Routines)  │  │            │  │                │
    └────┬──────┘  └──────┬─────┘  └────────────────┘
         │                │
         │           ┌────▼────┐
         │           │Microsoft│
         │           │  Graph  │
         │           │ API     │
         │           └─────────┘
    ┌────▼──────────────┐
    │  COSMOS DB        │
    │  - timeline       │
    │  - facts          │
    │  - routines       │
    │  - stats          │
    │  - drafts         │
    └───────────────────┘
    
    ┌──────────────────┐
    │  AZURE KEY       │
    │  VAULT           │
    │  (secrets)       │
    └──────────────────┘
```

### 2.2 Przepływ komunikacji (przykład)
```
User: "Wyślij email do Adam@company.com"
  ↓
[Telegram adapter] Update → UMS {channel: "telegram", userId: ..., text: "..."}
  ↓
[Foundry Agent] Interpretuje request; chce wysłać email
  ↓
[mcp-graph.draft_email] Tworzy draft: {draftId: "xyz"}
  ↓
[Agent] Wysyła odpowiedź do Telegram: "Stworzyłem draft. Zatwierdź/Odrzuć?"
  ↓
[User] Klika "Zatwierdź"
  ↓
[Telegram adapter] callback_query → UMS {approval: {draftId: "xyz", action: "approve"}}
  ↓
[Foundry Agent] Verifies isApprovedAction=true → [mcp-graph.send_email]
  ↓
[mcp-graph.send_email] Wysyła poprzez Microsoft Graph
  ↓
[Cosmos.drafts] Updateuje status draft'u na "sent"
  ↓
[memory.record_event] Loguje: "email_sent: xyz"
  ↓
User widzi "Email wysłany ✓"
```

---

## 3. KOMPONENTY SYSTEMU (Do budowy)

### 3.1 Faza 1: Infrastruktura (IaC - Bicep)
**Cel:** Wdrożenie zasobów Azure.

| Komponent | Plik Bicep | Odpowiedzialność |
|-----------|-----------|------------------|
| **main.bicep** | `/infra/main.bicep` | Orchiestracja, output wartości |
| **cosmos.bicep** | `/infra/cosmos.bicep` | Cosmos DB + 5 containers (timeline, facts, routines, stats, drafts) |
| **kv.bicep** | `/infra/kv.bicep` | Key Vault + sekrety (API key Telegram, Graph token, itd.) |
| **ca-memory.bicep** | `/infra/ca-memory.bicep` | Container Apps Environment + mcp-memory app |
| **acr.bicep** | `/infra/acr.bicep` | Azure Container Registry (do przechowywania obrazów Dockera) |

**Status decyzji:**
- [ ] Prywatne endpointy (Private Endpoints) dla Cosmos/KV?
  - Opcja A: TAK (bezpieczeństwo, ale bardzie złożone)
  - Opcja B: NIE (szybko, KV z IP whitelist)
  
  **Wybór:** `__________B____________` (Recommendation: B — na MVP)

### 3.2 Faza 2: MCP Services (Microservices)
**Cel:** Implementacja MCP (Model Context Protocol) narzędzi dla agenta.

#### 3.2a. mcp-memory
**Odpowiedź:** Trwała pamięć — zdarzenia, fakty, rutyny  
**Tech:** Node.js + TypeScript (zdecyduj w 1.1)  
**Repozytorium:** `/mcp/memory/`  

**Funkcje (REST/MCP Server):**
```typescript
// POST /memory/record-event
{
  type: "user.asked_question" | "agent.drafted_email" | "agent.sent_email" | ...,
  source?: "telegram" | "teams" | "email" | "schedule",
  payload: { ... },  // JSON, dowolna struktura
  labels?: ["budget", "approval", ...],
  pii?: false,  // czy zawiera PII
  timestamp?: ISO-8601
}
→ {id, createdAt, timeline_id}

// POST /memory/upsert-fact
{
  subject: "user:john@company",
  predicate: "prefers_language",
  object: "pl",
  evidenceIds?: ["event:abc"],
  confidence?: 0.95,
  ttl?: 86400  // seconds
}
→ {id, updated}

// POST /memory/upsert-routine
{
  name: "daily_standup_reminder",
  crontab: "0 9 * * MON-FRI",
  window?: 3600,  // seconds na notification
  signals?: ["weekday", "working_hours"],
  enabled: true,
  confidence?: 0.8
}
→ {id, next_run}

// GET /memory/query
{
  kind: "events" | "facts" | "routines",
  filter?: {subject?: "...", predicate?: "..."},
  timeRange?: {from, to},
  top?: 100,
  userId: "required"
}
→ {items: [...], count, totalRU}

// DELETE /memory/prune
{
  kind?: "events",
  olderThan?: "2025-12-25T00:00Z",  // RFC3339
  ttlExpired?: true
}
→ {deleted: N}
```

**Baza danych:** Azure Cosmos DB (SQL API)  
**Containers:** `timeline`, `facts`, `routines`, `stats`  
**Partitioning:** PartitionKey = `/userId` (for isolation + scaling)

**Deliverables:**
- Node.js server (Express/Fastify)
- MCP Server registration
- Cosmos DB client
- JSON Schema validation
- PII masking (e.g., email anonymization on read)
- Logging + RU tracking
- README + docker-compose dla dev
- Basic tests (Jest)

**TODO/Future:**
- [ ] TTL + confidence decay (cron job)
- [ ] Query optimization (indexes)
- [ ] Backup/Archive strategy

#### 3.2b. mcp-graph
**Odpowiedź:** Microsoft Graph — draft & send emails  
**Tech:** Node.js + TypeScript  
**Repozytorium:** `/mcp/graph/`  

**Funkcje (REST/MCP Server):**
```typescript
// POST /graph/email/draft
{
  userId: "agent-service-principal-id | user-id",
  to: ["adam@company.com"],
  cc?: ["boss@company.com"],
  subject: "Approval needed",
  body: "Please review...",
  attachments?: [{filename: "report.pdf", content_base64: "..."}],
  draftFolderId?: "specified-folder"
}
→ {draftId: "AAMkADYx...", webLink, createdAt}

// POST /graph/email/send
{
  draftId: "AAMkADYx...",
  comment?: "Sent by agent",
  isApprovedAction: true  // MUST BE true, or reject!
}
→ {messageId: "AABAADYx...", sent: true, sentAt}

// GET /graph/email/draft/{draftId}
→ {draftId, to, cc, subject, body, status: "draft" | "sent"}

// DELETE /graph/email/draft/{draftId}
→ {deleted: true}
```

**Auth:** Azure DefaultAzureCredential (Managed Identity)  
**Permissions:** Mail.Send (Application)  
**Policy:** Nigdy nie wysyłaj bez `isApprovedAction=true`  
**Storage drafts:** Cosmos DB container `drafts`

**Deliverables:**
- Node.js + Microsoft Graph SDK v5
- MCP Server registration
- Draft storage (Cosmos)
- Security checks (approval validation)
- Logging
- README + tests (Jest)

**TODO/Future:**
- [ ] Attachments support (inline images)
- [ ] Distribution lists
- [ ] Retry logic + rate limiting

#### 3.2c. mcp-http
**Odpowiedź:** Bezpieczny HTTP client dla agenta (fetch external APIs z allowlist)  
**Tech:** Node.js + TypeScript  
**Repozytorium:** `/mcp/http/`

**Funkcje (REST/MCP Server):**
```typescript
// POST /http/request
{
  method: "GET" | "POST",
  url: "https://api.example.com/data",
  headers?: {Authorization: "..."},
  body?: "{...}",  // JSON string
  timeout?: 30000  // ms
}
→ {status, headers, body, duration_ms}
// Validates URL against allowlist!
```

**Security:**
- URL allowlist (env: HTTP_ALLOWLIST_URLS)
- Rate limiting per URL
- Timeout enforcement
- No redirect chains >3

**Deliverables:**
- Node.js server
- MCP registration
- Allowlist validation
- Logging (request/response)
- Tests

#### 3.2d. mcp-files
**Odpowiedź:** Dostęp do plików w `/data/agent` (safe read/write)  
**Tech:** Node.js + TypeScript  
**Repozytorium:** `/mcp/files/`

**Funkcje:**
```typescript
// GET /files/{filename}
→ file content (or base64 if binary)

// PUT /files/{filename}
{content: "..."}
→ {saved: true, size, path}

// LIST /files
→ {files: [{name, size, modified}]}

// DELETE /files/{filename}
→ {deleted: true}
```

**Sandbox:** `/data/agent/` tylko  
**Max file size:** 100MB  

**Deliverables:**
- Node.js server, MCP registration, tests

---

### 3.3 Faza 3: Adaptery (Channels)
**Cel:** Integracja z Telegram i Teams.

#### 3.3a. Adapter Telegram
**Tech:** Node.js + TypeScript (telegram library)  
**Repozytorium:** `/adapters/telegram/`

**Endpoint:** `POST /webhook/telegram`  
**Mapowanie:** Update → UMS JSON  

**Funkcje:**
```typescript
// UMS message:
{
  channel: "telegram",
  threadId: String(chatId),
  userId: String(from.id),
  messageType: "text" | "command" | "button",
  text?: message.text,
  metadata: {
    locale: message.text.lang || "en",
    isApprovedAction?: false
  }
}

// Button handlers (inline keyboard):
// callback_query → UMS {messageType: "button", metadata: {action: "approve"}}
```

**Approval flow:**
Gdy agent chce zatwierdzenia (np. draft email):
```
Agent response: "Draft email created. Approve? 👇"
  + Inline keyboard: [Approve] [Reject]
  ↓
User clicks → callback_query
  ↓
Telegram adapter → UMS {action: "approve"}
  ↓
Back to agent
```

**Deliverables:**
- Express.js server + Telegram bot
- UMS mapper
- Approval card renderer
- Tests, Dockerfile, README

**Env vars:**
```
TELEGRAM_BOT_TOKEN=123456:ABC...
PUBLIC_BASE_URL=https://adapter-telegram.example.com
FOUNDRY_AGENT_ENDPOINT=https://agent.azureai.io
```

#### 3.3b. Adapter Teams
**Tech:** Node.js + Bot Framework (Microsoft)  
**Repozytorium:** `/adapters/teams/`

**Endpoint:** `POST /api/messages`  
**Mapowanie:** Activity → UMS JSON

**Funktionalność:**
```typescript
// TeamsActivityHandler extends
// activity: {from, conversation, text, channelData, ...}
// → UMS {channel: "teams", userId: from.id, text: activity.text}

// Adaptive Card approval:
{
  type: "AdaptiveCard",
  body: [
    {type: "TextBlock", text: "Draft email for approval..."}
  ],
  actions: [
    {type: "Action.Submit", title: "Approve", data: {action: "approve"}},
    {type: "Action.Submit", title: "Reject", data: {action: "reject"}}
  ]
}
```

**Deliverables:**
- Bot Framework + activity handler
- Adaptive Card templates
- UMS mapper
- Tests, Dockerfile, README

**Env vars:**
```
MicrosoftAppId=00000000-...
MicrosoftAppPassword=***
TEAMS_BOT_NAME=OpenClawBot
```

---

### 3.4 Faza 4: Foundry Hosted Agent
**Tech:** Foundry Agent configuration + MCP integration  
**Repozytorium:** `/orchestrator/`

**Pliki:**
- `/orchestrator/agent.yaml` — konfiguracja agenta
- `/orchestrator/safety.json` — guardrails + content safety
- `/orchestrator/schemas/*` — JSON Schemas (UMS, events, itp.)

**agent.yaml blueprint:**
```yaml
name: OpenClawAgentMVP
description: Multi-channel conversational agent with memory & approval workflows

model:
  provider: "foundry"
  deployment_id: "${FOUNDRY_MODEL_DEPLOYMENT}"  # TBD
  model_name: "gpt-4o"  # or other

tools:
  - name: "memory"
    type: "mcp"
    endpoint: "http://mcp-memory:3000"
    functions: ["record_event", "upsert_fact", "query"]
    
  - name: "graph"
    type: "mcp"
    endpoint: "http://mcp-graph:3000"
    functions: ["draft_email", "send_email"]
    
  - name: "http"
    type: "mcp"
    endpoint: "http://mcp-http:3000"
    
  - name: "files"
    type: "mcp"
    endpoint: "http://mcp-files:3000"

guardrails:
  - type: "content_safety"
    level: "medium"
    block_on: ["hate_speech", "violence", "sexual"]
    
policies:
  - rule: "email_requires_approval"
    trigger: "tool_call:graph.send_email"
    action: "block_unless_metadata.isApprovedAction"
    
  - rule: "log_all_events"
    trigger: "any_successful_action"
    action: "memory.record_event"

system_prompt: |
  Jesteś inteligentnym asystentem opartym na architekturze OpenClaw.
  - Możesz odczytywać wiadomości z Telegram i Teams
  - Możesz wysyłać emaile (z zatwierdzeniem)
  - Pamiętaj fakty o użytkownikach (memory)
  - Zawsze pytaj o zatwierdzenie przed działaniem na dane
  
  Odpowiadaj na język użytkownika.
```

**Guardrails + Content Safety:**
- Zablokuj hate speech, violence, sexual content
- Warianty prompt injection — filter special tokens
- Limit recursion/loops

**Acceptance criteria:**
- Agent odpowiada na uMS messages
- Prawidłowo routuje do MCP tools
- Respektuje approval policy
- Loguje wszystkie akcje

---

### 3.5 Faza 5: GitHub Actions (CI/CD)
**Cel:** Automatyczne wdrażanie infrastruktury i aplikacji.

#### 3.5a. infra-deploy.yml
**Trigger:** `push` do `infra/`, `workflow_dispatch`  
**Steps:**
1. Checkout code
2. `az login` (OIDC federation — brak secrets!)
3. `Azure/bicep-deploy@v1` (what-if + create)
4. Output: RG name, Cosmos endpoint, KV url, ACR login server

**DECYZJA UŻYTKOWNIKA:**
Musisz ręcznie skonfigurować **OIDC federation** w Azure dla GitHub Actions.  
👉 **Instrukcja (sekcja 4.2)** poniżej.

#### 3.5b. apps-build-deploy.yml
**Trigger:** `push` do `mcp/`, `adapters/`, `workflow_dispatch`  
**Steps:**
1. Setup Node/Docker
2. Build + test (npm test)
3. Build Docker images dla każdego serwisu
4. Push do ACR (Azure Container Registry)
5. Deploy do Container Apps (az container apps update)

#### 3.5c. foundry-agent-deploy.yml
**Trigger:** `push` do `orchestrator/`, `workflow_dispatch`  
**Steps:**
1. Setup Azure CLI + `azd` CLI
2. `azd ai agent init` (jeśli nowe)
3. `azd ai agent provision` (update zasobów)
4. `azd ai agent deploy` (wdrożenie agenta + MCP)

**DECYZJA UŻYTKOWNIKA:**
Musisz ręcznie zalogować się i `azd auth`. 👉 **Instrukcja (sekcja 4.3)**.

---

### 3.6 Faza 6: DevContainer & Local Development
**Plik:** `/.devcontainer/devcontainer.json`

**Zawiera:**
- Node.js 20+ (LTS)
- Docker-in-Docker
- Azure CLI + azd CLI
- Podpowiedzi Copilota dla TypeScript

**docker-compose (debug mode):**
```yaml
services:
  cosmos-emulator:
    image: mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator
    ports: ["8081:8081"]
    
  mcp-memory:
    build: ./mcp/memory
    env_file: .env.local
    ports: ["3001:3000"]
    
  mcp-graph:
    build: ./mcp/graph
    env_file: .env.local
    ports: ["3002:3000"]
    
  telegram-adapter:
    build: ./adapters/telegram
    env_file: .env.local
    ports: ["3010:3000"]
```

---

## 4. PLAN BUDOWY (SEQUENCES)

### 4.1 Sekwencja budowy (rekomendowana)

#### **TYDZIEŃ 1: Setup + Planning**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **1** | Rozstrzygnij decyzje (1.1-1.4) | TY | ⏳ |
| **2** | Zatwierdzenie specyfikacji v1 | TY | ⏳ |
| **3** | Setup repo structure | Copilot | — |
| **4** | Setup GitHub Actions OIDC | TY | ⏳ |

#### **TYDZIEŃ 2: Infrastruktura**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **5** | Bicep modules (main, cosmos, kv, acr) | Copilot | — |
| **6** | infra-deploy.yml (workflow) | Copilot | — |
| **7** | Test deployment (manual trigger) | TY | ⏳ |
| **8** | Dokumentacja parametrów Bicep | Copilot | — |

#### **TYDZIEŃ 3: MCP Services**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **9** | mcp-memory (code + Dockerfile + tests) | Copilot | — |
| **10** | mcp-graph (code + Dockerfile + tests) | Copilot | — |
| **11** | mcp-http (code + Dockerfile) | Copilot | — |
| **12** | mcp-files (code + Dockerfile) | Copilot | — |
| **13** | Tests lokalne (docker-compose up; curl tests) | TY | ⏳ |

#### **TYDZIEŃ 4: Adaptery**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **14** | Adapter Telegram (webhook + UMS mapper) | Copilot | — |
| **15** | Adapter Teams (Bot Framework + adaptive cards) | Copilot | — |
| **16** | Setup bots (BotFather dla Telegram, Azure Bot Service dla Teams) | TY | ⏳ |
| **17** | Test komunikacji (send message; receive approval) | TY | ⏳ |

#### **TYDZIEŃ 5: Foundry Agent**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **18** | agent.yaml, safety.json, JSON Schemas | Copilot | — |
| **19** | foundry-agent-deploy.yml | Copilot | — |
| **20** | azd init + provision (manual & workflow) | TY | ⏳ |
| **21** | Test E2E: Telegram → Agent → mcp-memory | TY | ⏳ |

#### **TYDZIEŃ 6: Integration & Polish**

| Krok | Nazwa | Odpowiedzialność | Status |
|------|-------|------------------|--------|
| **22** | CI/CD workflow integration (apps-build-deploy) | Copilot | — |
| **23** | E2E email flow: draft → Teams approval → send | TY | ⏳ |
| **24** | Load testing + security audit | Copilot | — |
| **25** | Documentation (README, ARCHITECTURE.md) | Copilot | — |

---

## 5. INSTRUKCJE DLA UŻYTKOWNIKA (MANUAL STEPS)

### 5.1 [KROK 1] Rozstrzygnięcie decyzji wstępnych
**Czynnośc:**
1. Wybralisz język programowania (1.1), model (1.2), region (1.3), mailbox flow (1.4)
2. Zaaktualizuj sekcję **1. DECYZJE WSTĘPNE** powyżej
3. Napisz: "OK, wybieram: [...]"

**Output:** Uaktualniona specyfikacja v1.1

---

### 5.2 [KROK 4] Setup GitHub Actions OIDC

**Co to jest?** Federacja tożsamości — GitHub Actions loguje się do Azure bez przechowywania tajemnic (sekrety).

**Instrukcja (ręczne klikanie):**

1. **Otwórz Azure Portal:**
   ```
   https://portal.azure.com
   ```

2. **Przejdź do:** Resource Groups → (utwórz lub wybierz RG dla projektu, np. `rg-waldunio-agent01-mvp`)

3. **Utwórz Service Principal (SP) dla GitHub:**
   ```bash
   # Otwórz Cloud Shell w portalu i uruchom:
   az ad sp create-for-rbac \
     --name "github-openclaw-mvp" \
     --role Contributor \
     --scopes /subscriptions/{SUBSCRIPTION_ID}/resourceGroups/rg-openclaw-mvp
   ```
   **Output:**
   ```json
   {
     "clientId": "...",
     "clientSecret": "...",
     "subscriptionId": "...",
     "tenantId": "...",
     "objectId": "..."
   }
   ```
   **Skopiuj `clientId`, `tenantId`, `subscriptionId`** (bez `clientSecret`!)

4. **Utwórz Federated Credential:**
   ```bash
   # Cloud Shell:
   az identity federated-credential create \
     --name github-oidc \
     --identity-name github-openclaw-oidc \
     --resource-group rg-openclaw-mvp \
     --issuer https://token.actions.githubusercontent.com \
     --subject oidc:waldekswo/agent01:ref:refs/heads/main \
     --audience api://AzureADTokenExchange
   ```
   (Zamień `waldekswo` na twojego GitHub username, `agent01` na repo name)

5. **W repo GitHub (`waldekswo/agent01`)**, przejdź do: **Settings** → **Secrets and variables** → **Actions**

6. **Dodaj 3 zmienne (secrets):**
   - `AZURE_SUBSCRIPTION_ID` = `subscriptionId` z kroku 3
   - `AZURE_TENANT_ID` = `tenantId` z kroku 3
   - `AZURE_CLIENT_ID` = `clientId` z kroku 3

7. **Dodaj ENV variables (public):**
   - `AZURE_RESOURCE_GROUP` = `rg-openclaw-mvp`
   - `AZURE_LOCATION` = `westeurope` (lub twój region z 1.3)

**Kiedy skončysz:** Napisz mi "OIDC gotowy" → będę mieć dostęp do infra-deploy workflow.

---

### 5.3 [KROK 16] Setup Telegram Bot

**Instrukcja:**

1. **Otwórz Telegram** (aplikacja lub web.telegram.org)
2. **Znajdź BotFather:**
   - Search: `@BotFather`
   - Wyślij: `/start`
3. **Utwórz nowego bota:**
   - Send: `/newbot`
   - Odpowiedz na pytania:
     - Name: `OpenClaw MVP Agent`
     - Username: `openclaw_mvp_bot` (musi być unikatny)
4. **Skopiuj token:**
   ```
   Use this token to access the HTTP API:
   123456789:ABCDefGHIJKLMNoPqrsTuvWxyzAbcDeFgHij
   ```
5. **W repo GitHub:**
   - Settings → Secrets → Add: `TELEGRAM_BOT_TOKEN` = token z kroku 4
6. **(Potem, gdy adapter będzie deployed)** Ustaw webhook:
   ```bash
   curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://adapter-telegram.{YOUR_DOMAIN}.com/webhook/telegram"
     }'
   ```
   (Adapter Telegram będzie deployed do Azure Container Apps)

**Kiedy skončysz:** Daj mi token; będę go przechowywać w Key Vault.

---

### 5.4 [KROK 16] Setup Microsoft Teams Bot

**Instrukcja:**

1. **Otwórz Azure Portal**
2. **Utwórz Azure Bot resource:**
   - Create resource → Bot
   - Name: `openclaw-mvp-teams-bot`
   - Messaging endpoint: `https://adapter-teams.{YOUR_DOMAIN}.com/api/messages`
   - Microsoft App ID: *(zostanie wygenerowany)*
3. **Po stworzeniu → Settings:**
   - Copy `Microsoft App ID`
   - Click "Manage" → Certificates & secrets → New client secret → Copy
4. **W GitHub Secrets:**
   - `TEAMS_BOT_APP_ID` = Microsoft App ID
   - `TEAMS_BOT_APP_PASSWORD` = client secret
5. **(Potem)** Register bot w Teams App Manifest

---

### 5.5 [KROK 20] Setup Azure AI Foundry

**Instrukcja:**

1. **Otwórz Azure Portal → AI Foundry** (lub https://ai.azure.com)
2. **Utwórz Hub:**
   - Project name: `openclaw-mvp`
   - Region: `westeurope` (jak w 1.3)
3. **Wdróż model:**
   - Deployments → Deploy model
   - Choose: `gpt-4o` (lub wybrany w 1.2)
   - Deployment name: `gpt-4o-openclaw` (pamiętaj tę nazwę!)
4. **Pobierz credentials:**
   - Copy: Endpoint URL, Deployment ID
5. **W GitHub Secrets:**
   - `FOUNDRY_ENDPOINT` = Endpoint URL
   - `FOUNDRY_DEPLOYMENT_NAME` = Deployment ID

6. **Zaloguj się lokalnie (w devcontainer):**
   ```bash
   az login
   azd auth login
   azd config set defaults.subscription {SUBSCRIPTION_ID}
   ```

**Kiedy skončysz:** Dam ci plik `foundry-agent-deploy.yml`, który będzie automatycznie wdrażać agenta.

---

## 6. WYMAGANIA WSTĘPNE

### 6.1 Konto Azure
- [ ] Aktywne Azure subscription (Free, Trial, lub Pay-As-You-Go)
- [ ] Rola: Contributor (w RG) lub wyšej

### 6.2 GitHub
- [ ] Repozytorium (już masz: waldekswo/agent01)
- [ ] Dostęp do Settings (aby skonfigurować secrets/OIDC)

### 6.3 Konta serwisów
- [ ] Telegram Bot Token (od BotFather) — **[KROK 16]**
- [ ] Microsoft Teams Bot App ID + Secret — **[KROK 16]**
- [ ] (Opcje) Microsoft 365 tenant z dostępem do Azure Bot Service

### 6.4 Narzędzia lokalne (w devcontainer, już dostarczone)
- Node.js 20+
- Docker
- Azure CLI + azd CLI
- Git

---

## 7. STRUKTURA REPO (FINAL)

```
agent01/
├── .devcontainer/
│   ├── Dockerfile
│   └── devcontainer.json
│
├── .github/
│   └── workflows/
│       ├── infra-deploy.yml
│       ├── apps-build-deploy.yml
│       └── foundry-agent-deploy.yml
│
├── infra/
│   ├── main.bicep
│   ├── cosmos.bicep
│   ├── kv.bicep
│   ├── ca-memory.bicep
│   ├── acr.bicep
│   └── parameters.json
│
├── mcp/
│   ├── memory/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── mcp/register.ts
│   │   │   ├── db/cosmos.ts
│   │   │   └── models/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── __tests__/
│   │
│   ├── graph/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── __tests__/
│   │
│   ├── http/
│   │   └── src/
│   │
│   └── files/
│       └── src/
│
├── adapters/
│   ├── telegram/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── telegram/api.ts
│   │   │   └── ums/mapper.ts
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── __tests__/
│   │
│   └── teams/
│       ├── src/
│       ├── src/cards/
│       ├── package.json
│       ├── Dockerfile
│       └── __tests__/
│
├── orchestrator/
│   ├── agent-config/
│   │   ├── agent.yaml
│   │   └── safety.json
│   │
│   └── schemas/
│       ├── ums.schema.json
│       ├── timeline_event.schema.json
│       ├── fact.schema.json
│       └── routine.schema.json
│
├── docker-compose.yml (dev)
├── ARCHITECTURE.md
├── README.md
└── IMPLEMENTATION-SPECIFICATION-v1.md (THIS FILE)
```

---

## 8. METRYKI SUKCESU (Acceptance Criteria)

### MVP Completion Checklist

- [ ] **Infrastruktura**
  - [ ] RG + Cosmos DB + Key Vault + ACR wdrożone (Bicep)
  - [ ] Container Apps Environment gotowe na mcp-memory
  - [ ] secrets przechowywane w KV

- [ ] **MCP Services**
  - [ ] mcp-memory: record_event, upsert_fact, query działają
  - [ ] mcp-graph: draft_email i send_email działają (z approval policy)
  - [ ] mcp-http, mcp-files: testują się lokalnie

- [ ] **Adaptery**
  - [ ] Telegram: message.text → UMS → Telegram response
  - [ ] Teams: Activity → UMS → Teams Adaptive Card
  - [ ] Approval buttons działają (callback_query → action)

- [ ] **Foundry Agent**
  - [ ] Agent configuration załadowana (agent.yaml)
  - [ ] MCP tools: memory, graph, http, files dostępne
  - [ ] Content Safety/guardrails aktywne
  - [ ] Agent odpowiada na Telegram/Teams messages

- [ ] **CI/CD**
  - [ ] infra-deploy.yml: sukces na manual trigger
  - [ ] apps-build-deploy.yml: obrazy Docker w ACR
  - [ ] foundry-agent-deploy.yml: agent wdrożony

- [ ] **E2E Flow**
  - [ ] User (Telegram) pyta: "Wyślij email do X"
  - [ ] Agent tworzy draft (mcp-graph)
  - [ ] Agent wysyła approval button do Telegrama
  - [ ] User zatwierdza
  - [ ] Agent wysyła email (Graph API)
  - [ ] Zdarzenie logowane w Cosmos (mcp-memory)

---

## 9. NEXT STEPS

1. **Odczytaj specyfikację v1.0** — co myślisz?
2. **Zatwierdzaj decyzje** (sekcja 1) — odpowiadaj na pytania
3. **Potwierdź harmonogram** — czy tygodniowo jest OK?
4. **Wykonaj setup** (sekcja 5) — OIDC, Telegram, Teams, Foundry

Gdy będziesz gotowy, zaznaczę [TAB: Copilot] i zaczniemy budować repo structure + Bicep!

---

## 10. HISTORIA ZMIAN

| Wersja | Data | Zmiana |
|--------|------|--------|
| **1.0** | 2026-03-26 | Initial draft — oczekuje na zatwierdzenie |
| *1.1* | TBD | Po decyzjach użytkownika |

---

**Dokument ten jest punktem wyjścia do wspólnej pracy. Będziemy go aktualizować w miarę postępów.**

**➡️ Czekam na Twoją opinię i decyzje z sekcji 1!**
