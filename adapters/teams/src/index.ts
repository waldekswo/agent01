import express, { Request, Response } from 'express';
import {
  BotFrameworkAdapter,
  TeamsActivityHandler,
  MemoryStorage,
  ConversationState,
  UserState,
} from 'botbuilder';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { TeamsBot } from './bot';

const app = express();
const PORT = process.env.ADAPTER_TEAMS_PORT || 3000;

const adapter = new BotFrameworkAdapter({
  appId: process.env.TEAMS_BOT_APP_ID || '',
  appPassword: process.env.TEAMS_BOT_APP_PASSWORD || '',
});

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

const bot = new TeamsBot(conversationState, userState);

app.use(express.json());
app.use(pinoHttp({ logger }));

app.post('/api/messages', async (req: Request, res: Response) => {
  try {
    await adapter.processActivity(req, res, async (context) => {
      await bot.run(context);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to process activity');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: '@openclaw/adapter-teams',
    version: '0.1.0',
    status: 'ready',
    endpoint: 'POST /api/messages',
  });
});

app.listen(PORT, () => {
  logger.info(`Teams adapter listening on port ${PORT}`);
});
