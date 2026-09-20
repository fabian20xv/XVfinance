import type { ReactNode } from 'react';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export type DataColumn<T> = {
  key: keyof T | string;
  header: string;
  numeric?: boolean;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  empty?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  empty = 'Nothing selected',
}: DataTableProps<T>) {
  if (!rows.length) {
    return <DashedEmptySlot label={empty} />;
  }
  return (
    <div style={{ overflow: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className={col.numeric ? 'numeric' : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((col) => (
                <td key={String(col.key)} className={col.numeric ? 'numeric tabular' : undefined}>
                  {col.render ? col.render(row) : String(row[col.key as string] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
