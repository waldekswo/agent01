import { Express, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDatabase } from '../db/cosmos';
import { logger } from '../utils/logger';
import { z } from 'zod';

// ============================================================
// Validation Schemas
// ============================================================
const EventSchema = z.object({
  type: z.string(),
  source: z.string().optional(),
  payload: z.record(z.any()),
  labels: z.array(z.string()).optional(),
  pii: z.boolean().default(false),
  userId: z.string(),
  timestamp: z.string().datetime().optional(),
});

const FactSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.any(),
  evidenceIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  userId: z.string(),
});

// ============================================================
// Tools Registration
// ============================================================
export function registerMcpTools(app: Express) {
  const db = getDatabase();

  // ========== POST /memory/record-event ==========
  app.post('/memory/record-event', async (req: Request, res: Response) => {
    try {
      const data = EventSchema.parse(req.body);
      const eventId = uuid();
      const timestamp = data.timestamp || new Date().toISOString();

      const event = {
        id: eventId,
        type: data.type,
        source: data.source || 'manual',
        payload: data.pii ? maskPII(data.payload) : data.payload,
        labels: data.labels || [],
        userId: data.userId,
        timestamp,
        createdAt: new Date().toISOString(),
      };

      const container = db.container('timeline');
      const { resource } = await container.items.create(event);

      logger.info({ eventId, type: data.type }, 'Event recorded');
      res.json({ id: eventId, createdAt: timestamp });
    } catch (error) {
      logger.error({ error }, 'Failed to record event');
      res.status(400).json({ error: 'Invalid request', details: (error as any).message });
    }
  });

  // ========== POST /memory/upsert-fact ==========
  app.post('/memory/upsert-fact', async (req: Request, res: Response) => {
    try {
      const data = FactSchema.parse(req.body);
      const container = db.container('facts');

      // Look up existing fact by subject + predicate + userId (true upsert semantics)
      const { resources: existing } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.userId = @userId AND c.subject = @subject AND c.predicate = @predicate',
          parameters: [
            { name: '@userId', value: data.userId },
            { name: '@subject', value: data.subject },
            { name: '@predicate', value: data.predicate },
          ],
        })
        .fetchAll();

      const isUpdate = existing.length > 0;
      const factId = isUpdate ? existing[0].id : uuid();

      const fact = {
        id: factId,
        subject: data.subject,
        predicate: data.predicate,
        object: data.object,
        evidenceIds: data.evidenceIds || [],
        confidence: data.confidence,
        userId: data.userId,
        createdAt: isUpdate ? existing[0].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await container.items.upsert(fact);

      logger.info({ factId, subject: data.subject, predicate: data.predicate, isUpdate }, 'Fact upserted');
      res.json({ id: factId, updated: isUpdate });
    } catch (error) {
      logger.error({ error }, 'Failed to upsert fact');
      res.status(400).json({ error: 'Invalid request', details: (error as any).message });
    }
  });

  // ========== GET /memory/query ==========
  app.get('/memory/query', async (req: Request, res: Response) => {
    try {
      const { kind, userId, top = 100 } = req.query;

      if (!kind || !userId) {
        return res.status(400).json({ error: 'Missing kind or userId' });
      }

      const container = db.container(String(kind));
      const topN = Math.min(Math.max(parseInt(String(top)) || 100, 1), 100);
      // NOTE: parameters must be inside SqlQuerySpec (first arg), not FeedOptions (second arg)
      // OFFSET LIMIT does not support parameterized values — inline the number
      const { resources } = await container.items
        .query({
          query: `SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC OFFSET 0 LIMIT ${topN}`,
          parameters: [
            { name: '@userId', value: String(userId) },
          ],
        })
        .fetchAll();

      logger.info({ kind, count: resources.length }, 'Query executed');
      res.json({ items: resources, count: resources.length });
    } catch (error) {
      logger.error({ error }, 'Failed to query');
      res.status(400).json({ error: 'Query failed', details: (error as any).message });
    }
  });

  // ========== DELETE /memory/prune ==========
  app.delete('/memory/prune', async (req: Request, res: Response) => {
    try {
      const { kind, olderThan } = req.body;

      if (!kind || !olderThan) {
        return res.status(400).json({ error: 'Missing kind or olderThan' });
      }

      const container = db.container(kind);
      const { resources } = await container.items
        .query({
          query: 'SELECT c.id FROM c WHERE c.createdAt < @date',
          parameters: [{ name: '@date', value: olderThan }],
        })
        .fetchAll();

      let deleted = 0;
      for (const item of resources) {
        await container.item(item.id, item.id).delete();
        deleted++;
      }

      logger.info({ kind, deleted }, 'Pruned items');
      res.json({ deleted });
    } catch (error) {
      logger.error({ error }, 'Failed to prune');
      res.status(400).json({ error: 'Prune failed', details: (error as any).message });
    }
  });
}

// ============================================================
// Utilities
// ============================================================
function maskPII(obj: any): any {
  const masked = JSON.parse(JSON.stringify(obj));
  const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
  const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;

  const stringify = JSON.stringify(masked);
  const cleaned = stringify
    .replace(emailRegex, '[EMAIL]')
    .replace(phoneRegex, '[PHONE]');

  return JSON.parse(cleaned);
}
