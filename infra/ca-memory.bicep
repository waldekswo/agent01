metadata description = 'Container Apps Environment + mcp-memory deployment'

param location string
param containerAppEnvName string
param tags object = {}

// ============================================================
// Log Analytics Workspace
// ============================================================
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'law-${containerAppEnvName}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
  }
  tags: tags
}

// ============================================================
// Container Apps Environment
// ============================================================
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2023-11-02-preview' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
  tags: tags
}

// ============================================================
// Container App: mcp-memory (TODO - manual deployment via docker)
// ============================================================
// TODO: Deploy mcp-memory as Container App
// This requires:
// 1. Build and push Docker image to ACR
// 2. Create Managed Identity with Cosmos DB permissions
// 3. Deploy container app with environment variables

// ============================================================
// OUTPUTS
// ============================================================
output envId string = containerAppEnvironment.id
output envName string = containerAppEnvironment.name
