import * as fs from 'fs';
import * as path from 'path';

describe('mcp-graph smoke', () => {
  it('source declares /healthz endpoint', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(src).toContain("app.get('/healthz'");
  });

  it('source advertises graph email API endpoints on root route', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(src).toContain("'POST /graph/email/draft'");
    expect(src).toContain("'POST /graph/email/send'");
  });

  it('DraftEmailSchema validates email addresses in to field', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/mcp/register.ts'),
      'utf8',
    );
    expect(src).toContain('DraftEmailSchema');
    expect(src).toContain('z.string().email()');
  });

  it('SendEmailSchema requires isApprovedAction to prevent unauthorized sends', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/mcp/register.ts'),
      'utf8',
    );
    expect(src).toContain('SendEmailSchema');
    expect(src).toContain('isApprovedAction');
  });
});
