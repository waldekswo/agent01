import { parseExpression } from 'cron-parser';
import { getDatabase } from './db/cosmos';
import { logger } from './utils/logger';

const ADAPTER_TELEGRAM_URL = process.env.ADAPTER_TELEGRAM_URL || 'http://adapter-telegram';
const SCHEDULER_INTERVAL_MS = 60_000; // check every minute

// ─────────────────────────────────────────────────────────────────────────────
// Start the routine scheduler.
// Runs a tick immediately (after 5s startup grace) then every 60s.
// ─────────────────────────────────────────────────────────────────────────────
export function startScheduler(): void {
  logger.info({ adapterUrl: ADAPTER_TELEGRAM_URL }, 'Routine scheduler started');
  setTimeout(() => void tickScheduler(), 5_000);
  setInterval(() => void tickScheduler(), SCHEDULER_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
async function tickScheduler(): Promise<void> {
  try {
    const db = getDatabase();
    const container = db.container('routines');
    const now = new Date().toISOString();

    // Cross-partition query: find all enabled routines that are due
    const { resources: dueRoutines } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.enabled = true AND c.nextRun <= @now',
        parameters: [{ name: '@now', value: now }],
      })
      .fetchAll();

    if (dueRoutines.length === 0) return;

    logger.info({ count: dueRoutines.length }, 'Routines due for execution');

    for (const routine of dueRoutines) {
      await executeRoutine(routine, container);
    }
  } catch (err) {
    logger.error({ err }, 'Scheduler tick failed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function executeRoutine(routine: any, container: any): Promise<void> {
  const { id, name, userId, crontab, tz, instructions, projectRef } = routine;

  try {
    const prompt = buildPrompt(instructions, projectRef);

    const res = await fetch(`${ADAPTER_TELEGRAM_URL}/internal/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, instructions: prompt }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Push responded ${res.status}: ${body}`);
    }

    logger.info({ routineId: id, name, userId }, 'Routine executed successfully');

    // Compute next run time
    const nextRun = computeNextRun(crontab, tz || 'Europe/Warsaw');

    // Persist updated nextRun + lastRun
    await container.items.upsert({
      ...routine,
      nextRun,
      lastRun: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    logger.info({ routineId: id, nextRun }, 'Routine rescheduled');
  } catch (err) {
    logger.error({ routineId: id, name, userId, err }, 'Routine execution failed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function computeNextRun(crontab: string, tz: string): string {
  try {
    return parseExpression(crontab, { tz }).next().toDate().toISOString();
  } catch {
    // Fallback: tomorrow 09:00 Warsaw → 07:00 UTC
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(7, 0, 0, 0);
    return tomorrow.toISOString();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function buildPrompt(instructions: string, projectRef: string): string {
  const base = instructions?.trim() || 'Wyślij codzienną wiadomość do użytkownika.';

  if (projectRef?.trim()) {
    return (
      `[Zaplanowana rutyna — projekt: ${projectRef}] ` +
      `${base} ` +
      `Zanim odpiszesz, wywołaj memory_query(kind='facts') aby pobrać aktualne dane projektu "${projectRef}" ` +
      `i uwzględnij je w wiadomości.`
    );
  }

  return `[Zaplanowana rutyna] ${base}`;
}
