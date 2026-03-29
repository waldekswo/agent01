import TelegramBot from 'node-telegram-bot-api';
import { logger } from './logger';
import { messageToUMS, buttonActionToUMS } from './ums-mapper';
import { chat } from './agent-client';

export async function handleTelegramMessage(bot: TelegramBot, message: any) {
  try {
    const ums = messageToUMS(message);
    logger.info({ ums }, 'Telegram message received');

    // Show typing indicator while agent processes
    await bot.sendChatAction(message.chat.id, 'typing');

    const userId = `telegram:${message.from.id}`;
    const response = await chat(userId, message.text || '');

    if (response.pendingDraftId) {
      // Agent created an email draft — show Approve / Reject inline keyboard
      await bot.sendMessage(message.chat.id, response.text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Wyślij email',
                callback_data: `${response.pendingDraftId}:approve`,
              },
              {
                text: '❌ Anuluj',
                callback_data: `${response.pendingDraftId}:reject`,
              },
            ],
          ],
        },
      });
    } else {
      await bot.sendMessage(message.chat.id, response.text, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to handle message');
    await bot.sendMessage(message.chat.id, '⚠️ Wystąpił błąd. Spróbuj ponownie.');
  }
}

export async function handleCallbackQuery(bot: TelegramBot, query: any) {
  try {
    const action = query.data as string;
    const ums = buttonActionToUMS(query, action);
    logger.info({ ums }, 'Approval callback received');

    // Acknowledge button press immediately
    await bot.answerCallbackQuery(query.id, { text: '⏳ Przetwarzam...' });

    const userId = `telegram:${query.from.id}`;
    const [draftId, actionType] = action.split(':');

    // Build a system-level message so the agent knows the approval decision
    const systemMsg =
      actionType === 'approve'
        ? `[SYSTEM] Użytkownik zatwierdzil wysłanie maila. draftId=${draftId} isApprovedAction=true. Wywołaj teraz graph_send_email.`
        : `[SYSTEM] Użytkownik odrzucił wysłanie maila. draftId=${draftId}. Anuluj draft i poinformuj użytkownika.`;

    const response = await chat(userId, systemMsg);

    // Remove approval buttons from the original message
    await bot
      .editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id },
      )
      .catch(() => { /* message may be too old to edit */ });

    await bot.sendMessage(query.message.chat.id, response.text, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error({ error }, 'Failed to handle callback query');
    await bot.answerCallbackQuery(query.id, { text: '⚠️ Błąd. Spróbuj ponownie.' });
  }
}
