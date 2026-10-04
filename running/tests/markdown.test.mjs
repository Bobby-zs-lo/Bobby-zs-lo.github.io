import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml } from '../js/markdown.js';
import { html, raw, toString } from '../js/dom.js';

test('paragraphs, line breaks, bold, italic, code', () => {
  assert.equal(renderMarkdown('Hello **big** *small* `x`'), '<p>Hello <strong>big</strong> <em>small</em> <code>x</code></p>');
  assert.equal(renderMarkdown('one\ntwo\n\nthree'), '<p>one<br>two</p>\n<p>three</p>');
  assert.equal(renderMarkdown('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(renderMarkdown('4×20 s *strides*'), '<p>4×20 s <em>strides</em></p>');
});

test('headings render one level down (h3–h5)', () => {
  assert.equal(renderMarkdown('# A'), '<h3>A</h3>');
  assert.equal(renderMarkdown('## B'), '<h4>B</h4>');
  assert.equal(renderMarkdown('### C **d**'), '<h5>C <strong>d</strong></h5>');
  assert.equal(renderMarkdown('#nospace'), '<p>#nospace</p>');
});

test('lists: bullets, numbers, switching, continuation', () => {
  assert.equal(renderMarkdown('- a\n- **b**'), '<ul><li>a</li><li><strong>b</strong></li></ul>');
  assert.equal(renderMarkdown('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
  assert.equal(renderMarkdown('- a\n1. b'), '<ul><li>a</li></ul>\n<ol><li>b</li></ol>');
  assert.equal(renderMarkdown('- a\n  continued'), '<ul><li>a continued</li></ul>');
  assert.equal(renderMarkdown('Intro\n- a\nOutro'), '<p>Intro</p>\n<ul><li>a</li></ul>\n<p>Outro</p>');
});

const ALLOWED = /^<\/?(p|br|strong|em|code|ul|ol|li|h3|h4|h5)>$/;
function onlyAllowedTags(out) {
  for (const tag of out.match(/<[^>]*>/g) || []) assert.match(tag, ALLOWED, `unexpected tag ${tag}`);
}

test('XSS: raw HTML is always escaped', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '**<img src=x onerror=alert(1)>**',
    '- <svg onload=alert(1)>',
    '# <iframe src="javascript:alert(1)">',
    '"><script>alert(1)</script>',
    '`<b>code</b>`',
    '*<a href="javascript:alert(1)">x</a>*',
    '<scr<script>ipt>alert(1)</script>',
    '[link](javascript:alert(1))',
    '&lt;script&gt; already escaped',
    '<style>body{display:none}</style>',
    '**a<**b>**',
  ];
  for (const a of attacks) {
    const out = renderMarkdown(a);
    onlyAllowedTags(out);
    // With the emitted tags removed, no raw angle bracket or quote may remain:
    // any "onerror=" left over is inert text inside an element.
    const rest = out.replace(/<\/?(p|br|strong|em|code|ul|ol|li|h3|h4|h5)>/g, '');
    assert.ok(!/[<>"]/.test(rest), `leak in ${out}`);
  }
  assert.equal(renderMarkdown('<b>x</b>'), '<p>&lt;b&gt;x&lt;/b&gt;</p>');
  assert.equal(renderMarkdown('&amp;'), '<p>&amp;amp;</p>');
  assert.equal(renderMarkdown('[link](javascript:alert(1))'), '<p>[link](javascript:alert(1))</p>');
});

test('XSS: quotes are escaped so output is safe in attributes too', () => {
  assert.equal(escapeHtml(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('html`` template escapes interpolations, raw() opts out', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(toString(html`<p title="${evil}">${evil}</p>`),
    '<p title="&lt;img src=x onerror=alert(1)&gt;">&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(toString(html`<ul>${['a', '<b>'].map(x => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.equal(toString(html`${raw('<em>ok</em>')}${null}${false}${0}`), '<em>ok</em>0');
});
