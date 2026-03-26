# SPECYFIKACJA PROMPTU DLA GITHUB COPILOT (VS CODE)
## Projekt: „OpenClaw‑Inspired Agent (MVP) na Azure AI Foundry (Hosted Agent)”

**Cel:** Kompletny prompt/specyfikacja dla GitHub Copilot w VS Code, żeby wygenerować szkielety usług, IaC (Bicep), workflowy CI/CD i minimalne implementacje.  
**Inspiracja:** **OpenClaw** — użyj go jako **odniesienia architektonicznego** (gateway+channels, persistent memory, skills/plugins), ale **nie kopiuj kodu**; budujemy **uprościone MVP** dla **Azure AI Foundry Hosted Agent + MCP**.

### 1) Zakres MVP
- Kanały: **Telegram** (webhook) i **Microsoft Teams** (Azure Bot Service + Adaptive Cards).
- E‑maile: **draft → akceptacja → send** (human‑in‑the‑loop).
- Pamięć: **mcp-memory** (zdarzenia → fakty/preferencje → rutyny) w **Cosmos DB**.
- Orkiestracja: **Foundry Hosted Agent** + **MCP** (memory, graph, http, files); modele z **Foundry Models**.
- IaC/CI: **Bicep** + **GitHub Actions** (OIDC do Azure). Guardrails/Content Safety aktywne.

### 2) Architektura
```
[Telegram Adapter]   [Teams Adapter]
        |                   |
        +---- UMS (JSON) ---+
                     |
             [Foundry Hosted Agent]
                     |
           MCP: memory, graph, http, files
                     |
    Cosmos DB • Key Vault • Container Apps • ACR
```

### 3) Struktura repo (monorepo)
```
/.devcontainer/
/.github/workflows/ (infra-deploy.yml, apps-build-deploy.yml, foundry-agent-deploy.yml)
/infra/ (main.bicep, cosmos.bicep, kv.bicep, ca-memory.bicep)
/adapters/telegram/  (src/, Dockerfile)
/adapters/teams/     (src/, Dockerfile)
/mcp/memory/         (src/, Dockerfile)
/mcp/graph/          (src/, Dockerfile)
/mcp/http/           (src/)
/mcp/files/          (src/)
/orchestrator/agent-config/ (agent.yaml, safety.json)
/orchestrator/schemas/ (ums.schema.json, timeline_event.schema.json, fact.schema.json, routine.schema.json)
```

### 4) UMS (Unified Message Spec) — minimum
- `channel`, `threadId`, `userId`, `messageType: text|command|button`  
- `text?`, `attachments?[]`, `metadata.locale?`, `metadata.isApprovedAction?`, `metadata.approval? { draftId, action }`

### 5) MCP — interfejsy
**mcp-memory**
- `memory.record_event({type,source?,payload,labels?,pii?}) -> {id}`
- `memory.upsert_fact({subject,predicate,object,evidenceIds?,confidence?}) -> {id}`
- `memory.upsert_routine({name,crontab?,window?,signals?,confidence?}) -> {id}`
- `memory.query({kind,filter?,timeRange?,top?}) -> {items}`
- `memory.delete({ids?,kind?,filter?}) -> {deleted}`

**mcp-graph** (Microsoft Graph)
- `draft_email({userId,to[],cc[]?,subject,body,attachments?[]}) -> {draftId}`
- `send_email({draftId}) -> {messageId}`
> Polityka: nigdy nie wołaj `send_email` bez `isApprovedAction=true` (UMS).

**mcp-http**: bezpieczny fetch (allow‑list, limity).  
**mcp-files**: dostęp do `/data/agent`.

### 6) Hosted Agent (Foundry)
`agent.yaml`:
- Model z Foundry (np. GPT‑4o/5.x lub Sonnet) przez nazwę wdrożenia.
- Tools: memory, graph, http, files.
- Zasady: wysyłka maili wyłącznie po akceptacji; loguj zdarzenia przez memory.*; utrzymuj TTL/confidence.
- Włącz **Content Safety/guardrails**.

### 7) Adaptery
**Telegram:** webhook `/webhook/telegram`; mapowanie Update→UMS; inline keyboard Approve/Reject.  
**Teams:** Bot Framework (TeamsActivityHandler), Adaptive Card Approve/Reject; submit→UMS.

### 8) IaC & CI/CD
- **Bicep**: `main.bicep`, `cosmos.bicep` (timeline/facts/routines/stats/drafts), `kv.bicep`, `ca-memory.bicep`.
- **Actions**:  
  - `infra-deploy.yml`: `azure/login (OIDC)` + `Azure/bicep-deploy` (what‑if, create).  
  - `apps-build-deploy.yml`: build & push obrazów do ACR; deploy Container Apps.  
  - `foundry-agent-deploy.yml`: `azd ai agent init/provision/deploy`.

### 9) Akceptacja
- Infra: RG + Cosmos + KV + CA + ACR wdrożone.  
- mcp-memory: zapis/odczyt eventów/faktów/rutyn.  
- Email flow: draft → Approve/Reject → send (Graph 202).  
- Adaptery: UMS działa; przyciski akceptacji działają.  
- Guardrails aktywne.

### 10) Polecenie końcowe dla Copilota
> Wygeneruj monorepo (foldery, minimalny kod, Dockerfile, Bicep, workflowy) zgodnie z tą specyfikacją.  
> Dodaj TODO i proste testy. Inspiruj się OpenClaw (architektura/patterny), ale utrzymaj prostotę.
