import TelegramBot from 'node-telegram-bot-api';
import { logger } from './logger';
import { messageToUMS, buttonActionToUMS } from './ums-mapper';

export async function handleTelegramMessage(bot: TelegramBot, message: any) {
  try {
    const ums = messageToUMS(message);
    logger.info({ ums }, 'Telegram message received');

    // TODO: Send UMS to Foundry Agent
    // const agentResponse = await fetch(AGENT_ENDPOINT, {post: ums})

    // For now, echo back
    await bot.sendMessage(message.chat.id, `Received: ${message.text}`);
  } catch (error) {
    logger.error({ error }, 'Failed to handle message');
    await bot.sendMessage(message.chat.id, 'Error processing message');
  }
}

export async function handleCallbackQuery(bot: TelegramBot, query: any) {
  try {
    const action = query.data;
    const ums = buttonActionToUMS(query, action);
    logger.info({ ums }, 'Callback query received');

    await bot.answerCallbackQuery(query.id, { text: `Action: ${action}` });

    // TODO: Send to agent
  } catch (error) {
    logger.error({ error }, 'Failed to handle callback query');
    await bot.answerCallbackQuery(query.id, { text: 'Error' });
  }
}
