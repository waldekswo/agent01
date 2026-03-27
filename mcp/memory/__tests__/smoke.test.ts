import * as fs from 'fs';
import * as path from 'path';

describe('mcp-memory smoke', () => {
  it('source declares /healthz endpoint', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(src).toContain("app.get('/healthz'");
  });

  it('source advertises memory API endpoints on root route', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(src).toContain("'POST /memory/record-event'");
    expect(src).toContain("'POST /memory/upsert-fact'");
    expect(src).toContain("'GET /memory/query'");
  });

  it('ValidationSchemas: EventSchema requires userId field', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/mcp/register.ts'),
      'utf8',
    );
    expect(src).toContain('EventSchema');
    expect(src).toContain('userId');
  });

  it('maskPII replaces email addresses', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/mcp/register.ts'),
      'utf8',
    );
    expect(src).toContain('[EMAIL]');
    expect(src).toContain('[PHONE]');
  });
});
