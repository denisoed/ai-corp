import { describe, it, expect } from 'vitest';
import { markdownToTelegramHtml } from '../../../src/server/lib/telegram-formatter';

describe('markdownToTelegramHtml', () => {
  it('converts bold markdown to HTML b tags', () => {
    const result = markdownToTelegramHtml('**hello world**');
    expect(result).toBe('<b>hello world</b>');
  });

  it('converts italic markdown to HTML i tags', () => {
    const result = markdownToTelegramHtml('*emphasis*');
    expect(result).toBe('<i>emphasis</i>');
  });

  it('converts inline code to HTML code tags', () => {
    const result = markdownToTelegramHtml('use `npm install`');
    expect(result).toBe('use <code>npm install</code>');
  });

  it('converts code blocks to HTML pre tags', () => {
    const result = markdownToTelegramHtml('```\ncode here\n```');
    expect(result).toBe('<pre>code here</pre>');
  });

  it('converts links to HTML a tags', () => {
    const result = markdownToTelegramHtml('[click here](https://example.com)');
    expect(result).toBe('<a href="https://example.com">click here</a>');
  });

  it('removes heading markers (Telegram does not support them)', () => {
    const result = markdownToTelegramHtml('# Title');
    // Telegram converts headings to bold
    expect(result).toContain('<b>Title</b>');
  });

  it('removes images', () => {
    const result = markdownToTelegramHtml('![alt](url)');
    expect(result).not.toContain('img');
  });

  it('handles bullet lists', () => {
    const result = markdownToTelegramHtml('- item 1\n- item 2');
    expect(result).toContain('- item 1');
    expect(result).toContain('- item 2');
  });

  it('trims excessive newlines', () => {
    const result = markdownToTelegramHtml('line1\n\n\n\n\nline2');
    expect(result).not.toMatch(/\n{4,}/);
  });
});
