import express, { Request, Response } from 'express';
import TelegramBot from 'node-telegram-bot-api';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { handleTelegramMessage, handleCallbackQuery } from './handlers';
import { chat } from './agent-client';

const app = express();
const PORT = process.env.ADAPTER_TELEGRAM_PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3010';

if (!TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: false });

app.use(express.json());
app.use(pinoHttp({ logger }));

// ============================================================
// Webhook endpoint for Telegram
// ============================================================
app.post('/webhook/telegram', async (req: Request, res: Response) => {
  try {
    const update = req.body as any;

    if (update.message) {
      await handleTelegramMessage(bot, update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(bot, update.callback_query);
    } else {
      logger.warn({ update }, 'Unknown update type');
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error({ error }, 'Failed to handle webhook');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: '@malgosha/adapter-telegram',
    version: '0.1.0',
    status: 'ready',
    webhook: `${PUBLIC_BASE_URL}/webhook/telegram`,
  });
});

// ============================================================
// Internal push endpoint — called by mcp-memory routine scheduler
// Lets the scheduler trigger the agent to proactively send a message
// NOTE: accessible only within the Container Apps environment (internal)
// ============================================================
app.post('/internal/push', async (req: Request, res: Response) => {
  try {
    const { userId, instructions } = req.body as { userId?: string; instructions?: string };

    if (!userId || !instructions) {
      return res.status(400).json({ error: 'Missing userId or instructions' });
    }

    // Extract numeric chatId from 'telegram:12345678' format
    const chatId = userId.split(':')[1];
    if (!chatId || !/^\d+$/.test(chatId)) {
      return res.status(400).json({ error: 'Invalid userId format (expected telegram:<chatId>)' });
    }

    // Run agent with routine instructions — agent will query memory, build the message
    const agentResponse = await chat(userId, instructions);
    await bot.sendMessage(chatId, agentResponse.text, { parse_mode: 'Markdown' });

    logger.info({ userId, chatId }, 'Internal push delivered');
    res.json({ delivered: true, userId });
  } catch (error) {
    logger.error({ error }, 'Internal push failed');
    res.status(500).json({ error: 'Push failed', details: (error as Error).message });
  }
});

// ============================================================
// Setup webhook
// ============================================================
async function setupWebhook() {
  try {
    const webhookUrl = `${PUBLIC_BASE_URL}/webhook/telegram`;
    await bot.setWebHook(webhookUrl);
    logger.info({ webhookUrl }, 'Telegram webhook configured');
  } catch (error) {
    logger.warn({ error }, 'Failed to set webhook (may be local dev)');
  }
}

app.listen(PORT, async () => {
  logger.info(`Telegram adapter listening on port ${PORT}`);
  await setupWebhook();
});
