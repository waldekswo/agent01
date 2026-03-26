import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { z } from 'zod';

const app = express();
const PORT = process.env.MCP_FILES_PORT || 3000;
const BASE_PATH = process.env.MCP_FILES_BASE_PATH || '/data/agent';

app.use(express.json({ limit: '100mb' }));
app.use(pinoHttp({ logger }));

// Ensure base path exists
async function ensureBasePath() {
  try {
    await fs.mkdir(BASE_PATH, { recursive: true });
  } catch (error) {
    logger.error(error);
  }
}

const FilenameSchema = z.string().regex(/^[\w\-. ]+$/);

function sanitizePath(filename: string): string {
  const validated = FilenameSchema.parse(filename);
  const fullPath = path.join(BASE_PATH, validated);
  const resolved = path.resolve(fullPath);

  if (!resolved.startsWith(BASE_PATH)) {
    throw new Error('Path traversal not allowed');
  }
  return resolved;
}

app.get('/files', async (_req: Request, res: Response) => {
  try {
    const files = await fs.readdir(BASE_PATH);
    const details = await Promise.all(
      files.map(async (name) => {
        const stat = await fs.stat(path.join(BASE_PATH, name));
        return {
          name,
          size: stat.size,
          modified: stat.mtime,
        };
      })
    );
    res.json({ files: details });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.get('/files/:filename', async (req: Request, res: Response) => {
  try {
    const filepath = sanitizePath(req.params.filename);
    const content = await fs.readFile(filepath, 'utf-8');
    res.json({ filename: req.params.filename, content });
  } catch (error) {
    logger.error(error);
    res.status(400).json({ error: 'File not found' });
  }
});

app.put('/files/:filename', async (req: Request, res: Response) => {
  try {
    const filepath = sanitizePath(req.params.filename);
    const { content } = req.body;

    await fs.writeFile(filepath, content, 'utf-8');
    const stat = await fs.stat(filepath);

    res.json({ saved: true, size: stat.size, path: req.params.filename });
  } catch (error) {
    logger.error(error);
    res.status(400).json({ error: 'Write failed' });
  }
});

app.delete('/files/:filename', async (req: Request, res: Response) => {
  try {
    const filepath = sanitizePath(req.params.filename);
    await fs.unlink(filepath);
    res.json({ deleted: true });
  } catch (error) {
    logger.error(error);
    res.status(400).json({ error: 'Delete failed' });
  }
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

(async () => {
  await ensureBasePath();
  app.listen(PORT, () => {
    logger.info(`mcp-files listening on port ${PORT} (base: ${BASE_PATH})`);
  });
})();
