metadata description = 'Azure Container Registry for MCP services and adapters'

param location string
param acrName string
param tags object = {}

// ============================================================
// Container Registry
// ============================================================
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
  tags: tags
}

// ============================================================
// OUTPUTS
// ============================================================
output registryId string = containerRegistry.id
output loginServer string = containerRegistry.properties.loginServer
