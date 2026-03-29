import { CosmosClient } from '@azure/cosmos';
import { logger } from '../utils/logger';

const endpoint = process.env.AZURE_COSMOS_ENDPOINT || 'https://localhost:8081';
const key = process.env.AZURE_COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTjZgSosaQS+/xQAfCkg4q/gMYHeP1z6f0PE7w==';
const databaseId = process.env.COSMOS_DATABASE || 'malgosha-db';

let database: any;

export async function initializeCosmosDb() {
  try {
    const client = new CosmosClient({ endpoint, key });
    const { database: db } = await client.databases.createIfNotExists({ id: databaseId });
    database = db;
    logger.info(`Connected to Cosmos DB: ${databaseId}`);
  } catch (error) {
    logger.error('Failed to initialize Cosmos DB:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!database) {
    throw new Error('Database not initialized');
  }
  return database;
}
