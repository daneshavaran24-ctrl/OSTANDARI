import { describe, expect, it } from 'vitest';
import { parsePayload } from '@/components/Rpc_Handler';

describe('تجزیه‌ی payload اعلان RPC', () => {
  it('payload معتبر unblock_user را می‌پذیرد', () => {
    expect(parsePayload(JSON.stringify({ type: 'unblock_user', username: 'maxman123' }))).toEqual({
      type: 'unblock_user',
      username: 'maxman123',
    });
  });

  it('payload معتبر send_email را می‌پذیرد', () => {
    const raw = JSON.stringify({ type: 'send_email', email_address: 'a@b.com' });
    expect(parsePayload(raw)).toEqual({ type: 'send_email', email_address: 'a@b.com' });
  });

  it('نوع ناشناخته رد می‌شود', () => {
    expect(parsePayload(JSON.stringify({ type: 'delete_everything' }))).toBeNull();
  });

  it('JSON خراب به‌جای استثنا، null می‌دهد', () => {
    // این از شبکه می‌آید؛ یک استثنای مدیریت‌نشده اینجا کل هندلر را می‌کشد.
    expect(parsePayload('{بدون ساختار')).toBeNull();
    expect(parsePayload('')).toBeNull();
  });

  it('مقدارهای غیرشیء رد می‌شوند', () => {
    for (const raw of ['null', '"رشته"', '42', '[]', 'true']) {
      expect(parsePayload(raw)).toBeNull();
    }
  });

  it('شیء بدون type رد می‌شود', () => {
    expect(parsePayload(JSON.stringify({ username: 'maxman123' }))).toBeNull();
  });
});
