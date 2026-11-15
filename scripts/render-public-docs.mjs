#!/usr/bin/env node
/**
 * Static, deterministic exports of the two canonical Markdown documents.
 * Node.js 20+; marked 18.0.11 is the tested parser (no browser dependency).
 *   node scripts/render-public-docs.mjs [path/to/marked.esm.js] [--check]
 * Omit the path to use an installed "marked" package. --check never writes.
 * Edit the canonical Markdown, then rerun; do not hand-edit generated HTML.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'https://github.com/textgoeshere/nisar-hackathon';
const sourceBase = repository + '/blob/main/';
const sourceOrigin = 'https://canonical.invalid';
const localPages = new Map([
  ['docs/create-event.md', 'create.html'], ['CREDITS.md', 'credits.html'],
  ['site/create.html', 'create.html'], ['site/credits.html', 'credits.html'],
  ['site/about.html', 'about.html'], ['site/index.html', './'],
  ['site/', './'], ['site', './'],
]);
const documents = [
  {
    source: 'docs/create-event.md', output: 'site/create.html', label: 'Create',
    description: 'The developer-operated guide to researching, building and reviewing a NISAR event page.',
    note: '<strong>Before you start:</strong> this is a developer-operated workflow, not an all-in-one creation UI. '
      + 'Reading this guide needs no sign-in. Running it requires source repository access, granted by the owner, '
      + 'plus the setup and data access below. Repository-file links may require that access.',
  },
  {
    source: 'CREDITS.md', output: 'site/credits.html', label: 'Credits',
    description: 'Data, media, software, services and AI attribution for Either side of the line.',
    note: 'Data, media, software, services and AI attribution, reproduced from the canonical credits. '
      + 'Repository-file links may require source access; the owner controls availability.',
  },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// Resolve relative links from the Markdown's location, NOT from site/*.html.
// URL parsing plus escaped attributes prevents entity/whitespace scheme tricks.
// No embedded remote media: Markdown images become ordinary source links.
export function rewriteLink(href, source) {
  const value = String(href ?? '').trim();
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url;
  try { url = new URL(value, sourceOrigin + '/' + source); }
  catch { return null; }
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.origin !== sourceOrigin) return url.href;
  if (value.startsWith('#')) return url.hash || '#';
  let path;
  try { path = decodeURIComponent(url.pathname.slice(1)); }
  catch { return null; }
  return (localPages.get(path) ?? sourceBase + url.pathname.slice(1)) + url.search + url.hash;
}

export function renderMarkdown(markdown, source, { Marked, Renderer }) {
  const headings = [];
  const ids = new Map();
  let section = 'Document';
  const parser = new Marked({
    gfm: true,
    async: false,
    renderer: {
      // Never accept author-supplied HTML. Hide source-only comments; show tags as text.
      html({ text }) {
        return /^\s*<!--[\s\S]*?-->\s*$/.test(text) ? '' : escapeHtml(text);
      },
      heading({ depth, tokens, text }) {
        const label = text.replace(/[\x60*_]/g, '');
        const base = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
        const count = ids.get(base) ?? 0;
        ids.set(base, count + 1);
        const id = base + (count ? '-' + count : '');
        if (depth === 2) headings.push({ id, label });
        if (depth >= 2) section = label;
        return '<h' + depth + ' id="' + escapeHtml(id) + '">'
          + this.parser.parseInline(tokens) + '</h' + depth + '>\n';
      },
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        const target = rewriteLink(href, source);
        return target === null ? label : '<a href="' + escapeHtml(target) + '"'
          + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + label + '</a>';
      },
      image({ href, text }) {
        const label = escapeHtml(text || 'Image source');
        const target = rewriteLink(href, source);
        return target === null ? label : '<a href="' + escapeHtml(target) + '">' + label + '</a>';
      },
      code(token) {
        return Renderer.prototype.code.call(this, token)
          .replace('<pre>', '<pre tabindex="0" aria-label="Code sample">');
      },
      table(token) {
        const table = Renderer.prototype.table.call(this, token).replace(/<th(?=[ >])/g, '<th scope="col"');
        return '<div class="table-scroll" role="region" tabindex="0" aria-label="'
          + escapeHtml(section + ' table; scroll horizontally if needed') + '">' + table + '</div>\n';
      },
    },
  });
  const tokens = parser.lexer(markdown);
  const first = tokens.shift();
  assert(first?.type === 'heading' && first.depth === 1, source + ' must start with one level-one title');
  assert(!tokens.some((token) => token.type === 'heading' && token.depth === 1), source + ' has extra level-one titles');
  const title = parser.parser([first]);
  const body = parser.parser(tokens);
  return { title, body, headings };
}

function page(document, rendered) {
  const { source, output, label, description, note } = document;
  const current = output.split('/').pop();
  const navigation = [['./', 'Explore'], ['about.html', 'About'], ['create.html', 'Create'], ['credits.html', 'Credits']]
    .map(([href, name]) => '<a href="' + href + '"' + (href === current ? ' aria-current="page"' : '') + '>' + name + '</a>').join('\n        ');
  const contents = rendered.headings.map(({ id, label }) => '<li><a href="#' + escapeHtml(id) + '">'
    + escapeHtml(label) + '</a></li>').join('\n            ');
  return [
    '<!doctype html>',
    '<!-- Generated from ' + source + ' by scripts/render-public-docs.mjs. Do not edit this HTML. -->',
    '<html lang="en">', '<head>', '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="referrer" content="no-referrer">',
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; base-uri \'none\'; form-action \'none\'">',
    '  <meta name="description" content="' + escapeHtml(description) + '">',
    '  <title>' + label + ' · Either side of the line</title>',
    '  <link rel="stylesheet" href="about-docs.css">', '</head>', '<body>',
    '  <a class="skip-link" href="#content">Skip to content</a>',
    '  <header class="site-header">',
    '    <a class="brand" href="./">Either side of the line <span>NISAR / NASA–ISRO</span></a>',
    '    <nav aria-label="Main navigation">' + navigation + '</nav>', '  </header>',
    '  <main id="content" tabindex="-1">',
    '    <header class="doc-heading">',
    '      <p class="eyebrow">' + (label === 'Create' ? 'Create / operator guide' : 'Sources / acknowledgements') + '</p>',
    '      ' + rendered.title.trim(),
    '      <aside class="doc-note" aria-label="' + (label === 'Create' ? 'Before you start' : 'About these credits') + '">' + note + '</aside>',
    '    </header>', '    <div class="doc-layout">',
    '      <nav class="contents" aria-label="On this page">',
    '        <details open><summary>On this page</summary><ul>' + contents + '</ul></details>',
    '      </nav>', '      <article class="prose" aria-label="' + label + ' document">',
    rendered.body.trimEnd(), '      </article>', '    </div>', '  </main>',
    '  <footer class="site-footer">',
    '    <p>Static copy of <a href="' + sourceBase + source + '">' + source + '</a>. '
      + 'Repository links may require access from the owner. Reading this page does not grant source access.</p>',
    '    <p><a href="./">Explore events</a> · <a href="about.html">About the project</a> · '
      + '<a href="' + (label === 'Create' ? 'credits.html">Credits' : 'create.html">Create guide') + '</a></p>',
    '  </footer>', '</body>', '</html>', '',
  ].join('\n');
}

function selfTest(marked) {
  const source = 'docs/create-event.md';
  for (const [input, expected] of [
    ['../requirements.txt', sourceBase + 'requirements.txt'],
    ['3-ingest.md#methods', sourceBase + 'docs/3-ingest.md#methods'],
    ['../CREDITS.md#software', 'credits.html#software'],
    ['../site/about.html', 'about.html'], ['../site/index.html', './'], ['../site/', './'],
    ['#section', '#section'], ['https://example.org/?a=1&b=2', 'https://example.org/?a=1&b=2'],
    ['javascript:alert(1)', null], ['data:text/html,test', null], ['file:///etc/passwd', null],
    ['https://user:password@example.org/', null], ['java\nscript:alert(1)', null],
  ]) assert.equal(rewriteLink(input, source), expected, input);
  assert.equal(rewriteLink('docs/create-event.md#steps', 'CREDITS.md'), 'create.html#steps');
  assert.equal(rewriteLink('research/validation-sources.md', 'CREDITS.md'), sourceBase + 'research/validation-sources.md');
  const fence = String.fromCharCode(96).repeat(3);
  const fixture = ['# Test', '', '## Repeat', '', '## Repeat', '', '<script>alert(1)</script>', '',
    '<img src=x onerror=alert(1)>', '', '<!-- hidden comment -->', '',
    '[bad](javascript:alert(1)) [entity](javascript&#58;alert(1))', '',
    '[credits](../CREDITS.md) [source](3-ingest.md)', '',
    '![image](https://example.org/image.png)', '', fence + 'sh', 'echo "<script>"', fence, '',
    '| First | Second |', '| --- | --- |', '| a | b |'].join('\n');
  const rendered = renderMarkdown(fixture, source, marked);
  assert.deepEqual(rendered.headings.map(({ id }) => id), ['repeat', 'repeat-1']);
  assert.doesNotMatch(rendered.body, /<(script|img|iframe|object|form)\b|href="(?:javascript|data|file):/i);
  assert.match(rendered.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(rendered.body, /hidden comment/);
  assert.match(rendered.body, /href="credits\.html"/);
  assert.match(rendered.body, /<pre tabindex="0"[^>]*><code class="language-sh">/);
  assert.match(rendered.body, /class="table-scroll"[^>]*tabindex="0"/);
  assert.match(rendered.body, /<th scope="col">/);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/render-public-docs.mjs [path/to/marked.esm.js] [--check]\n'
      + 'Uses installed marked when no path is supplied. --check validates without writing.');
    return;
  }
  const paths = args.filter((arg) => !arg.startsWith('--'));
  assert(paths.length <= 1 && args.every((arg) => !arg.startsWith('--') || arg === '--check'), 'Unexpected arguments; use --help');
  let marked;
  try {
    marked = await import(paths[0] ? pathToFileURL(resolve(paths[0])).href : 'marked');
  } catch (cause) {
    throw new Error('Cannot load marked. Pass the path to its marked.esm.js, or use an installed marked package.', { cause });
  }
  selfTest(marked);
  const outputs = await Promise.all(documents.map(async (document) => ({
    path: document.output,
    html: page(document, renderMarkdown(await readFile(resolve(root, document.source), 'utf8'), document.source, marked)),
  })));
  // Prepare and validate both documents before touching either output.
  for (const { path, html } of outputs) {
    assert.doesNotMatch(html, /<(script|iframe|object|embed|form|img)\b/i, path + ': unexpected active/embedded content');
    assert.equal((html.match(/<h1\b/g) || []).length, 1, path + ': expected exactly one h1');
  }
  for (const { path, html } of outputs) {
    let existing;
    try { existing = await readFile(resolve(root, path), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (args.includes('--check')) assert.equal(existing, html, path + ' is stale or missing; rerun the renderer');
    else if (existing !== html) await writeFile(resolve(root, path), html);
    console.log((args.includes('--check') ? 'Checked ' : existing === html ? 'Unchanged ' : 'Rendered ') + path);
  }
  console.log('Link, HTML-safety, code, heading and table self-checks passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
