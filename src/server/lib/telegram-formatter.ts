import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';

export const TELEGRAM_FORMATTING_RULES = `# TELEGRAM FORMATTING
Use **bold**, _italic_, \`code\`, \`\`\`blocks\`\`\`, [links](url), bullet (-) and numbered (1.) lists. FORBIDDEN: headers (#), tables (|--|), images, HTML tags. Use bullet lists for structured data: "- **Name**: Alice, **Role**: Developer". When asked to list agents/tasks: enumerate each individually, never just a count. When asked to message/notify/contact another agent: call send_message or ask_agent — do NOT just acknowledge. Keep responses concise.`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fixIndentedLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    if (/^\s{2,}\S/.test(line) && !/^\s*[-•*+\d]/.test(line)) {
      result.push('- ' + line.trim());
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

function renderTokensAsInline(renderer: Renderer, tokens?: Tokens.Generic[] | null): string {
  if (!tokens || tokens.length === 0) {
    return '';
  }

  if (tokens.length === 1 && tokens[0].type === 'paragraph' && 'tokens' in tokens[0]) {
    return renderTokensAsInline(renderer, tokens[0].tokens as Tokens.Generic[] | null);
  }

  return renderer.parser.parseInline(tokens);
}

function renderTokensAsBlock(renderer: Renderer, tokens?: Tokens.Generic[] | null): string {
  if (!tokens || tokens.length === 0) {
    return '';
  }

  return renderer.parser.parse(tokens);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function renderTableCell(renderer: Renderer, tokens?: Tokens.Generic[] | null): string {
  const content = stripHtml(renderTokensAsInline(renderer, tokens)).replace(/\s+/g, ' ').trim();
  return content || ' ';
}

class TelegramRenderer extends Renderer {
  paragraph({ tokens }: Tokens.Paragraph): string {
    return renderTokensAsInline(this, tokens) + '\n\n';
  }
  strong({ tokens }: Tokens.Strong): string {
    return `<b>${renderTokensAsInline(this, tokens)}</b>`;
  }
  em({ tokens }: Tokens.Em): string {
    return `<i>${renderTokensAsInline(this, tokens)}</i>`;
  }
  codespan({ text }: Tokens.Codespan): string {
    return `<code>${escapeHtml(text)}</code>`;
  }
  code({ text }: Tokens.Code): string {
    return `<pre>${escapeHtml(text)}</pre>\n\n`;
  }
  link({ href, tokens }: Tokens.Link): string {
    return `<a href="${href}">${renderTokensAsInline(this, tokens)}</a>`;
  }
  list({ items, ordered, start }: Tokens.List): string {
    const startNum = typeof start === 'number' ? start : 1;
    return items.map((item, i) => {
      const content = renderTokensAsBlock(this, item.tokens) || item.text;
      const prefix = ordered ? `${startNum + i}.` : '-';
      return `${prefix} ${content}\n`;
    }).join('') + '\n';
  }
  listitem({ text, tokens }: Tokens.ListItem): string {
    const content = renderTokensAsBlock(this, tokens) || text;
    return `- ${content}\n`;
  }
  heading({ tokens }: Tokens.Heading): string {
    return `<b>${renderTokensAsInline(this, tokens)}</b>\n\n`;
  }
  blockquote({ tokens }: Tokens.Blockquote): string {
    return renderTokensAsBlock(this, tokens);
  }
  del({ tokens }: Tokens.Del): string {
    return renderTokensAsInline(this, tokens);
  }
  image(): string { return ''; }
  hr(): string { return ''; }
  table({ header, rows }: Tokens.Table): string {
    const headerLabels = header.map((cell) => stripHtml(renderTableCell(this, cell.tokens)));
    const lines: string[] = [];
    for (const row of rows) {
      const cells = row.map((cell) => stripHtml(renderTableCell(this, cell.tokens)));
      const parts = cells.map((val, i) => {
        const label = headerLabels[i] || `col${i + 1}`;
        return `**${label}**: ${val}`;
      });
      lines.push(`- ${parts.join(', ')}`);
    }
    return lines.join('\n') + '\n\n';
  }
  tablerow({ text }: Tokens.TableRow): string {
    return `${text}\n`;
  }
  tablecell({ tokens }: Tokens.TableCell): string {
    return renderTableCell(this, tokens);
  }
  html(): string { return ''; }
  br(): string { return '\n'; }
  checkbox(): string { return ''; }
  space(): string { return ''; }
}

marked.setOptions({ renderer: new TelegramRenderer() });

export function markdownToTelegramHtml(text: string): string {
  const fixed = fixIndentedLists(text);
  const html = marked.parse(fixed, { async: false }) as string;
  return html.replace(/\n{3,}/g, '\n\n').trim();
}
