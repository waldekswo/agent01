metadata description = 'Cosmos DB infrastructure for Malgosha Agent memory'

param location string
param cosmosDbAccountName string
param tags object = {}

// ============================================================
// Cosmos DB Account
// ============================================================
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: cosmosDbAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxIntervalInSeconds: 15
      maxStalenessPrefix: 100
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    enableFreeTier: false
  }
  tags: tags
}

// ============================================================
// Database
// ============================================================
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosDbAccount
  name: 'malgosha-db'
  properties: {
    resource: {
      id: 'malgosha-db'
    }
  }
}

// ============================================================
// Container: timeline (events log)
// ============================================================
resource timelineContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: 'timeline'
  properties: {
    resource: {
      id: 'timeline'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      defaultTtl: -1
    }
  }
}

// ============================================================
// Container: facts (knowledge base)
// ============================================================
resource factsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: 'facts'
  properties: {
    resource: {
      id: 'facts'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      uniqueKeyPolicy: {
        uniqueKeys: [
          {
            paths: ['/subject', '/predicate', '/userId']
          }
        ]
      }
      defaultTtl: -1
    }
  }
}

// ============================================================
// Container: routines (scheduled tasks)
// ============================================================
resource routinesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: 'routines'
  properties: {
    resource: {
      id: 'routines'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      defaultTtl: -1
    }
  }
}

// ============================================================
// Container: drafts (email drafts awaiting approval)
// ============================================================
resource draftsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: 'drafts'
  properties: {
    resource: {
      id: 'drafts'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      defaultTtl: 86400
    }
  }
}

// ============================================================
// Container: stats (usage metrics)
// ============================================================
resource statsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: 'stats'
  properties: {
    resource: {
      id: 'stats'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      defaultTtl: 2592000
    }
  }
}

// ============================================================
// OUTPUTS
// ============================================================
output endpoint string = cosmosDbAccount.properties.documentEndpoint
output databaseName string = database.name
