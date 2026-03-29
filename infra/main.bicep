// https://aka.ms/bicep/syntax for more details
metadata description = 'Malgosha Agent Infrastructure - Root orchestration'
metadata author = 'waldekswo'

param projectName string = 'waldunio-agent01'
param environment string = 'dev'
param location string = 'westeurope'
param tags object = {
  project: 'Malgosha-MVP'
  environment: environment
  createdBy: 'Bicep'
  createdDate: utcNow('u')
}

// ============================================================
// Naming Convention
// ============================================================
var resourceGroupName = 'rg-${projectName}-${environment}'
var cosmosDbName = 'cosmos-${projectName}-${environment}'
var keyVaultName = 'kv-${projectName}-${substring(uniqueString(resourceGroup().id), 0, 3)}'
var acrName = 'acr${substring(replace(toLower(projectName), '-', ''), 0, 15)}${substring(uniqueString(resourceGroup().id), 0, 6)}'
var containerAppEnvName = 'cae-${projectName}-${environment}'

// ============================================================
// MODULE: Key Vault
// ============================================================
module keyVault 'kv.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    location: location
    keyVaultName: keyVaultName
    tags: tags
  }
}

// ============================================================
// MODULE: Cosmos DB
// ============================================================
module cosmosDb 'cosmos.bicep' = {
  name: 'cosmosDbDeployment'
  params: {
    location: location
    cosmosDbAccountName: cosmosDbName
    tags: tags
  }
}

// ============================================================
// MODULE: Container Registry
// ============================================================
module acr 'acr.bicep' = {
  name: 'acrDeployment'
  params: {
    location: location
    acrName: acrName
    tags: tags
  }
}

// ============================================================
// MODULE: Container Apps Environment + mcp-memory
// ============================================================
module containerApps 'ca-memory.bicep' = {
  name: 'containerAppsDeployment'
  params: {
    location: location
    containerAppEnvName: containerAppEnvName
    tags: tags
  }
}

// ============================================================
// OUTPUTS
// ============================================================
output resourceGroupName string = resourceGroupName
output keyVaultUri string = keyVault.outputs.keyVaultUri
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output cosmosDbDatabase string = cosmosDb.outputs.databaseName
output acrLoginServer string = acr.outputs.loginServer
output containerAppEnvId string = containerApps.outputs.envId
