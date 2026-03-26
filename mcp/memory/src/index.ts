import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { initializeDatabase, getDatabase } from './db/cosmos';
import { registerMcpTools } from './mcp/register';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.MCP_MEMORY_PORT || 3000;

// Middleware
app.use(express.json());
app.use(pinoHttp({ logger }));

// ============================================================
// Initialize Cosmos DB on startup
// ============================================================
let dbInitialized = false;

async function startServer() {
  try {
    logger.info('Initializing Cosmos DB connection...');
    await initializeDatabase();
    dbInitialized = true;
    logger.info('Cosmos DB initialized successfully');

    // Register MCP tools
    registerMcpTools(app);
    logger.info('MCP tools registered');

    // Health check endpoint
    app.get('/healthz', (_req: Request, res: Response) => {
      if (dbInitialized) {
        res.status(200).json({ status: 'healthy', version: '0.1.0' });
      } else {
        res.status(503).json({ status: 'initializing' });
      }
    });

    // Root endpoint
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: '@openclaw/mcp-memory',
        version: '0.1.0',
        status: 'ready',
        endpoints: [
          'POST /memory/record-event',
          'POST /memory/upsert-fact',
          'POST /memory/upsert-routine',
          'GET /memory/query',
          'DELETE /memory/prune',
        ],
      });
    });

    // Error handler
    app.use((err: any, _req: Request, res: Response) => {
      logger.error('Unhandled error', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message || 'Unknown error',
      });
    });

    app.listen(PORT, () => {
      logger.info(`mcp-memory server listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

startServer();
