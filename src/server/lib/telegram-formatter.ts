import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';

export const TELEGRAM_FORMATTING_RULES = `# TELEGRAM FORMATTING RULES — Must follow strictly

You are responding via Telegram messenger. Use standard Markdown. The system will convert it automatically.

Supported formatting:
- **bold** or __bold__
- _italic_ or *italic*
- \`inline code\`
- \`\`\` code blocks \`\`\`
- [links](URL)
- - bullet lists
- 1. numbered lists

NOT supported (will be removed):
- Headers (#, ##, etc.)
- Tables (|--|)
- Images
- HTML tags/entities
- Strikethrough

Rules:
- Use "- " or "• " for bullet list items. Each item must start at the BEGINNING of a new line.
- NEVER use indentation alone as a list marker — always include the "-" or "1." prefix.
- Keep responses concise (1-3 sentences per paragraph).
- Use short paragraphs, bullet lists, and numbers to organize information.
- When asked to "list" or "show" agents, tasks, crons, or any collection: ALWAYS enumerate each item individually on its own line with relevant details (name, role, status, etc.). NEVER reply with just a count or summary when the user asks for a list.`;

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

class TelegramRenderer extends Renderer {
  paragraph({ tokens }: Tokens.Paragraph): string {
    return this.parser.parseInline(tokens) + '\n\n';
  }
  strong({ tokens }: Tokens.Strong): string {
    return `<b>${this.parser.parseInline(tokens)}</b>`;
  }
  em({ tokens }: Tokens.Em): string {
    return `<i>${this.parser.parseInline(tokens)}</i>`;
  }
  codespan({ text }: Tokens.Codespan): string {
    return `<code>${escapeHtml(text)}</code>`;
  }
  code({ text }: Tokens.Code): string {
    return `<pre>${escapeHtml(text)}</pre>\n\n`;
  }
  link({ href, tokens }: Tokens.Link): string {
    return `<a href="${href}">${this.parser.parseInline(tokens)}</a>`;
  }
  list({ items, ordered, start }: Tokens.List): string {
    const startNum = typeof start === 'number' ? start : 1;
    return items.map((item, i) => {
      const content = item.tokens ? this.parser.parseInline(item.tokens) : item.text;
      const prefix = ordered ? `${startNum + i}.` : '-';
      return `${prefix} ${content}\n`;
    }).join('') + '\n';
  }
  listitem({ text, tokens }: Tokens.ListItem): string {
    const content = tokens ? this.parser.parseInline(tokens) : text;
    return `- ${content}\n`;
  }
  heading({ tokens }: Tokens.Heading): string {
    return `<b>${this.parser.parseInline(tokens)}</b>\n\n`;
  }
  blockquote({ tokens }: Tokens.Blockquote): string {
    return this.parser.parse(tokens);
  }
  del({ tokens }: Tokens.Del): string {
    return this.parser.parseInline(tokens);
  }
  image(): string { return ''; }
  hr(): string { return ''; }
  table(): string { return ''; }
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
