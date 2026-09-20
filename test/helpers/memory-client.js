import { randomUUID } from 'node:crypto';

function matches(row, filters) {
  return filters.every((fn) => fn(row));
}

function project(row, columns) {
  if (!columns || columns === '*') {
    return { ...row };
  }
  const out = {};
  for (const col of columns.split(',').map((part) => part.trim())) {
    if (col === '*') {
      return { ...row };
    }
    out[col] = row[col];
  }
  return out;
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.op = 'select';
    this.payload = null;
    this.columns = '*';
    this.orderKey = null;
    this.orderAsc = true;
    this.offsetN = 0;
    this.limitN = null;
    this.prefer = null;
  }

  select(columns) {
    this.columns = columns ?? '*';
    return this;
  }

  insert(row) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }

  update(row) {
    this.op = 'update';
    this.payload = row;
    return this;
  }

  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }

  in(key, values) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }

  ilike(key, pattern) {
    const needle = String(pattern).replace(/%/g, '').toLowerCase();
    this.filters.push((row) => String(row[key] ?? '').toLowerCase().includes(needle));
    return this;
  }

  order(key, { ascending = true } = {}) {
    this.orderKey = key;
    this.orderAsc = ascending;
    return this;
  }

  range(from, to) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  maybeSingle() {
    this.prefer = 'maybe';
    return this.execute();
  }

  single() {
    this.prefer = 'one';
    return this.execute();
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  async execute() {
    if (!this.db[this.table]) {
      this.db[this.table] = [];
    }
    let rows;
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = list.map((row) => {
        const full = { id: row.id ?? randomUUID(), ...row };
        this.db[this.table].push(full);
        return full;
      });
      rows = inserted;
    } else if (this.op === 'update') {
      const updated = [];
      this.db[this.table] = this.db[this.table].map((row) => {
        if (!matches(row, this.filters)) {
          return row;
        }
        const next = { ...row, ...this.payload };
        updated.push(next);
        return next;
      });
      rows = updated;
    } else {
      rows = this.db[this.table].filter((row) => matches(row, this.filters));
      if (this.orderKey) {
        const key = this.orderKey;
        const dir = this.orderAsc ? 1 : -1;
        rows.sort((a, b) => {
          if (a[key] < b[key]) {
            return -1 * dir;
          }
          if (a[key] > b[key]) {
            return 1 * dir;
          }
          return 0;
        });
      }
      if (this.limitN != null) {
        rows = rows.slice(this.offsetN, this.offsetN + this.limitN);
      } else if (this.offsetN) {
        rows = rows.slice(this.offsetN);
      }
    }

    const projected = rows.map((row) => project(row, this.columns));
    if (this.prefer === 'maybe') {
      return { data: projected[0] ?? null, error: null };
    }
    if (this.prefer === 'one') {
      if (projected.length !== 1) {
        return {
          data: null,
          error: { message: 'JSON object requested, multiple (or no) rows returned' },
        };
      }
      return { data: projected[0], error: null };
    }
    return { data: projected, error: null };
  }
}

export function createMemoryClient(seed = {}) {
  const db = {};
  for (const [table, rows] of Object.entries(seed)) {
    db[table] = rows.map((row) => ({ ...row }));
  }
  return {
    db,
    from(table) {
      return new Query(db, table);
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, body, options = {}) {
            if (!db._storage) {
              db._storage = [];
            }
            const existing = db._storage.findIndex(
              (row) => row.bucket === bucket && row.path === path
            );
            const row = {
              bucket,
              path,
              body,
              options,
              uploaded_at: new Date().toISOString(),
            };
            if (existing >= 0) {
              if (!options.upsert) {
                return { data: null, error: { message: 'The resource already exists' } };
              }
              db._storage[existing] = row;
            } else {
              db._storage.push(row);
            }
            return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
          },
        };
      },
    },
  };
}
