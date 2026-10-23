// One call to Claude Haiku 5.5 with the cached system prompt. Plain fetch, no SDK.

import { MODEL, SYSTEM_PROMPT, type Usage } from './prompts';

export interface ClaudeReply {
  text: string;
  usage: Usage;
}

export async function askClaude(apiKey: string, context: unknown): Promise<{ reply: ClaudeReply | null; error?: string }> {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Usage };
        const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
        return { reply: { text, usage: data.usage ?? {} } };
      }
      const retry = res.status === 429 || res.status >= 500;
      if (!retry || attempt === 1) {
        const err = (await res.json().catch(() => ({}))) as { error?: { type?: string } };
        return { reply: null, error: `HTTP ${res.status} ${err.error?.type ?? ''}`.trim() };
      }
    } catch (e) {
      if (attempt === 1) return { reply: null, error: e instanceof Error ? e.name : 'network error' };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { reply: null, error: 'gave up' };
}
