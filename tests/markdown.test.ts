// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The credits page renders `docs/credits.md`, so the renderer only has to read
 * the subset that document is written in. The last block here is what keeps
 * that true: it holds the document to the subset, so a construct nobody
 * implemented fails here rather than showing up as asterisks on the page.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../src/lib/markdown.ts';

const credits = readFileSync(fileURLToPath(new URL('../docs/credits.md', import.meta.url)), 'utf8');

describe('the markdown subset', () => {
	it('renders headings, paragraphs and bullets', () => {
		expect(renderMarkdown('# Credits')).toBe('<h1>Credits</h1>');
		expect(renderMarkdown('## Keys and tables')).toBe('<h2>Keys and tables</h2>');
		expect(renderMarkdown('Two lines\nof one paragraph')).toBe('<p>Two lines of one paragraph</p>');
		expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
	});

	it('carries a wrapped bullet on rather than starting a paragraph', () => {
		expect(renderMarkdown('- a bullet that\n  wrapped')).toBe('<ul><li>a bullet that wrapped</li></ul>');
	});

	it('reads the inline spans', () => {
		expect(renderMarkdown('**bold** and `code`')).toBe(
			'<p><strong>bold</strong> and <code>code</code></p>'
		);
		expect(renderMarkdown('[a link](https://example.org)')).toBe(
			'<p><a href="https://example.org">a link</a></p>'
		);
	});

	it('leaves the contents of a code span alone', () => {
		// a path with an underscore or an asterisk in it is not emphasis
		expect(renderMarkdown('`a_b **c**`')).toBe('<p><code>a_b **c**</code></p>');
	});

	it('escapes the document rather than trusting where it came from', () => {
		expect(renderMarkdown('<script>alert(1)</script>')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
		);
		expect(renderMarkdown('[x](javascript:alert(1))')).toContain('[x](javascript:alert(1))');
		expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a');
	});
});

describe('the credits document', () => {
	it('renders the attributions that have conditions on them', () => {
		const html = renderMarkdown(credits);
		expect(html).toContain('KCD+eTicketinfo');
		expect(html).toContain('Open Database License (ODbL)');
		expect(html).toContain('<a href="https://github.com/trainline-eu/stations">');
		expect(html).toContain('Union Internationale');
	});

	it('comes out as HTML with no markdown left in it', () => {
		const html = renderMarkdown(credits);
		expect(html).not.toContain('**');
		expect(html).not.toContain('](');
		expect(html.split('\n').some((line) => line.startsWith('#'))).toBe(false);
	});

	it('stays inside the subset the renderer reads', () => {
		const unsupported = [
			[/^\s+[-*]\s/, 'a nested list'],
			[/^\s*\d+\.\s/, 'a numbered list'],
			[/^\s*```/, 'a code fence'],
			[/^\s*>/, 'a block quote'],
			[/^\s*\|/, 'a table'],
			[/!\[/, 'an image'],
			[/^\s*(===+|---+)\s*$/, 'a setext heading or a rule']
		] as const;

		credits.split('\n').forEach((line, i) => {
			for (const [pattern, what] of unsupported) {
				expect(pattern.test(line), `docs/credits.md:${i + 1} uses ${what}`).toBe(false);
			}
		});
	});
});
