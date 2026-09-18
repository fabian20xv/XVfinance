/**
 * Runtime environment helpers for health/smoke (no secrets).
 */

export function resolveAppEnv(env = process.env) {
  const app = String(env.APP_ENV || '').trim();
  if (app) {
    return app;
  }
  const vercel = String(env.VERCEL_ENV || '').trim();
  if (vercel) {
    return vercel;
  }
  return 'development';
}

export function resolveCommitSha(env = process.env) {
  const vercelSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
  if (vercelSha) {
    return vercelSha;
  }
  const gitCommit = String(env.GIT_COMMIT || '').trim();
  if (gitCommit) {
    return gitCommit;
  }
  return 'unknown';
}

export function isProductionEnv(env = process.env) {
  return (
    String(env.APP_ENV || '').trim().toLowerCase() === 'production' ||
    String(env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
  );
}
