/**
 * CA-6 CSV holdings import: parse, store under firm prefix, open holdings_import proposal.
 */
import { matchHoldingsRows, parseHoldingsCsv } from '../csv/holdings-csv.js';
import { hasUnmatchedSymbols } from '../proposals/unmatched.js';
import { insertProposal } from './proposal-tools.js';
import { badArgs, notFound } from './tool-error.js';
import { unwrap } from './query.js';

export const FIRM_IMPORTS_BUCKET = 'firm-imports';

function safeFilename(name) {
  const base = String(name || 'holdings.csv')
    .split(/[/\\]/)
    .pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  return cleaned || 'holdings.csv';
}

/**
 * Storage path is `{firm_id}/{user_id}/{filename}` on THIS project only.
 */
export function firmImportObjectPath(firmId, userId, filename) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${firmId}/${userId}/${stamp}-${safeFilename(filename)}`;
}

async function loadPortfolio(client, session, portfolioId) {
  const { data, error } = await client
    .from('portfolios')
    .select('id, firm_id, name')
    .eq('id', portfolioId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load portfolio');
  if (!data) {
    throw notFound('Portfolio not found');
  }
  return data;
}

async function uploadCsv(client, path, csv) {
  const storage = client.storage;
  if (!storage?.from) {
    throw new Error('User-JWT client is missing Storage (firm-imports bucket).');
  }
  const { data, error } = await storage.from(FIRM_IMPORTS_BUCKET).upload(path, csv, {
    contentType: 'text/csv',
    upsert: true,
  });
  if (error) {
    throw new Error(`CSV upload failed: ${error.message}`);
  }
  return data?.path ?? path;
}

export const IMPORT_TOOLS = {
  import_holdings_csv: {
    description:
      'Parse a holdings CSV, store it under the firm prefix, and open a holdings_import proposal. Unmatched symbols block confirm.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['portfolio_id', 'csv'],
      properties: {
        portfolio_id: { type: 'string' },
        csv: { type: 'string' },
        filename: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      await loadPortfolio(client, session, args.portfolio_id);
      let parsed;
      try {
        parsed = parseHoldingsCsv(args.csv);
      } catch (err) {
        throw badArgs(err.message);
      }

      const instruments =
        unwrap(
          await client
            .from('instruments')
            .select('id, symbol')
            .eq('firm_id', session.firmId),
          'Failed to list instruments'
        ) ?? [];
      const { matched, unmatched } = matchHoldingsRows(parsed.rows, instruments);
      if (matched.length === 0 && unmatched.length === 0) {
        throw badArgs('CSV produced no holdings rows');
      }

      const storagePath = firmImportObjectPath(
        session.firmId,
        session.userId,
        args.filename || 'holdings.csv'
      );
      const uploadedPath = await uploadCsv(client, storagePath, args.csv);

      const payload = {
        portfolio_id: args.portfolio_id,
        bucket: FIRM_IMPORTS_BUCKET,
        storage_path: uploadedPath,
        filename: safeFilename(args.filename || 'holdings.csv'),
        matched,
        unmatched,
        changes: matched,
        confirm_blocked: hasUnmatchedSymbols({ unmatched }),
      };

      return insertProposal(client, session, {
        kind: 'holdings_import',
        payload,
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
};
