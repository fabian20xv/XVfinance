/**
 * Composer talks to POST /v1/ai/chat (E11 agent turns). Slash/JSON still maps to
 * the same E2 allowlist — the runtime short-circuits those without a second list.
 *
 * Accepted input:
 *   /tool_name
 *   /tool_name { "arg": "value" }
 *   { "name": "tool_name", "args": { } }
 *   free text → model turn (OpenAI-primary; degrades if OPENAI_API_KEY is unset)
 */

/**
 * @param {string} text
 * @returns {{ type: 'empty' } | { type: 'tool', name: string, args: Record<string, unknown> } | { type: 'invalid_json', message: string } | { type: 'message', text: string }}
 */
export function parseComposerInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return { type: 'empty' };
  }

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj.name === 'string' && obj.name.trim()) {
        return {
          type: 'tool',
          name: obj.name.trim(),
          args: obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args) ? obj.args : {},
        };
      }
      return { type: 'invalid_json', message: 'JSON must include a tool name.' };
    } catch {
      return { type: 'invalid_json', message: 'Composer JSON is invalid.' };
    }
  }

  if (trimmed.startsWith('/')) {
    const match = trimmed.match(/^\/([A-Za-z0-9_]+)(?:\s+([\s\S]+))?$/);
    if (!match) {
      return { type: 'invalid_json', message: 'Tool name after / is required.' };
    }
    const name = match[1];
    const rest = (match[2] ?? '').trim();
    if (!rest) {
      return { type: 'tool', name, args: {} };
    }
    try {
      const args = JSON.parse(rest);
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { type: 'invalid_json', message: 'Tool args must be a JSON object.' };
      }
      return { type: 'tool', name, args };
    } catch {
      return { type: 'invalid_json', message: 'Tool args must be JSON.' };
    }
  }

  return { type: 'message', text: trimmed };
}
