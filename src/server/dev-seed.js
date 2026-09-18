/**
 * Server-only seed/smoke against the locked Supabase project.
 */
import { boot } from '../config/startup.js';
import { SMOKE_FIRM_ID } from '../db/smoke-ids.js';
import { createServiceRoleClient } from './service-role.js';

function failIfClientRole(data) {
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export async function runDevSeed(env = process.env) {
  boot(env);
  const supabase = createServiceRoleClient(env);
  const { data, error } = await supabase.rpc('run_dev_seed');
  if (error) {
    throw new Error(`run_dev_seed failed: ${error.message}`);
  }
  failIfClientRole(data);
  if (data?.firm_id !== SMOKE_FIRM_ID) {
    throw new Error(`Unexpected smoke firm_id: ${data?.firm_id}`);
  }
  if (data?.project_ref && data.project_ref !== 'krcwpupbdizzjyydzaqp') {
    throw new Error(`Refused seed project_ref ${data.project_ref}`);
  }
  return data;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export async function runE1Smoke(env = process.env) {
  boot(env);
  const supabase = createServiceRoleClient(env);
  const { data, error } = await supabase.rpc('smoke_e1');
  if (error) {
    throw new Error(`smoke_e1 failed: ${error.message}`);
  }
  if (!data?.ok) {
    throw new Error(`E1 smoke failed: ${JSON.stringify(data)}`);
  }
  if (data.project_ref !== 'krcwpupbdizzjyydzaqp') {
    throw new Error(`Refused smoke project_ref ${data.project_ref}`);
  }
  return data;
}
