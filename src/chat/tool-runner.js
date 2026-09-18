/**
 * Chat tool runner.
 *
 * Tools execute with a user-JWT client and an env object that has had every
 * service-role secret stripped. The model and tool handlers never receive
 * the service-role key.
 */
import {
  assertNoServiceRoleEnv,
  assertNotServiceRoleClient,
  createChatToolEnv,
} from '../security/service-role-guard.js';
import { createUserScopedClient } from './user-client.js';

/**
 * @typedef {object} ChatToolContext
 * @property {object} client User-JWT Supabase client (RLS)
 * @property {Readonly<Record<string, string | undefined>>} env Isolated env (no service-role)
 * @property {unknown} args
 */

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(jwt: string, env: Record<string, string | undefined>) => object} [options.createUserClient]
 * @param {Record<string, (ctx: ChatToolContext) => unknown>} [options.tools]
 */
export function createChatToolRunner({
  env = process.env,
  createUserClient = createUserScopedClient,
  tools = {},
} = {}) {
  const isolatedEnv = createChatToolEnv(env);
  assertNoServiceRoleEnv(isolatedEnv);

  return Object.freeze({
    env: isolatedEnv,
    async run(toolName, args, { userJwt } = {}) {
      if (!userJwt) {
        throw new Error('Chat tool runner requires a user JWT. Refusing to run without RLS.');
      }

      const client = createUserClient(userJwt, isolatedEnv);
      assertNotServiceRoleClient(client);

      const tool = tools[toolName];
      if (!tool) {
        throw new Error(`Unknown or disallowed chat tool: ${toolName}`);
      }

      return tool({ client, env: isolatedEnv, args });
    },
  });
}
