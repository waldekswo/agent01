import { Express, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { parseExpression } from 'cron-parser';
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

const RoutineSchema = z.object({
  name: z.string(),
  userId: z.string(),
  crontab: z.string().default('0 9 * * *'),
  tz: z.string().default('Europe/Warsaw'),
  instructions: z.string().default(''),
  projectRef: z.string().default(''),
  enabled: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.8),
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

  // ========== POST /memory/upsert-routine ==========
  app.post('/memory/upsert-routine', async (req: Request, res: Response) => {
    try {
      const data = RoutineSchema.parse(req.body);
      const container = db.container('routines');

      // True upsert by name + userId
      const { resources: existing } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.userId = @userId AND c.name = @name',
          parameters: [
            { name: '@userId', value: data.userId },
            { name: '@name', value: data.name },
          ],
        })
        .fetchAll();

      const isUpdate = existing.length > 0;
      const routineId = isUpdate ? existing[0].id : uuid();

      // Compute next run from crontab + timezone
      let nextRun: string;
      try {
        nextRun = parseExpression(data.crontab, { tz: data.tz }).next().toDate().toISOString();
      } catch {
        // Fallback: tomorrow 09:00 Warsaw time (UTC+2 offset approx)
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(7, 0, 0, 0); // 09:00 Warsaw = 07:00 UTC
        nextRun = tomorrow.toISOString();
      }

      const routine = {
        id: routineId,
        name: data.name,
        userId: data.userId,
        crontab: data.crontab,
        tz: data.tz,
        instructions: data.instructions,
        projectRef: data.projectRef,
        enabled: data.enabled,
        confidence: data.confidence,
        // Keep existing nextRun if updating (avoid resetting a pending trigger)
        nextRun: isUpdate ? (existing[0].nextRun || nextRun) : nextRun,
        lastRun: isUpdate ? (existing[0].lastRun || null) : null,
        createdAt: isUpdate ? existing[0].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await container.items.upsert(routine);

      logger.info({ routineId, name: data.name, nextRun: routine.nextRun, isUpdate }, 'Routine upserted');
      res.json({ id: routineId, updated: isUpdate, nextRun: routine.nextRun });
    } catch (error) {
      logger.error({ error }, 'Failed to upsert routine');
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
      const { kind, olderThan, userId } = req.body;

      if (!kind || !olderThan || !userId) {
        return res.status(400).json({ error: 'Missing kind, olderThan or userId' });
      }

      const container = db.container(kind);
      // Include userId in SELECT so we have the partition key for deletion
      const { resources } = await container.items
        .query({
          query: 'SELECT c.id, c.userId FROM c WHERE c.userId = @userId AND c.createdAt < @date',
          parameters: [
            { name: '@userId', value: userId },
            { name: '@date', value: olderThan },
          ],
        })
        .fetchAll();

      let deleted = 0;
      for (const item of resources) {
        // Partition key is userId, not id
        await container.item(item.id, item.userId).delete();
        deleted++;
      }

      logger.info({ kind, userId, deleted }, 'Pruned items');
      res.json({ deleted });
    } catch (error) {
      logger.error({ error }, 'Failed to prune');
      res.status(400).json({ error: 'Prune failed', details: (error as any).message });
    }
  });

  // ========== POST /memory/consolidate ==========
  // Scan all facts for a user:
  //  1. Remove exact duplicates (same subject+predicate+object)
  //  2. When multiple facts share subject+predicate, keep the newest; delete the rest
  //  3. Return a report of what was deleted
  app.post('/memory/consolidate', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body as { userId?: string };
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const container = db.container('facts');
      const { resources: allFacts } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC',
          parameters: [{ name: '@userId', value: userId }],
        })
        .fetchAll();

      // Group by subject+predicate — keep the first (newest) in each group
      const seen = new Map<string, any>();
      const toDelete: { id: string; userId: string; reason: string }[] = [];

      for (const fact of allFacts) {
        const key = `${fact.subject}||${fact.predicate}`;
        if (seen.has(key)) {
          // Duplicate — keep newest (already in map), delete this one
          toDelete.push({ id: fact.id, userId: fact.userId, reason: 'duplicate subject+predicate' });
        } else {
          seen.set(key, fact);
        }
      }

      // Also flag exact value duplicates within the survivors (same subject+predicate+object)
      const valueKeys = new Set<string>();
      for (const [key, fact] of seen.entries()) {
        const valueKey = `${key}||${JSON.stringify(fact.object)}`;
        if (valueKeys.has(valueKey)) {
          toDelete.push({ id: fact.id, userId: fact.userId, reason: 'exact duplicate value' });
          seen.delete(key);
        } else {
          valueKeys.add(valueKey);
        }
      }

      let deleted = 0;
      for (const item of toDelete) {
        try {
          await container.item(item.id, item.userId).delete();
          deleted++;
        } catch (err: any) {
          if (err.code !== 404) throw err; // already gone — ignore
        }
      }

      logger.info({ userId, total: allFacts.length, deleted, remaining: allFacts.length - deleted }, 'Facts consolidated');
      res.json({
        total: allFacts.length,
        deleted,
        remaining: allFacts.length - deleted,
        removedIds: toDelete.map(d => ({ id: d.id, reason: d.reason })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to consolidate facts');
      res.status(500).json({ error: 'Consolidation failed', details: (error as any).message });
    }
  });

  // ========== DELETE /memory/fact/:id ==========
  // Delete a single fact by id + userId (partition key)
  app.delete('/memory/fact', async (req: Request, res: Response) => {
    const { id, userId } = req.body as { id?: string; userId?: string };
    try {
      if (!id || !userId) {
        return res.status(400).json({ error: 'Missing id or userId' });
      }

      const container = db.container('facts');
      await container.item(id, userId).delete();

      logger.info({ id, userId }, 'Fact deleted');
      res.json({ deleted: true, id });
    } catch (error: any) {
      if (error.code === 404) {
        return res.status(404).json({ error: 'Fact not found', id });
      }
      logger.error({ error }, 'Failed to delete fact');
      res.status(400).json({ error: 'Delete failed', details: error.message });
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
