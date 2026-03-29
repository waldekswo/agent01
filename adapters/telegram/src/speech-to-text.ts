import { AzureOpenAI, toFile } from 'openai';
import { logger } from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — same Azure OpenAI resource as the agent, different deployment
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_ENDPOINT       = process.env.FOUNDRY_AGENT_ENDPOINT      || '';
const AGENT_KEY            = process.env.FOUNDRY_AGENT_KEY           || '';
const WHISPER_DEPLOYMENT   = process.env.WHISPER_DEPLOYMENT_NAME     || 'waldunio-whisper';

// Max voice file size we'll attempt to transcribe (25 MB — OpenAI Whisper limit)
const MAX_BYTES = 25 * 1024 * 1024;

// Telegram sends voice messages as OGG Opus; Whisper accepts it natively
const AUDIO_MIME = 'audio/ogg';
const AUDIO_FILENAME = 'voice.ogg';

// ─────────────────────────────────────────────────────────────────────────────
function buildWhisperClient(): AzureOpenAI {
  if (!AGENT_ENDPOINT || !AGENT_KEY) {
    throw new Error('FOUNDRY_AGENT_ENDPOINT and FOUNDRY_AGENT_KEY must be configured');
  }
  return new AzureOpenAI({
    endpoint: AGENT_ENDPOINT,
    apiKey: AGENT_KEY,
    // Whisper API uses this version on Azure
    apiVersion: '2024-06-01',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Download a Telegram voice file and transcribe it using Azure OpenAI Whisper.
 *
 * @param fileUrl - Direct HTTPS URL to the Telegram voice file (from bot.getFileLink)
 * @param locale  - Optional BCP-47 language hint (e.g. 'pl', 'en'). Improves accuracy.
 * @returns Transcribed text, or null if transcription failed
 */
export async function transcribeVoice(
  fileUrl: string,
  locale?: string,
): Promise<string | null> {
  logger.info({ fileUrl, locale }, 'Starting voice transcription');

  // ── 1. Download the OGG file from Telegram ──────────────────────────────
  let audioBuffer: Buffer;
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      logger.error({ status: response.status, fileUrl }, 'Failed to download voice file');
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err }, 'Network error downloading voice file');
    return null;
  }

  if (audioBuffer.byteLength === 0) {
    logger.warn('Downloaded voice file is empty');
    return null;
  }

  if (audioBuffer.byteLength > MAX_BYTES) {
    logger.warn({ size: audioBuffer.byteLength }, 'Voice file too large for Whisper (>25MB)');
    return null;
  }

  // ── 2. Transcribe with Azure OpenAI Whisper ──────────────────────────────
  try {
    const client = buildWhisperClient();

    const audioFile = await toFile(audioBuffer, AUDIO_FILENAME, { type: AUDIO_MIME });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: WHISPER_DEPLOYMENT,
      // Provide language hint if available — reduces hallucination on short clips
      ...(locale ? { language: locale } : {}),
      response_format: 'text',
    });

    // Azure response_format:'text' returns the string directly (SDK wraps as .text)
    const text =
      typeof transcription === 'string'
        ? transcription.trim()
        : (transcription as any).text?.trim() ?? '';

    if (!text) {
      logger.warn('Whisper returned empty transcription');
      return null;
    }

    logger.info({ chars: text.length, locale }, 'Voice transcription complete');
    return text;
  } catch (err) {
    logger.error({ err, deployment: WHISPER_DEPLOYMENT }, 'Whisper transcription failed');
    return null;
  }
}
