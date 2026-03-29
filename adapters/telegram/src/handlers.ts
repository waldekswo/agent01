import TelegramBot from 'node-telegram-bot-api';
import { logger } from './logger';
import { messageToUMS, buttonActionToUMS } from './ums-mapper';
import { chat } from './agent-client';
import { transcribeVoice } from './speech-to-text';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send agent response, attaching Approve/Reject buttons if needed
// ─────────────────────────────────────────────────────────────────────────────
async function sendAgentResponse(
  bot: TelegramBot,
  chatId: number,
  userId: string,
  text: string,
): Promise<void> {
  const response = await chat(userId, text);

  if (response.pendingDraftId) {
    await bot.sendMessage(chatId, response.text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Wyślij email', callback_data: `${response.pendingDraftId}:approve` },
            { text: '❌ Anuluj',        callback_data: `${response.pendingDraftId}:reject`  },
          ],
        ],
      },
    });
  } else {
    await bot.sendMessage(chatId, response.text, { parse_mode: 'Markdown' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text / command message
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTelegramMessage(bot: TelegramBot, message: any) {
  const chatId  = message.chat.id as number;
  const userId  = `telegram:${message.from.id}`;

  try {
    // ── Voice message ────────────────────────────────────────────────────────
    if (message.voice) {
      logger.info({ fileId: message.voice.file_id, duration: message.voice.duration }, 'Voice message received');
      await bot.sendChatAction(chatId, 'typing');

      // 1. Get the download URL from Telegram
      const fileLink = await bot.getFileLink(message.voice.file_id);

      // 2. Transcribe with Whisper
      const locale = message.from?.language_code ?? undefined;
      const transcribed = await transcribeVoice(fileLink, locale);

      if (!transcribed) {
        await bot.sendMessage(
          chatId,
          '⚠️ Nie udało się przetworzyć głosówki. Spróbuj napisać wiadomość tekstową.',
        );
        return;
      }

      logger.info({ userId, transcribed }, 'Voice transcribed — forwarding to agent');

      // 3. Show what was understood (inline, small caps style with italic)
      await bot.sendMessage(chatId, `🎤 _"${transcribed}"_`, { parse_mode: 'Markdown' });

      // 4. Forward transcribed text to agent
      await sendAgentResponse(bot, chatId, userId, transcribed);
      return;
    }

    // ── Text / command message ───────────────────────────────────────────────
    const ums = messageToUMS(message);
    logger.info({ ums }, 'Telegram message received');

    await bot.sendChatAction(chatId, 'typing');
    await sendAgentResponse(bot, chatId, userId, message.text || '');
  } catch (error) {
    logger.error({ error }, 'Failed to handle message');
    await bot.sendMessage(chatId, '⚠️ Wystąpił błąd. Spróbuj ponownie.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval button callback
// ─────────────────────────────────────────────────────────────────────────────
export async function handleCallbackQuery(bot: TelegramBot, query: any) {
  try {
    const action = query.data as string;
    const ums = buttonActionToUMS(query, action);
    logger.info({ ums }, 'Approval callback received');

    await bot.answerCallbackQuery(query.id, { text: '⏳ Przetwarzam...' });

    const userId = `telegram:${query.from.id}`;
    const [draftId, actionType] = action.split(':');

    const systemMsg =
      actionType === 'approve'
        ? `[SYSTEM] Użytkownik zatwierdzil wysłanie maila. draftId=${draftId} isApprovedAction=true. Wywołaj teraz graph_send_email.`
        : `[SYSTEM] Użytkownik odrzucił wysłanie maila. draftId=${draftId}. Anuluj draft i poinformuj użytkownika.`;

    const response = await chat(userId, systemMsg);

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
