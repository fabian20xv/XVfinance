/** Agent turn / tool / provider timeouts (ms). */

export const DEFAULT_TIMEOUTS = Object.freeze({
  turnMs: 45_000,
  toolMs: 15_000,
  providerMs: 20_000,
  maxToolRounds: 8,
});

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
export async function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) {
    return promise;
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'timeout';
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {number} [ms]
 */
export function abortAfter(ms) {
  const controller = new AbortController();
  if (!ms || ms <= 0) {
    return controller;
  }
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
    },
    { once: true }
  );
  return controller;
}
