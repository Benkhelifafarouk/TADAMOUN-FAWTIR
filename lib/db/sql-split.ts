/**
 * Splits a SQL script into individual statements.
 *
 * Needed because the embedded PostgreSQL driver uses the extended query
 * protocol (one statement per call) while still giving us per-migration
 * transactions. A naive split on ";" would break on function bodies, string
 * literals and comments, so this scanner tracks:
 *   - single-quoted strings (with '' escaping)
 *   - double-quoted identifiers (with "" escaping)
 *   - dollar-quoted bodies ($tag$ ... $tag$)
 *   - line comments (-- ...) and nested block comments
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  const push = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0 && trimmed !== ';') statements.push(trimmed);
    current = '';
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // line comment: skipped, but keep a space so tokens never merge
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      current += ' ';
      i = end === -1 ? sql.length : end;
      continue;
    }

    // block comment (supports nesting)
    if (ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth += 1;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      current += ' ';
      i = j;
      continue;
    }

    // single-quoted string
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          j += 1;
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // double-quoted identifier
    if (ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (sql[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // dollar-quoted body: $tag$ ... $tag$
    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ';') {
      push();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  push();
  return statements;
}
