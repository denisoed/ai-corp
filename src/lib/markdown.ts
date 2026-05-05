import { marked } from 'marked';

export function renderMarkdown(text: string): string {
  if (!text) return '';
  try {
    return marked.parse(text, { async: false, gfm: true, breaks: true }) as string;
  } catch {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export function stripMarkdown(text: string): string {
  if (!text) return '';
  try {
    const parser = new DOMParser();
    const html = marked.parse(text, { async: false, gfm: true }) as string;
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } catch {
    return text;
  }
}
