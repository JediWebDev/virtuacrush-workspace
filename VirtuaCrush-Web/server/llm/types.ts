// Provider-agnostic LLM interface. Every model call in the app goes through this,
// so swapping Inworld <-> OpenAI/OpenRouter/self-hosted is config, not code.
export interface LlmProvider {
  name: string;
  /** One-shot completion for a fully-built prompt. */
  complete(prompt: string): Promise<string>;
  /** Streams text chunks for a prompt (may yield the whole reply at once). */
  stream(prompt: string): AsyncGenerator<string>;
}
