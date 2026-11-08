import { Pipe, type PipeTransform } from '@angular/core';
import { Marked } from 'marked';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Markdown from AI replies. Model output is untrusted, so raw HTML in it is
 * shown as text, links open in a new tab, and Angular sanitizes the result
 * again when it is bound with [innerHTML] (scripts, event handlers, and
 * javascript: URLs are removed).
 */
const md = new Marked({ gfm: true, breaks: true, async: false }).use({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    // Images from model output could send data to another site when loaded: show a link instead.
    image: ({ href, text }) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text || 'image')}</a>`,
    link({ href, tokens }) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

export function renderMarkdown(text: string): string {
  return md.parse(text) as string;
}

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    return renderMarkdown(text);
  }
}
