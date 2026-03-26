import { logger } from './logger';

const allowlistEnv = process.env.HTTP_ALLOWLIST_URLS || '';
const allowlist = allowlistEnv.split('|').filter(Boolean);

export function validateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const matches = allowlist.some((allowed) => {
      const allowedUrl = new URL(allowed);
      return url.hostname === allowedUrl.hostname && url.protocol === allowedUrl.protocol;
    });

    if (!matches) {
      logger.warn({ url: urlString, allowlist }, 'URL not in allowlist');
    }
    return matches;
  } catch (error) {
    logger.error({ error }, 'Invalid URL');
    return false;
  }
}

export async function performRequest(config: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout: number;
}): Promise<any> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), config.timeout);

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body,
      signal: abortController.signal,
    });

    const text = await response.text();
    clearTimeout(timeoutId);

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: text,
      duration_ms: config.timeout,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
