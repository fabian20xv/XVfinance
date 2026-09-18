import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createLinter() {
  return new ESLint({ cwd: root });
}

describe('CA-0.2 lint rule bans service-role in chat/client', () => {
  it('flags reading the service-role env var from a chat tool', async () => {
    const eslint = createLinter();
    const [result] = await eslint.lintText(
      `export function leak() {\n  return process.env.SUPABASE_SERVICE_ROLE_KEY;\n}\n`,
      { filePath: join(root, 'src/chat/evil-tool.js') }
    );
    assert.ok(result.errorCount > 0, 'expected lint errors');
    const messages = result.messages.map((m) => m.message).join('\n');
    assert.match(messages, /Service-role|forbidden|Do not read service-role/i);
  });

  it('flags importing the server service-role module from chat', async () => {
    const eslint = createLinter();
    const [result] = await eslint.lintText(
      `import { createServiceRoleClient } from '../server/service-role.js';\nexport const admin = createServiceRoleClient;\n`,
      { filePath: join(root, 'src/chat/evil-import.js') }
    );
    assert.ok(result.errorCount > 0, 'expected lint errors');
    const messages = result.messages.map((m) => m.message).join('\n');
    assert.match(messages, /service-role|server/i);
  });

  it('flags the same leaks in client bundles', async () => {
    const eslint = createLinter();
    const [result] = await eslint.lintText(
      `export const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];\n`,
      { filePath: join(root, 'src/client/bundle.js') }
    );
    assert.ok(result.errorCount > 0, 'expected lint errors');
  });

  it('allows existing chat, client, and http source', async () => {
    const eslint = createLinter();
    const results = await eslint.lintFiles([
      'src/chat/**/*.js',
      'src/client/**/*.js',
      'src/http/**/*.js',
    ]);
    const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
    assert.equal(
      errorCount,
      0,
      results
        .flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`))
        .join('\n')
    );
  });
});
