import { AzureOpenAI } from 'openai';
import { logger } from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — values injected via Container App env vars (from Key Vault)
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_ENDPOINT  = process.env.FOUNDRY_AGENT_ENDPOINT || '';
const AGENT_KEY       = process.env.FOUNDRY_AGENT_KEY      || '';
const AGENT_ID        = process.env.FOUNDRY_AGENT_ID       || '';
const MCP_MEMORY_URL  = process.env.MCP_MEMORY_URL || 'http://mcp-memory';
const MCP_GRAPH_URL   = process.env.MCP_GRAPH_URL  || 'http://mcp-graph';
const MCP_HTTP_URL    = process.env.MCP_HTTP_URL   || 'http://mcp-http';
const MCP_FILES_URL   = process.env.MCP_FILES_URL  || 'http://mcp-files';

const POLL_INTERVAL_MS = 700;
const MAX_POLLS        = 100; // ~70 s max per run

// ─────────────────────────────────────────────────────────────────────────────
// Thread store — persists conversation threads per userId in memory.
// NOTE: Resets on container restart — acceptable for MVP.
// ─────────────────────────────────────────────────────────────────────────────
const threadStore = new Map<string, string>();

// ─────────────────────────────────────────────────────────────────────────────
export interface AgentResponse {
  /** Text to send back to the user */
  text: string;
  /** Set when the agent created an email draft that needs user approval */
  pendingDraftId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildClient(): AzureOpenAI {
  if (!AGENT_ENDPOINT || !AGENT_KEY) {
    throw new Error('FOUNDRY_AGENT_ENDPOINT and FOUNDRY_AGENT_KEY must be configured');
  }
  return new AzureOpenAI({
    endpoint: AGENT_ENDPOINT,
    apiKey: AGENT_KEY,
    apiVersion: '2024-05-01-preview',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool dispatcher
// Translates an OpenAI tool_call → HTTP request to the correct MCP service
// ─────────────────────────────────────────────────────────────────────────────
async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ output: string; pendingDraftId?: string }> {
  let url: string;
  let method = 'POST';
  let body: unknown = args;
  let pendingDraftId: string | undefined;

  switch (toolName) {
    // ── mcp-memory ──────────────────────────────────────────────────────────
    case 'memory_record_event':
      url = `${MCP_MEMORY_URL}/memory/record-event`;
      break;
    case 'memory_upsert_fact':
      url = `${MCP_MEMORY_URL}/memory/upsert-fact`;
      break;
    case 'memory_upsert_routine':
      url = `${MCP_MEMORY_URL}/memory/upsert-routine`;
      break;
    case 'memory_query': {
      const params = new URLSearchParams({
        kind:   String(args.kind),
        userId: String(args.userId),
        ...(args.top ? { top: String(args.top) } : {}),
      });
      url    = `${MCP_MEMORY_URL}/memory/query?${params}`;
      method = 'GET';
      body   = undefined;
      break;
    }
    case 'memory_prune':
      url    = `${MCP_MEMORY_URL}/memory/prune`;
      method = 'DELETE';
      break;

    // ── mcp-graph ───────────────────────────────────────────────────────────
    case 'graph_draft_email':
      url = `${MCP_GRAPH_URL}/graph/email/draft`;
      break;
    case 'graph_send_email':
      url = `${MCP_GRAPH_URL}/graph/email/send`;
      break;

    // ── mcp-http ────────────────────────────────────────────────────────────
    case 'http_request':
      url = `${MCP_HTTP_URL}/http/request`;
      break;

    // ── mcp-files ───────────────────────────────────────────────────────────
    case 'files_list':
      url    = `${MCP_FILES_URL}/files`;
      method = 'GET';
      body   = undefined;
      break;
    case 'files_read':
      url    = `${MCP_FILES_URL}/files/${encodeURIComponent(String(args.filename))}`;
      method = 'GET';
      body   = undefined;
      break;
    case 'files_write':
      url    = `${MCP_FILES_URL}/files/${encodeURIComponent(String(args.filename))}`;
      method = 'PUT';
      body   = { content: args.content };
      break;
    case 'files_delete':
      url    = `${MCP_FILES_URL}/files/${encodeURIComponent(String(args.filename))}`;
      method = 'DELETE';
      body   = undefined;
      break;

    default:
      logger.warn({ toolName }, 'Unknown MCP tool — skipping');
      return { output: JSON.stringify({ error: `Unknown tool: ${toolName}` }) };
  }

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({ status: res.status }));
    logger.info({ toolName, status: res.status }, 'MCP tool dispatch OK');

    // Capture draftId when agent creates an email draft
    if (toolName === 'graph_draft_email' && (data as any).draftId) {
      pendingDraftId = (data as any).draftId as string;
    }

    return { output: JSON.stringify(data), pendingDraftId };
  } catch (err) {
    logger.error({ toolName, err }, 'MCP tool dispatch failed');
    return {
      output: JSON.stringify({ error: 'Tool unavailable', detail: (err as Error).message }),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — send a user message to the agent and receive a response
// ─────────────────────────────────────────────────────────────────────────────
export async function chat(userId: string, text: string): Promise<AgentResponse> {
  if (!AGENT_ID) {
    throw new Error('FOUNDRY_AGENT_ID must be configured');
  }

  const client = buildClient();

  // Get or create a persistent thread for this user
  let threadId = threadStore.get(userId);
  if (!threadId) {
    const thread = await client.beta.threads.create();
    threadId = thread.id as string;
    threadStore.set(userId, threadId);
    logger.info({ userId, threadId }, 'New assistant thread created');
  }

  // Append the user message
  await client.beta.threads.messages.create(threadId, {
    role: 'user',
    content: text,
  });

  // Start a run against the assistant
  const run = await client.beta.threads.runs.create(threadId, {
    assistant_id: AGENT_ID,
    additional_instructions: `Aktualna data i czas (UTC): ${new Date().toISOString()}. Aktualny userId użytkownika to: "${userId}". Używaj DOKŁADNIE tej wartości we wszystkich wywołaniach narzędzi memory (memory_query, memory_upsert_fact, memory_record_event, memory_upsert_routine, memory_prune).`,
  });

  // ── Poll loop ──────────────────────────────────────────────────────────────
  let capturedDraftId: string | undefined;

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await client.beta.threads.runs.retrieve(threadId, run.id);
    logger.debug({ userId, runId: run.id, status: status.status, poll }, 'Run poll');

    switch (status.status) {
      case 'completed': {
        const messages = await client.beta.threads.messages.list(threadId, {
          limit: 1,
          order: 'desc',
        });
        const lastMsg = messages.data[0];
        const textContent = lastMsg?.content
          .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
          .map((c) => c.text.value)
          .join('\n')
          .trim();

        return { text: textContent || '(brak odpowiedzi)', pendingDraftId: capturedDraftId };
      }

      case 'requires_action': {
        const toolCalls =
          status.required_action?.submit_tool_outputs?.tool_calls ?? [];

        const toolOutputs: { tool_call_id: string; output: string }[] = [];

        for (const call of toolCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.function.arguments) as Record<string, unknown>;
          } catch {
            /* malformed JSON from model — proceed with empty args */
          }

          const { output, pendingDraftId } = await dispatchTool(
            call.function.name,
            parsedArgs,
          );
          if (pendingDraftId) capturedDraftId = pendingDraftId;
          toolOutputs.push({ tool_call_id: call.id, output });
        }

        await client.beta.threads.runs.submitToolOutputs(threadId, run.id, {
          tool_outputs: toolOutputs,
        });
        break;
      }

      case 'failed':
      case 'cancelled':
      case 'expired': {
        const reason = status.last_error?.message ?? status.status;
        logger.error({ userId, runId: run.id, reason }, 'Run ended with error');
        return { text: `Przepraszam, wystąpił błąd: ${reason}` };
      }

      // queued / in_progress — keep polling
    }
  }

  logger.error({ userId, runId: run.id }, 'Run timed out');
  return { text: 'Przepraszam, odpowiedź zajęła zbyt dużo czasu. Spróbuj ponownie.' };
}
