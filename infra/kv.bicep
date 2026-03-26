metadata description = 'Azure Key Vault for storing secrets and credentials'

param location string
param keyVaultName string
param tags object = {}

// ============================================================
// Key Vault
// ============================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    enabledForDeployment: true
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: []
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
  tags: tags
}

// ============================================================
// TODO: Add secret examples (to be stored via GitHub Actions or manual)
// - TelegramBotToken
// - GraphClientSecret
// - FoundryApiKey
// ============================================================

// ============================================================
// OUTPUTS
// ============================================================
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
