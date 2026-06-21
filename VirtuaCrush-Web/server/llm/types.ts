// Provider-agnostic LLM interface. Every model call in the app goes through this,
// so swapping Inworld <-> OpenAI/OpenRouter/self-hosted is config, not code.
export interface CompleteOpts {
  /** Constrain the model to emit a single valid JSON object (vLLM/OpenAI json mode). */
  json?: boolean;
  /** Override LLM_MODEL for this call (e.g. referee uses LLM_REFEREE_MODEL). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Cache-friendly split: stable system prefix + variable user content.
   * Providers (DeepSeek, OpenRouter) discount/cache identical leading tokens.
   */
  system?: string;
  user?: string;
}

export interface StreamResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number };
}

export interface LlmProvider {
  name: string;
  /** One-shot completion for a fully-built prompt. */
  complete(prompt: string, opts?: CompleteOpts): Promise<string>;
  /** Streams text deltas for a prompt (true SSE when supported). */
  stream(prompt: string, opts?: CompleteOpts): AsyncGenerator<string>;
  /** Streams and returns the full text + usage (for metering after stream). */
  streamCollect?(prompt: string, opts?: CompleteOpts): Promise<StreamResult>;
}
