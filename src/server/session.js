/**
 * Attach firm_id + manager|analyst from firm_members using a user-JWT client (RLS).
 */
import { createUserScopedClient } from '../chat/user-client.js';
import { forbidden, unauthorized } from './errors.js';

export const FIRM_ROLES = Object.freeze(['manager', 'analyst']);

/**
 * @param {object} options
 * @param {string} options.userId
 * @param {string} options.userJwt
 * @param {string} [options.preferredFirmId]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(args: { userId: string, userJwt: string }) => Promise<Array<{ firm_id: string, role: string, user_id?: string }>>} [options.lookupMembers]
 */
export async function attachFirmContext({
  userId,
  userJwt,
  preferredFirmId,
  env = process.env,
  lookupMembers,
}) {
  if (!userId) {
    throw unauthorized('user_id is required to attach firm context.');
  }

  const rows = lookupMembers
    ? await lookupMembers({ userId, userJwt })
    : await defaultLookupMembers({ userJwt, env });

  const mine = (rows ?? []).filter((row) => !row.user_id || row.user_id === userId);
  if (mine.length === 0) {
    throw forbidden('No firm membership for this user.', 'no_firm_membership');
  }

  let membership = mine[0];
  if (preferredFirmId) {
    membership = mine.find((row) => row.firm_id === preferredFirmId);
    if (!membership) {
      throw forbidden('Not a member of the requested firm.', 'wrong_firm');
    }
  } else if (mine.length > 1) {
    throw forbidden('Multiple firm memberships; pass X-Firm-Id.', 'firm_ambiguous');
  }

  if (!FIRM_ROLES.includes(membership.role)) {
    throw forbidden(`Unsupported firm role "${membership.role}".`, 'invalid_role');
  }

  return Object.freeze({
    userId,
    firmId: membership.firm_id,
    role: membership.role,
  });
}

async function defaultLookupMembers({ userJwt, env }) {
  const client = createUserScopedClient(userJwt, env);
  const { data, error } = await client.from('firm_members').select('firm_id, role, user_id');
  if (error) {
    throw forbidden(`Failed to load firm membership: ${error.message}`, 'membership_lookup_failed');
  }
  return data ?? [];
}
