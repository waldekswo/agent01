import { parseExpression } from 'cron-parser';
import { getDatabase } from './db/cosmos';
import { logger } from './utils/logger';

const ADAPTER_TELEGRAM_URL = process.env.ADAPTER_TELEGRAM_URL || 'http://adapter-telegram';
const MCP_MEMORY_URL       = process.env.MCP_MEMORY_URL       || 'http://localhost:3000';
const SCHEDULER_INTERVAL_MS = 60_000; // check every minute

// ─────────────────────────────────────────────────────────────────────────────
// Start the routine scheduler.
// Runs a tick immediately (after 5s startup grace) then every 60s.
// ─────────────────────────────────────────────────────────────────────────────
export function startScheduler(): void {
  logger.info({ adapterUrl: ADAPTER_TELEGRAM_URL }, 'Routine scheduler started');
  setTimeout(() => void tickScheduler(), 5_000);
  setInterval(() => {
    void tickScheduler();
    void tickConsolidation();
  }, SCHEDULER_INTERVAL_MS);
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
// Nightly consolidation: runs once per day at 21:00 Warsaw time.
// 1. Calls /memory/consolidate to remove duplicate facts
// 2. Asks the agent to review, re-organise and describe the current knowledge state
// ─────────────────────────────────────────────────────────────────────────────
const CONSOLIDATION_CRON = '0 21 * * *';
const CONSOLIDATION_TZ   = 'Europe/Warsaw';

// Track next consolidation time in-process (reset on restart — safe, just means
// it may run once per restart if past 21:00; no double-run within 60 min window)
let nextConsolidation: Date = computeNextConsolidation();

function computeNextConsolidation(): Date {
  try {
    return parseExpression(CONSOLIDATION_CRON, { tz: CONSOLIDATION_TZ }).next().toDate();
  } catch {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(19, 0, 0, 0); // 21:00 Warsaw = 19:00 UTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promise<void> {
  const now = new Date();
  if (now < nextConsolidation) return;

  // Advance next consolidation before async work to prevent double-fire
  nextConsolidation = computeNextConsolidation();
  logger.info({ nextConsolidation }, 'Starting nightly knowledge consolidation');

  try {
    // Find all distinct userIds that have facts stored
    const db = getDatabase();
    const factsContainer = db.container('facts');
    const { resources: userRows } = await factsContainer.items
      .query({ query: 'SELECT DISTINCT VALUE c.userId FROM c' })
      .fetchAll();

    for (const userId of userRows) {
      if (!userId) continue;
      await consolidateUser(userId);
    }
  } catch (err) {
    logger.error({ err }, 'Nightly consolidation failed');
  }
}

async function consolidateUser(userId: string): Promise<void> {
  try {
    // 1. Programmatic dedup via /memory/consolidate endpoint (self-call)
    const consolidateRes = await fetch(`${MCP_MEMORY_URL}/memory/consolidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    let consolidateReport = { deleted: 0, remaining: 0 };
    if (consolidateRes.ok) {
      consolidateReport = await consolidateRes.json();
      logger.info({ userId, ...consolidateReport }, 'Programmatic consolidation complete');
    } else {
      logger.warn({ userId, status: consolidateRes.status }, 'Programmatic consolidation failed');
    }

    // 2. Ask the agent to semantically review, reorganise and report on the knowledge base
    const instructions = [
      `[Nocna konsolidacja wiedzy — ${new Date().toLocaleDateString('pl-PL')}]`,
      `Właśnie zakończyłem automatyczne usuwanie duplikatów (usunięto ${consolidateReport.deleted} wpisów, pozostało ${consolidateReport.remaining}).`,
      `Twoje zadanie:`,
      `1. Wywołaj memory_query(kind='facts', userId='${userId}') aby zobaczyć całą bazę wiedzy.`,
      `2. Przejrzyj wszystkie fakty. Jeśli zauważysz semantyczne duplikaty lub sprzeczne informacje (np. dwie różne wartości dla tego samego tematu), usuń gorszy wpis przez memory_delete_fact i zachowaj bardziej aktualny/dokładny.`,
      `3. Jeśli jakiś fakt jest nieprecyzyjny lub niepełny, zaktualizuj go przez memory_upsert_fact z dokładniejszą wartością.`,
      `4. Nie wysyłaj żadnej wiadomości do użytkownika — to jest ciche zadanie tła. Pracuj cicho.`,
      `5. Po zakończeniu wywołaj memory_record_event(type='knowledge_consolidation', payload={deleted_programmatic: ${consolidateReport.deleted}, reviewed: true}).`,
    ].join(' ');

    const pushRes = await fetch(`${ADAPTER_TELEGRAM_URL}/internal/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, instructions }),
    });

    if (!pushRes.ok) {
      const body = await pushRes.text().catch(() => '');
      logger.warn({ userId, status: pushRes.status, body }, 'Agent consolidation push failed');
    } else {
      logger.info({ userId }, 'Agent knowledge consolidation dispatched');
    }
  } catch (err) {
    logger.error({ userId, err }, 'consolidateUser failed');
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
