import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.pipe';

describe('renderMarkdown', () => {
  it('renders the markdown AI replies use', () => {
    const html = renderMarkdown('**Tips**\n\n1. Track spending\n2. Cut subscriptions\n\n| Tip | Saves |\n|---|---|\n| Groceries | ₹2,000 |');
    expect(html).toContain('<strong>Tips</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>₹2,000</td>');
  });

  it('shows raw HTML from the model as text', () => {
    const html = renderMarkdown('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });

  it('opens links in a new tab', () => {
    expect(renderMarkdown('[RBI](https://rbi.org.in)')).toContain('<a href="https://rbi.org.in" target="_blank" rel="noopener noreferrer">RBI</a>');
  });
});
