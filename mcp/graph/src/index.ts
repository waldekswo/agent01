import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { initializeCosmosDb } from './db/cosmos';
import { registerGraphTools } from './mcp/register';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.MCP_GRAPH_PORT || 3000;

app.use(express.json());
app.use(pinoHttp({ logger }));

let dbInitialized = false;

async function startServer() {
  try {
    logger.info('Initializing Cosmos DB for Graph service...');
    await initializeCosmosDb();
    dbInitialized = true;
    logger.info('Cosmos DB initialized');

    registerGraphTools(app);
    logger.info('Graph MCP tools registered');

    app.get('/healthz', (_req: Request, res: Response) => {
      if (dbInitialized) {
        res.status(200).json({ status: 'healthy', version: '0.1.0' });
      } else {
        res.status(503).json({ status: 'initializing' });
      }
    });

    app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: '@malgosha/mcp-graph',
        version: '0.1.0',
        status: 'ready',
        endpoints: [
          'POST /graph/email/draft',
          'POST /graph/email/send',
          'GET /graph/email/draft/{draftId}',
          'DELETE /graph/email/draft/{draftId}',
        ],
      });
    });

    app.use((err: any, _req: Request, res: Response) => {
      logger.error('Unhandled error', err);
      res.status(500).json({ error: 'Internal Server Error' });
    });

    app.listen(PORT, () => {
      logger.info(`mcp-graph server listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

startServer();
