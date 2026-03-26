import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { validateUrl, performRequest } from './http-client';
import { z } from 'zod';

const app = express();
const PORT = process.env.MCP_HTTP_PORT || 3000;

app.use(express.json());
app.use(pinoHttp({ logger }));

const RequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.number().int().min(1000).max(60000).default(30000),
});

// ========== POST /http/request ==========
app.post('/http/request', async (req: Request, res: Response) => {
  try {
    const data = RequestSchema.parse(req.body);

    // Validate URL against allowlist
    if (!validateUrl(data.url)) {
      return res.status(403).json({ error: 'URL not in allowlist' });
    }

    const result = await performRequest(data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ error }, 'HTTP request failed');
    res.status(400).json({ error: 'Invalid request', details: (error as any).message });
  }
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  logger.info(`mcp-http listening on port ${PORT}`);
});
