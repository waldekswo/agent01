metadata description = 'Azure OpenAI resource + gpt-4o model deployment for Foundry Agent'

param location string
param projectName string = 'waldunio-agent01'
param tags object = {}

// Deployment name must match what is configured in orchestrator/agent.yaml and agent-definition.json
param modelDeploymentName string = 'waldunio-agent-gpt-4o-mvp'

// NOTE: If deployment fails with "ModelVersionNotAvailable", run:
//   az cognitiveservices account list-models --name <oai-name> --resource-group <rg>
// and update modelVersion below to a version available in your region.
param modelVersion string = '2024-11-20'

// Whisper deployment name — used by adapter-telegram for speech-to-text
param whisperDeploymentName string = 'waldunio-whisper'

// NOTE: tts-1 is NOT available in West Europe — TTS is disabled.
// Available regions: East US, Sweden Central, North Central US.
// If you move the OpenAI resource to a supported region, re-add the tts deployment.

// Resource name – derived from projectName + uniqueString to ensure global uniqueness
var openAiName = 'oai-${projectName}-${substring(uniqueString(resourceGroup().id), 0, 6)}'

// ============================================================
// Azure OpenAI Account
// ============================================================
resource openAi 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    publicNetworkAccess: 'Enabled'
    // disableLocalAuth: false → allows API key auth (needed for Assistants API in CI/CD)
    disableLocalAuth: false
  }
  tags: tags
}

// ============================================================
// GPT-4o Model Deployment
// ============================================================
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: modelDeploymentName
  sku: {
    // GlobalStandard: best availability & higher limits; available in West Europe
    name: 'GlobalStandard'
    capacity: 10 // 10 000 tokens-per-minute; increase if needed
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: modelVersion
    }
    // Auto-upgrade when current version reaches end-of-life
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// ============================================================
// Whisper Model Deployment (speech-to-text for voice messages)
// ============================================================
resource whisperDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: whisperDeploymentName
  // Whisper must be deployed after GPT-4o (single deployment slot limit on some SKUs)
  dependsOn: [modelDeployment]
  sku: {
    name: 'Standard'
    capacity: 1 // 1 concurrent request — sufficient for voice messages (sequential)
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'whisper'
      version: '001'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// ============================================================
// OUTPUTS (consumed by foundry-agent-deploy.yml)
// ============================================================
output openAiEndpoint string = openAi.properties.endpoint
output openAiName string = openAi.name
output openAiResourceId string = openAi.id
output modelDeploymentName string = modelDeployment.name
output whisperDeploymentName string = whisperDeployment.name
