import { describe, expect, it } from 'vitest';
import { generateTotp, generateTotpSecret, totpUri, verifyTotp } from '@/lib/security/totp';
import { splitSqlStatements } from '@/lib/db/sql-split';

describe('TOTP (administrator second factor)', () => {
  it('generates a base32 secret and verifies the current code', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    const code = generateTotp(secret, 1_700_000_000_000);
    expect(verifyTotp(secret, code, 1_700_000_000_000)).toBe(true);
  });

  it('accepts one step of clock drift and rejects older codes', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret, 1_700_000_000_000);
    expect(verifyTotp(secret, code, 1_700_000_030_000)).toBe(true);
    expect(verifyTotp(secret, code, 1_700_000_090_000)).toBe(false);
  });

  it('rejects malformed or wrong codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '000000', 1_700_000_000_000)).toBe(false);
  });

  it('builds an otpauth URI', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'admin@example.dz');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
  });
});

describe('SQL statement splitter', () => {
  it('splits plain statements', () => {
    expect(splitSqlStatements('select 1; select 2;')).toEqual(['select 1', 'select 2']);
  });

  it('keeps dollar-quoted function bodies intact', () => {
    const sql = `create function f() returns void as $$
begin
  perform 1;
end;
$$ language plpgsql;
select 1;`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('perform 1;');
    expect(statements[1]).toBe('select 1');
  });

  it('ignores semicolons inside strings and comments', () => {
    const sql = `insert into t values ('a;b'); -- comment; here
select 2;`;
    expect(splitSqlStatements(sql)).toEqual(["insert into t values ('a;b')", 'select 2']);
  });

  it('handles escaped quotes', () => {
    expect(splitSqlStatements("select 'it''s; fine';")).toEqual(["select 'it''s; fine'"]);
  });

  it('handles nested block comments', () => {
    const sql = 'select 1 /* outer /* inner; */ still; */; select 2;';
    expect(splitSqlStatements(sql)).toEqual(['select 1', 'select 2']);
  });
});
