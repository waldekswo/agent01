import { Express, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDatabase } from '../db/cosmos';
import { logger } from '../utils/logger';
import { z } from 'zod';

// ============================================================
// Validation Schemas
// ============================================================
const DraftEmailSchema = z.object({
  userId: z.string(),
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content_base64: z.string(),
      })
    )
    .optional(),
});

const SendEmailSchema = z.object({
  draftId: z.string(),
  isApprovedAction: z.boolean().refine((val) => val === true, {
    message: 'Email requires approval - isApprovedAction must be true',
  }),
  comment: z.string().optional(),
});

// ============================================================
// Tools Registration
// ============================================================
export function registerGraphTools(app: Express) {
  const db = getDatabase();

  // ========== POST /graph/email/draft ==========
  app.post('/graph/email/draft', async (req: Request, res: Response) => {
    try {
      const data = DraftEmailSchema.parse(req.body);
      const draftId = uuid();

      const draft = {
        id: draftId,
        userId: data.userId,
        to: data.to,
        cc: data.cc || [],
        subject: data.subject,
        body: data.body,
        attachments: data.attachments || [],
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const container = db.container('drafts');
      await container.items.create(draft);

      logger.info({ draftId, userId: data.userId }, 'Email draft created');
      res.json({
        draftId,
        webLink: `https://outlook.office.com/mail/inbox/${draftId}`,
        createdAt: draft.createdAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create draft');
      res.status(400).json({ error: 'Invalid request', details: (error as any).message });
    }
  });

  // ========== POST /graph/email/send ==========
  app.post('/graph/email/send', async (req: Request, res: Response) => {
    try {
      const data = SendEmailSchema.parse(req.body);

      const container = db.container('drafts');
      const draft = await container.item(data.draftId, data.draftId).read();

      if (!draft.resource) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      // TODO: Call Microsoft Graph API to send email
      // For now, just update status in Cosmos
      const messageId = uuid();
      const sentAt = new Date().toISOString();

      draft.resource.status = 'sent';
      draft.resource.messageId = messageId;
      draft.resource.sentAt = sentAt;
      draft.resource.approvalComment = data.comment;

      await container.item(data.draftId, data.draftId).replace(draft.resource);

      logger.info({ draftId: data.draftId, messageId }, 'Email sent');
      res.json({ messageId, sent: true, sentAt });
    } catch (error) {
      logger.error({ error }, 'Failed to send email');
      res.status(400).json({ error: 'Send failed', details: (error as any).message });
    }
  });

  // ========== GET /graph/email/draft/{draftId} ==========
  app.get('/graph/email/draft/:draftId', async (req: Request, res: Response) => {
    try {
      const { draftId } = req.params;
      const container = db.container('drafts');
      const draft = await container.item(draftId, draftId).read();

      if (!draft.resource) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      res.json(draft.resource);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch draft');
      res.status(400).json({ error: 'Fetch failed' });
    }
  });

  // ========== DELETE /graph/email/draft/{draftId} ==========
  app.delete('/graph/email/draft/:draftId', async (req: Request, res: Response) => {
    try {
      const { draftId } = req.params;
      const container = db.container('drafts');
      await container.item(draftId, draftId).delete();

      logger.info({ draftId }, 'Draft deleted');
      res.json({ deleted: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete draft');
      res.status(400).json({ error: 'Delete failed' });
    }
  });
}
