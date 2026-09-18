/**
 * Service-role isolation helpers.
 *
 * This module never reads the service-role secret. It only:
 * - recognizes env keys that must not reach chat tools / clients
 * - tags admin clients so the chat tool runner can reject them
 */

export const SERVICE_ROLE_ENV_KEYS = Object.freeze([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
]);

const serviceRoleClients = new WeakSet();

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isServiceRoleEnvKey(name) {
  if (name == null || name === '') {
    return false;
  }

  const key = String(name);
  if (SERVICE_ROLE_ENV_KEYS.includes(key)) {
    return true;
  }

  // Catch PUBLIC_ / NEXT_PUBLIC_ / VITE_ leaks and renamed variants.
  const normalized = key.replace(/^(NEXT_)?PUBLIC_|^VITE_|^GATSBY_|^REACT_APP_/, '');
  if (SERVICE_ROLE_ENV_KEYS.includes(normalized)) {
    return true;
  }

  return /service[_-]?role/i.test(key) && /(key|secret)/i.test(key);
}

/**
 * Return a frozen env object with every service-role secret removed.
 * Chat tools must receive this — never raw `process.env`.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} sourceEnv
 */
export function createChatToolEnv(sourceEnv = process.env) {
  const isolated = Object.create(null);

  for (const [key, value] of Object.entries(sourceEnv ?? {})) {
    if (isServiceRoleEnvKey(key)) {
      continue;
    }
    isolated[key] = value;
  }

  return Object.freeze(isolated);
}

/**
 * @param {Record<string, unknown>} env
 */
export function assertNoServiceRoleEnv(env) {
  for (const key of Object.keys(env ?? {})) {
    if (isServiceRoleEnvKey(key)) {
      throw new Error(
        `Service-role secret "${key}" is not allowed in chat tool or client environment.`
      );
    }
  }
}

/**
 * @template T
 * @param {T} client
 * @returns {T}
 */
export function markServiceRoleClient(client) {
  if (client && (typeof client === 'object' || typeof client === 'function')) {
    serviceRoleClients.add(client);
  }
  return client;
}

/**
 * @param {unknown} client
 * @returns {boolean}
 */
export function isServiceRoleClient(client) {
  return Boolean(client && typeof client === 'object' && serviceRoleClients.has(client));
}

/**
 * Chat tool runner must call this before handing a client to a tool.
 * @param {unknown} client
 */
export function assertNotServiceRoleClient(client) {
  if (isServiceRoleClient(client)) {
    throw new Error(
      'Service-role Supabase client cannot be used in chat tool context. Use a user-JWT client so RLS applies.'
    );
  }
}
