import TelegramBot from 'node-telegram-bot-api';
import { logger } from './logger';
import { messageToUMS, buttonActionToUMS } from './ums-mapper';
import { chat } from './agent-client';
import { transcribeVoice } from './speech-to-text';
import { synthesizeSpeech } from './text-to-speech';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send agent response, optionally as voice + text caption
// ─────────────────────────────────────────────────────────────────────────────
async function sendAgentResponse(
  bot: TelegramBot,
  chatId: number,
  userId: string,
  text: string,
  replyWithVoice: boolean = false,
): Promise<void> {
  const response = await chat(userId, text);

  // When a draft email is pending, always send text with approval buttons
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
    return;
  }

  // Voice reply: synthesize audio and send as voice message with text as caption
  if (replyWithVoice) {
    await bot.sendChatAction(chatId, 'record_voice');
    const audioBuffer = await synthesizeSpeech(response.text);

    if (audioBuffer) {
      await bot.sendVoice(
        chatId,
        audioBuffer,
        { caption: response.text, parse_mode: 'Markdown' },
        { filename: 'response.ogg', contentType: 'audio/ogg' },
      );
      return;
    }
    // TTS failed — fall through to text reply
    logger.warn({ userId }, 'TTS failed — falling back to text reply');
  }

  await bot.sendMessage(chatId, response.text, { parse_mode: 'Markdown' });
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

      // 4. Forward transcribed text to agent — reply with voice
      await sendAgentResponse(bot, chatId, userId, transcribed, true);
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
