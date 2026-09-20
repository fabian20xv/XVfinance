/**
 * Allowlist of the only two Supabase projects this repo may talk to.
 * Never point this repo at any other project.
 *
 * 1. Parent/prod:  krcwpupbdizzjyydzaqp
 * 2. Develop/staging (Tess): bkwhqfkosxnoffpsjcug — staging only, never production
 */

function freezeProject(ref, role) {
  const host = `${ref}.supabase.co`;
  return Object.freeze({
    ref,
    host,
    url: `https://${host}`,
    jwtIssuer: `https://${host}/auth/v1`,
    role,
  });
}

export const PARENT_SUPABASE_PROJECT_REF = 'krcwpupbdizzjyydzaqp';
export const DEVELOP_SUPABASE_PROJECT_REF = 'bkwhqfkosxnoffpsjcug';

export const PARENT_SUPABASE_PROJECT = freezeProject(PARENT_SUPABASE_PROJECT_REF, 'parent');
export const DEVELOP_SUPABASE_PROJECT = freezeProject(DEVELOP_SUPABASE_PROJECT_REF, 'develop');

export const ALLOWED_SUPABASE_PROJECTS = Object.freeze([
  PARENT_SUPABASE_PROJECT,
  DEVELOP_SUPABASE_PROJECT,
]);

export const ALLOWED_SUPABASE_PROJECT_REFS = Object.freeze(
  ALLOWED_SUPABASE_PROJECTS.map((project) => project.ref)
);

export const ALLOWED_SUPABASE_URLS = Object.freeze(
  ALLOWED_SUPABASE_PROJECTS.map((project) => project.url)
);

export const ALLOWED_JWT_ISSUERS = Object.freeze(
  ALLOWED_SUPABASE_PROJECTS.map((project) => project.jwtIssuer)
);

/** Parent/prod pin — default when a single URL is needed (e.g. public config fallback). */
export const ALLOWED_SUPABASE_PROJECT_REF = PARENT_SUPABASE_PROJECT_REF;
export const ALLOWED_SUPABASE_HOST = PARENT_SUPABASE_PROJECT.host;
export const ALLOWED_SUPABASE_URL = PARENT_SUPABASE_PROJECT.url;
export const ALLOWED_JWT_ISSUER = PARENT_SUPABASE_PROJECT.jwtIssuer;

const PROJECTS_BY_REF = new Map(ALLOWED_SUPABASE_PROJECTS.map((project) => [project.ref, project]));

export function describeAllowedSupabaseProjects() {
  return ALLOWED_SUPABASE_PROJECTS.map(
    (project) => `${project.url} (ref ${project.ref}, ${project.role})`
  ).join(' or ');
}

function fail(message) {
  const error = new Error(message);
  error.name = 'SupabaseProjectLockError';
  throw error;
}

/**
 * Extract the Supabase project ref from a URL host (`{ref}.supabase.co`).
 * @param {string} urlString
 * @returns {string}
 */
export function parseSupabaseProjectRef(urlString) {
  if (urlString == null || String(urlString).trim() === '') {
    fail(`SUPABASE_URL is required. Only ${describeAllowedSupabaseProjects()} are allowed.`);
  }

  const trimmed = String(urlString).trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(`SUPABASE_URL is not a valid URL: ${trimmed}`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`SUPABASE_URL must use https, got "${parsed.protocol}" (${trimmed}).`);
  }

  const host = parsed.hostname.toLowerCase();
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) {
    fail(
      `SUPABASE_URL host must be {project-ref}.supabase.co, got "${parsed.hostname}". ` +
        `Only ${describeAllowedSupabaseProjects()} are allowed.`
    );
  }

  return match[1];
}

/**
 * Fail loud unless SUPABASE_URL is exactly the parent/prod or develop/staging project.
 * @param {string} urlString
 * @returns {{ ref: string, url: string, host: string, role: 'parent' | 'develop', jwtIssuer: string }}
 */
export function assertAllowedSupabaseUrl(urlString) {
  const ref = parseSupabaseProjectRef(urlString);
  const parsed = new URL(String(urlString).trim());
  const project = PROJECTS_BY_REF.get(ref);

  if (!project) {
    fail(
      `Refused Supabase project ref "${ref}". ` +
        `Only ${describeAllowedSupabaseProjects()} are allowed.`
    );
  }

  if (parsed.hostname.toLowerCase() !== project.host) {
    fail(
      `Refused Supabase host "${parsed.hostname}". ` +
        `Only ${describeAllowedSupabaseProjects()} are allowed.`
    );
  }

  if (parsed.origin.toLowerCase() !== project.url) {
    fail(
      `Refused Supabase origin "${parsed.origin}". ` +
        `Only ${describeAllowedSupabaseProjects()} are allowed.`
    );
  }

  return {
    ref: project.ref,
    host: project.host,
    url: project.url,
    role: project.role,
    jwtIssuer: project.jwtIssuer,
  };
}

/**
 * Fail loud unless the JWT issuer belongs to an allowlisted project.
 * @param {string} issuer
 * @returns {{ ref: string, url: string, host: string, role: 'parent' | 'develop', jwtIssuer: string }}
 */
export function assertAllowedJwtIssuer(issuer) {
  if (issuer == null || String(issuer).trim() === '') {
    fail(`JWT issuer is required. Only ${describeAllowedSupabaseProjects()} are allowed.`);
  }

  const trimmed = String(issuer).trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(`JWT issuer is not a valid URL: ${trimmed}`);
  }

  const project = assertAllowedSupabaseUrl(parsed.origin);
  if (parsed.pathname.replace(/\/+$/, '') !== '/auth/v1') {
    fail(
      `Refused JWT issuer path "${parsed.pathname}". ` +
        `Only ${describeAllowedSupabaseProjects()} /auth/v1 issuers are allowed.`
    );
  }

  return project;
}
