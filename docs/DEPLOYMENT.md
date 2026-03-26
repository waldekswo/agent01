# Deployment Guide

## Prerequisites

- [ ] Azure subscription
- [ ] GitHub repository (waldekswo/agent01)
- [ ] OIDC federation setup (see below)
- [ ] Telegram bot token
- [ ] Teams app registered

## Phase 1: Azure Infrastructure (Week 1-2)

### Step 1: Setup OIDC Federation

Follow [IMPLEMENTATION-SPECIFICATION-v1.md section 5.2](../IMPLEMENTATION-SPECIFICATION-v1.md#52-krok-4-setup-github-actions-oidc)

**Key Actions:**
1. Create Service Principal in Azure
2. Create Federated Credential
3. Add GitHub Secrets:
   - `AZURE_SUBSCRIPTION_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`

### Step 2: Deploy Infrastructure

```bash
# Push to main triggers infra-deploy.yml
git push origin main

# Monitor in GitHub Actions tab
# Wait for Cosmos DB, KV, ACR to be created
```

**Verify:**
```bash
az group list --output table
az cosmosdb database show \
  --resource-group rg-openclaw-mvp \
  --name cosmos-openclaw-mvp-dev \
  --account-name cosmos-openclaw-mvp-dev
```

## Phase 2: MCP Services (Week 3)

### Build & Deploy to ACR

```bash
# Push MCP code triggers apps-build-deploy.yml
git push origin main

# Verify images in ACR
az acr repository list --resource-group rg-openclaw-mvp --name acr**
```

### Deploy to Container Apps

```bash
# TODO: Implement Container Apps deployment
az container app create \
  --name mcp-memory \
  --resource-group rg-openclaw-mvp \
  --image acr***.azurecr.io/mcp-memory:latest \
  --target-port 3000
```

## Phase 3: Channel Adapters (Week 4)

### Telegram Bot

Follow [IMPLEMENTATION-SPECIFICATION-v1.md section 5.3](../IMPLEMENTATION-SPECIFICATION-v1.md#53-krok-16-setup-telegram-bot)

**Key Steps:**
1. BotFather: `/newbot`
2. Get token
3. Set webhook URL
4. Test with `/start`

### Teams Bot

Follow [IMPLEMENTATION-SPECIFICATION-v1.md section 5.4](../IMPLEMENTATION-SPECIFICATION-v1.md#54-krok-16-setup-microsoft-teams-bot)

**Key Steps:**
1. Azure Portal: Create Bot
2. Get App ID & Secret
3. Register in Teams

## Phase 4: Foundry Agent (Week 5)

### Setup Azure AI Foundry

Follow [IMPLEMENTATION-SPECIFICATION-v1.md section 5.5](../IMPLEMENTATION-SPECIFICATION-v1.md#55-krok-20-setup-azure-ai-foundry)

**Key Steps:**
1. Create Hub
2. Deploy model: `waldunio-agent-gpt-4o-mvp`
3. Get Endpoint & Key
4. Register MCP tools

### Test MCP Integration

```bash
# Locally
azd ai agent invoke \
  --message "Hello agent"
```

## Phase 5: E2E Testing (Week 6)

### Email Flow Test

1. Send message to Telegram bot: "Send email to test@example.com"
2. Agent creates draft
3. Bot sends approval request
4. Master agent approval
5. Email sent via Graph API
6. Verify in Sent Items

### Memory Test

```bash
# Query after email was sent
curl http://localhost:3001/memory/query \
  ?kind=events&userId=user123&top=10

# Verify "email_sent" event logged
```

### Guardrails Test

Send prompt that violates content policy - should be blocked.

## Monitoring

### Application Insights

```bash
az monitor log-analytics workspace list \
  --resource-group rg-openclaw-mvp
```

### Container Logs

```bash
az container app logs show \
  --name mcp-memory \
  --resource-group rg-openclaw-mvp
```

### Cosmos DB Metrics

```bash
az cosmosdb show \
  --name cosmos-openclaw-mvp-dev \
  --resource-group rg-openclaw-mvp \
  --query "id"
```

## Troubleshooting

### OIDC Login Fails

```bash
# Check federated credential
az identity federated-credential show \
  --name github-oidc \
  --identity-name github-openclaw-oidc \
  --resource-group rg-openclaw-mvp
```

### MCP Service Not Healthy

```bash
# Check Container App logs
az container app logs show --name mcp-memory

# Verify environment variables
az container app show --name mcp-memory \
  --resource-group rg-openclaw-mvp \
  --query "properties.template.containers[0].env"
```

### Email Draft Not Sending

```bash
# Check Graph permissions
az ad sp show --id $FOUNDRY_SERVICE_PRINCIPAL_ID

# Verify Cosmos DB drafts container
az cosmosdb sql container show \
  --account-name cosmos-openclaw-mvp-dev \
  --database-name openclaw-db \
  --name drafts
```

## Rollback

```bash
# Delete resource group (all resources)
az group delete --name rg-openclaw-mvp

# Or specific resources
az containerapp delete --name mcp-memory --resource-group rg-openclaw-mvp
```

---

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete system overview.
