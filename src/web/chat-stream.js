/**
 * Parse SSE blocks from POST /v1/ai/chat (event: + data: JSON).
 */

/**
 * @param {string} block
 * @returns {{ type: string, data: unknown }}
 */
export function parseSseBlock(block) {
  let type = 'message';
  const dataLines = [];
  for (const line of String(block ?? '').split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim() || type;
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  const raw = dataLines.join('\n');
  if (!raw) {
    return { type, data: {} };
  }
  try {
    return { type, data: JSON.parse(raw) };
  } catch {
    return { type, data: raw };
  }
}

/**
 * @param {string} chunk
 * @param {(event: { type: string, data: unknown }) => void} onEvent
 * @returns {string} leftover buffer
 */
export function consumeSseBuffer(chunk, onEvent, prior = '') {
  let buffer = `${prior}${chunk}`;
  let idx = buffer.indexOf('\n\n');
  while (idx !== -1) {
    const block = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    if (block.trim()) {
      onEvent(parseSseBlock(block));
    }
    idx = buffer.indexOf('\n\n');
  }
  return buffer;
}

/**
 * @param {Response} response
 * @param {(event: { type: string, data: unknown }) => void} onEvent
 */
export async function readChatSse(response, onEvent) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    consumeSseBuffer(`${text}\n\n`, onEvent);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let leftover = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    leftover = consumeSseBuffer(decoder.decode(value, { stream: true }), onEvent, leftover);
  }
  leftover = consumeSseBuffer(decoder.decode(), onEvent, leftover);
  if (leftover.trim()) {
    onEvent(parseSseBlock(leftover));
  }
}
