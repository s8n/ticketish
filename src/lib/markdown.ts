// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Enough Markdown to render the credits page, and no more.
 *
 * The credits exist once, in `docs/credits.md`, because a list of who made
 * what is exactly the thing that rots when it is kept twice. The page imports
 * that file and renders it here, so the repo and the site cannot disagree.
 *
 * A parser rather than a dependency, because the subset is small and known:
 * headings, bullets, paragraphs, bold, inline code and links, which is all
 * that document is written in. `tests/markdown.test.ts` holds the source to
 * that subset, so a construct the renderer cannot read fails the tests instead
 * of turning up as literal asterisks on the page.
 *
 * The input is a file in this repo rather than anything a reader supplies, but
 * it is escaped before anything else happens all the same: a renderer whose
 * safety depends on where the text came from is one refactor from not being
 * safe at all.
 */

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;'
};

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** Absolute http(s), or somewhere in this site. Anything else stays text. */
const SAFE_HREF = /^(https?:\/\/|\/|#)/;

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BOLD = /\*\*([^*]+)\*\*/g;

/** Inline spans. Code is split out first, so its contents stay literal. */
function inline(text: string): string {
	return escapeHtml(text)
		.split(/(`[^`]+`)/g)
		.map((part) =>
			part.length > 1 && part.startsWith('`') && part.endsWith('`')
				? `<code>${part.slice(1, -1)}</code>`
				: part
						.replace(LINK, (whole, label, href) =>
							SAFE_HREF.test(href) ? `<a href="${href}">${label}</a>` : whole
						)
						.replace(BOLD, '<strong>$1</strong>')
		)
		.join('');
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

export function renderMarkdown(source: string): string {
	const out: string[] = [];
	let paragraph: string[] = [];
	let items: string[][] = [];

	const flushParagraph = () => {
		if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (items.length) {
			out.push(`<ul>${items.map((lines) => `<li>${inline(lines.join(' '))}</li>`).join('')}</ul>`);
		}
		items = [];
	};
	const flush = () => {
		flushParagraph();
		flushList();
	};

	for (const raw of source.split('\n')) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			flush();
			const level = heading[1].length;
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			continue;
		}
		const bullet = BULLET.exec(line);
		if (bullet) {
			flushParagraph();
			items.push([bullet[1]]);
			continue;
		}
		// a wrapped line carries on whatever it is under: the bullet above it,
		// or the paragraph it started
		if (items.length) items[items.length - 1].push(line);
		else paragraph.push(line);
	}

	flush();
	return out.join('\n');
}
