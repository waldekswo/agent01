import { AzureOpenAI } from 'openai';
import { logger } from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — same Azure OpenAI resource as the agent, different deployment
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_ENDPOINT  = process.env.FOUNDRY_AGENT_ENDPOINT || '';
const AGENT_KEY       = process.env.FOUNDRY_AGENT_KEY      || '';
const TTS_DEPLOYMENT  = process.env.TTS_DEPLOYMENT_NAME    || 'waldunio-tts';
const TTS_RESPONSE_FORMAT = 'opus' as const;

// Voice character — 'alloy' is neutral and clear; alternatives: nova, echo, fable, onyx, shimmer
const TTS_VOICE = 'alloy' as const;

// Maximum input length for TTS (Azure OpenAI TTS limit is 4096 chars)
const MAX_INPUT_CHARS = 4096;

// ─────────────────────────────────────────────────────────────────────────────
function buildTtsClient(): AzureOpenAI {
  if (!AGENT_ENDPOINT || !AGENT_KEY) {
    throw new Error('FOUNDRY_AGENT_ENDPOINT and FOUNDRY_AGENT_KEY must be configured');
  }
  return new AzureOpenAI({
    endpoint: AGENT_ENDPOINT,
    apiKey: AGENT_KEY,
    apiVersion: '2025-01-01-preview',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Convert text to OGG Opus audio using Azure OpenAI TTS.
 *
 * @param text - The text to synthesize. Truncated to 4096 chars if longer.
 * @returns Buffer containing OGG Opus audio, or null if synthesis failed.
 */
export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  if (!text.trim()) {
    return null;
  }

  // Strip Markdown formatting — TTS will read symbols literally (e.g. asterisks)
  const plainText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')        // italic
    .replace(/`(.*?)`/g, '$1')          // inline code
    .replace(/#+\s/g, '')               // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → label only
    .trim()
    .slice(0, MAX_INPUT_CHARS);

  logger.info({ chars: plainText.length, deployment: TTS_DEPLOYMENT }, 'Starting TTS synthesis');

  try {
    const client = buildTtsClient();

    const response = await client.audio.speech.create({
      model: TTS_DEPLOYMENT,
      voice: TTS_VOICE,
      input: plainText,
      response_format: TTS_RESPONSE_FORMAT,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength === 0) {
      logger.warn('TTS returned empty audio buffer');
      return null;
    }

    logger.info({ bytes: buffer.byteLength }, 'TTS synthesis complete');
    return buffer;
  } catch (err) {
    logger.error({ err, deployment: TTS_DEPLOYMENT }, 'TTS synthesis failed');
    return null;
  }
}
