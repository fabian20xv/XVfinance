#!/usr/bin/env node
/**
 * CI / pre-start assertion: this repo may only talk to one Supabase project.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALLOWED_SUPABASE_PROJECT_REF,
  ALLOWED_SUPABASE_URL,
  assertAllowedSupabaseUrl,
} from '../src/config/supabase-lock.js';

const root = resolve(import.meta.dirname, '..');
let failed = false;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

const constantsUrl = ALLOWED_SUPABASE_URL;
const constantsRef = ALLOWED_SUPABASE_PROJECT_REF;
if (constantsRef !== 'krcwpupbdizzjyydzaqp') {
  fail(`src/config/supabase-lock.js ref is "${constantsRef}", expected krcwpupbdizzjyydzaqp`);
} else {
  ok(`source lock ref = ${constantsRef}`);
}

if (constantsUrl !== 'https://krcwpupbdizzjyydzaqp.supabase.co') {
  fail(`src/config/supabase-lock.js URL is "${constantsUrl}"`);
} else {
  ok(`source lock URL = ${constantsUrl}`);
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

if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(envExample)) {
  fail('.env.example appears to contain a real JWT — placeholders only');
}

const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
if (!readme.includes('https://krcwpupbdizzjyydzaqp.supabase.co')) {
  fail('README.md must state the allowed Supabase URL');
} else {
  ok('README.md states allowed Supabase URL');
}
if (!readme.includes('krcwpupbdizzjyydzaqp')) {
  fail('README.md must state the allowed project ref');
} else {
  ok('README.md states allowed project ref');
}

const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260918213000_e1_schema_rls.sql'),
  'utf8'
);
if (!migration.includes('krcwpupbdizzjyydzaqp')) {
  fail('E1 migration must name the locked project ref');
} else {
  ok('E1 migration is pinned to krcwpupbdizzjyydzaqp');
}

if (process.env.SUPABASE_URL) {
  try {
    assertAllowedSupabaseUrl(process.env.SUPABASE_URL);
    ok(`process.env.SUPABASE_URL matches lock (${process.env.SUPABASE_URL})`);
  } catch (err) {
    fail(`process.env.SUPABASE_URL rejected: ${err.message}`);
  }
} else {
  ok('process.env.SUPABASE_URL unset in this check (example + source lock still verified)');
}

if (failed) {
  console.error(
    '\nXVfinance refuses any Supabase project other than krcwpupbdizzjyydzaqp.'
  );
  process.exit(1);
}

console.log('\nSupabase project lock asserted.');
