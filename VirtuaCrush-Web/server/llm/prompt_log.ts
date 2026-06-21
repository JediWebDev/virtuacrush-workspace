// In-memory ring buffer of recent LLM prompts for cloud debugging (Railway logs
// are easy to miss or truncate). Enabled when LLM_LOG_PROMPTS is truthy.

export interface PromptLogEntry {
  at: string;
  kind: 'complete' | 'stream';
  provider: string;
  chars: number;
  json: boolean;
  prompt: string;
}

const MAX_ENTRIES = 12;
const ring: PromptLogEntry[] = [];

/** True when LLM_LOG_PROMPTS is 1, true, or yes (case-insensitive). */
export function isPromptLoggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.LLM_LOG_PROMPTS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function recordPrompt(entry: Omit<PromptLogEntry, 'at'>): void {
  if (!isPromptLoggingEnabled()) return;
  ring.unshift({ ...entry, at: new Date().toISOString() });
  if (ring.length > MAX_ENTRIES) ring.length = MAX_ENTRIES;
}

export function getRecentPrompts(): PromptLogEntry[] {
  return [...ring];
}

/** Railway and some hosts truncate single log lines — emit in chunks. */
export function logPromptToConsole(entry: PromptLogEntry): void {
  const header =
    `[llm:prompt] ${entry.kind} provider=${entry.provider} chars=${entry.chars}` +
    (entry.json ? ' json=true' : '') +
    ` at=${entry.at}`;
  console.log(header);
  const chunkSize = 8000;
  const text = entry.prompt;
  if (text.length <= chunkSize) {
    console.log(`[llm:prompt:body]\n${text}`);
    return;
  }
  const parts = Math.ceil(text.length / chunkSize);
  for (let i = 0; i < parts; i++) {
    console.log(`[llm:prompt:body] part ${i + 1}/${parts}\n${text.slice(i * chunkSize, (i + 1) * chunkSize)}`);
  }
  console.log('[llm:prompt:end]');
}
