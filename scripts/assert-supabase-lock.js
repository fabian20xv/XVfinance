#!/usr/bin/env node
/**
 * CI / pre-start assertion: this repo may only talk to the allowlisted Supabase projects.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALLOWED_SUPABASE_PROJECT_REFS,
  ALLOWED_SUPABASE_URLS,
  DEVELOP_SUPABASE_PROJECT_REF,
  PARENT_SUPABASE_PROJECT_REF,
  assertAllowedSupabaseUrl,
} from '../src/config/supabase-lock.js';

const root = resolve(import.meta.dirname, '..');
const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const PARENT_REF = 'krcwpupbdizzjyydzaqp';
const DEVELOP_REF = 'bkwhqfkosxnoffpsjcug';
const EXPECTED_REFS = [PARENT_REF, DEVELOP_REF];

let failed = false;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

if (
  ALLOWED_SUPABASE_PROJECT_REFS.length !== 2 ||
  ALLOWED_SUPABASE_PROJECT_REFS[0] !== PARENT_REF ||
  ALLOWED_SUPABASE_PROJECT_REFS[1] !== DEVELOP_REF
) {
  fail(
    `src/config/supabase-lock.js refs are ${JSON.stringify(ALLOWED_SUPABASE_PROJECT_REFS)}, ` +
      `expected exactly ${JSON.stringify(EXPECTED_REFS)}`
  );
} else {
  ok(`source lock refs = ${ALLOWED_SUPABASE_PROJECT_REFS.join(', ')}`);
}

if (PARENT_SUPABASE_PROJECT_REF !== PARENT_REF) {
  fail(`parent ref is "${PARENT_SUPABASE_PROJECT_REF}", expected ${PARENT_REF}`);
}
if (DEVELOP_SUPABASE_PROJECT_REF !== DEVELOP_REF) {
  fail(`develop ref is "${DEVELOP_SUPABASE_PROJECT_REF}", expected ${DEVELOP_REF}`);
}

if (
  ALLOWED_SUPABASE_URLS.length !== 2 ||
  ALLOWED_SUPABASE_URLS[0] !== PARENT_URL ||
  ALLOWED_SUPABASE_URLS[1] !== DEVELOP_URL
) {
  fail(`src/config/supabase-lock.js URLs are ${JSON.stringify(ALLOWED_SUPABASE_URLS)}`);
} else {
  ok(`source lock URLs = ${ALLOWED_SUPABASE_URLS.join(', ')}`);
}

const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');
const envUrlMatch = envExample.match(/^SUPABASE_URL=(.+)$/m);
if (!envUrlMatch) {
  fail('.env.example is missing SUPABASE_URL');
} else {
  try {
    assertAllowedSupabaseUrl(envUrlMatch[1].trim());
    ok(`.env.example SUPABASE_URL = ${envUrlMatch[1].trim()}`);
  } catch (err) {
    fail(`.env.example SUPABASE_URL rejected: ${err.message}`);
  }
}

if (!envExample.includes(PARENT_URL) || !envExample.includes(PARENT_REF)) {
  fail('.env.example must document the parent/prod Supabase URL and ref');
} else {
  ok('.env.example documents parent/prod URL + ref');
}

if (!envExample.includes(DEVELOP_URL) || !envExample.includes(DEVELOP_REF)) {
  fail('.env.example must document the develop/staging Supabase URL and ref');
} else {
  ok('.env.example documents develop/staging URL + ref');
}

if (!/staging-only|staging only/i.test(envExample)) {
  fail('.env.example must note that the develop ref is staging-only');
} else {
  ok('.env.example notes develop ref is staging-only');
}

if (!/^APP_ENV=/m.test(envExample)) {
  fail('.env.example must document APP_ENV');
} else {
  ok('.env.example documents APP_ENV');
}

if (!/^SMOKE_SECRET=/m.test(envExample)) {
  fail('.env.example must document SMOKE_SECRET');
} else {
  ok('.env.example documents SMOKE_SECRET');
}

if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(envExample)) {
  fail('.env.example appears to contain a real JWT — placeholders only');
}

const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
if (!readme.includes(PARENT_URL) || !readme.includes(PARENT_REF)) {
  fail('README.md must state the parent/prod Supabase URL and ref');
} else {
  ok('README.md states parent/prod URL + ref');
}
if (!readme.includes(DEVELOP_URL) || !readme.includes(DEVELOP_REF)) {
  fail('README.md must state the develop/staging Supabase URL and ref');
} else {
  ok('README.md states develop/staging URL + ref');
}

const lockSource = readFileSync(resolve(root, 'src/config/supabase-lock.js'), 'utf8');
const scannedFiles = [
  ['.env.example', envExample],
  ['README.md', readme],
  ['src/config/supabase-lock.js', lockSource],
];
const allowedRefSet = new Set(EXPECTED_REFS);
for (const [label, text] of scannedFiles) {
  const refs = [...text.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/g)].map((m) => m[1]);
  const unexpected = [...new Set(refs)].filter((ref) => !allowedRefSet.has(ref));
  if (unexpected.length > 0) {
    fail(`${label} mentions non-allowlisted Supabase ref(s): ${unexpected.join(', ')}`);
  }
}

if (process.env.SUPABASE_URL) {
  try {
    const locked = assertAllowedSupabaseUrl(process.env.SUPABASE_URL);
    ok(`process.env.SUPABASE_URL matches lock (${locked.ref})`);
  } catch (err) {
    fail(`process.env.SUPABASE_URL rejected: ${err.message}`);
  }
} else {
  ok('process.env.SUPABASE_URL unset in this check (example + source lock still verified)');
}

if (failed) {
  console.error(
    `\nXVfinance refuses any Supabase project other than ${PARENT_REF} (parent/prod) or ${DEVELOP_REF} (develop/staging).`
  );
  process.exit(1);
}

console.log('\nSupabase project lock asserted.');
