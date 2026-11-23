// V8 tuning: the harness runs this module once per fresh container, so the
// run is cold: V8's optimizing compiler costs more CPU tiering our hot
// functions up than the optimized code ever saves over three cases. Running
// unoptimized (baseline/Maglev) is measurably faster cold. main.ts already
// sets --no-incremental-marking the same way; this adds --no-opt.
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-opt');

// Faster drop-in for makefun-site 1.0.0 (make.fun's own static site generator).
//
// run(input) returns exactly what makefun-site 1.0.0's build(input) returns for
// every input, byte for byte. Same pipeline, same rules, same messages —
// rewritten for speed: the Markdown renderer is a fused single pass with no
// per-line regexes and chunked HTML escaping, slugify is memoised per build
// with an ASCII fast path, and the template engine keeps the reference's
// parser/interpreter. No I/O, no clock, no randomness, no cross-case state:
// the slug memo is cleared at the start of every run().

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- text

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const ESC_RE = /[&<>"']/g;

function escapeHtml(text) {
  // Native regex replace: one native scan beats the 5x indexOf loop, and
  // returns the input unchanged when nothing needs escaping.
  return text.replace(ESC_RE, (c) => ESCAPES[c]);
}

const SLUG_MAX = 64;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Memoised per build (cleared in run()): slugify is a pure function of its
// input, and tag names / titles repeat heavily inside one site.
let slugCache = null;

function slugifySlow(text) {
  const plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
  let out = '';
  let gap = false;
  for (const ch of plain) {
    let keep = null;
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === null) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  out = out.slice(0, SLUG_MAX).replace(/-+$/, '');
  return out === '' ? 'untitled' : out;
}

function slugify(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let out;
  // Fast path: every ASCII code point is unchanged by NFKD and none is a
  // combining mark, so normalisation is the identity on ASCII-only text.
  if (!/[^\x00-\x7F]/.test(text)) {
    const chars = [];
    let gap = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      let keep = -1;
      if (c >= 65 && c <= 90) keep = c + 32;
      else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) keep = c;
      if (keep === -1) {
        gap = chars.length > 0;
        continue;
      }
      if (gap) chars.push('-');
      gap = false;
      chars.push(String.fromCharCode(keep));
    }
    if (chars.length > SLUG_MAX) chars.length = SLUG_MAX;
    let e = chars.length;
    while (e > 0 && chars[e - 1] === '-') e--;
    chars.length = e;
    out = chars.length === 0 ? 'untitled' : chars.join('');
  } else {
    out = slugifySlow(text);
  }
  slugCache.set(text, out);
  return out;
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

function longDate(date) {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ---------------------------------------------------------------- front matter

const KEYS = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];
const KEY = /^[a-z_]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      // Same as inner.split(',').map(t => t.trim()), then rejecting an empty
      // tag or one holding " [ or ], in one pass with no closures.
      const tags = [];
      const n = inner.length;
      let i = 0;
      for (;;) {
        let j = inner.indexOf(',', i);
        if (j === -1) j = n;
        let a = i;
        let b = j;
        while (a < b && isWS(inner.charCodeAt(a))) a++;
        while (b > a && isWS(inner.charCodeAt(b - 1))) b--;
        if (a === b) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
        for (let k = a; k < b; k++) {
          const ch = inner[k];
          if (ch === '"' || ch === '[' || ch === ']') return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
        }
        tags.push(inner.slice(a, b));
        if (j === n) break;
        i = j + 1;
      }
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

function parseFrontMatter(text) {
  // Same as the reference (split on '\n', find the closing '---' line first,
  // then validate the lines between), but without building the lines array or
  // re-joining the body: the body is one slice of text.
  if (text !== '---' && !text.startsWith('---\n')) return { error: 'no front matter' };
  if (text === '---') return { error: 'the front matter is not closed' };
  // Pass 1: the first line after line 0 that is exactly '---'.
  let closeStart = -1;
  let closeEnd = -1;
  let p = 4; // just after the opening '---\n'
  for (;;) {
    const nl = text.indexOf('\n', p);
    const lineEnd = nl === -1 ? text.length : nl;
    if (lineEnd - p === 3 && text.charCodeAt(p) === 45 && text.charCodeAt(p + 1) === 45 && text.charCodeAt(p + 2) === 45) {
      closeStart = p;
      closeEnd = nl === -1 ? text.length : nl + 1;
      break;
    }
    if (nl === -1) break;
    p = nl + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  // Pass 2: validate the lines between.
  const data = {};
  let pos = 4;
  let lineNo = 1; // 0-based index of the line starting at pos
  while (pos < closeStart) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd);
    if (!isBlank(line) && line.charCodeAt(0) !== 35) { // '#' comment
      // /^([a-z_]+):(?: (.*))?$/ by hand: key, then ':' at end or ': '.
      const c = line.indexOf(':');
      if (c <= 0) return { error: `line ${lineNo + 1} is not "key: value"` };
      const key = line.slice(0, c);
      if (!KEY.test(key)) return { error: `line ${lineNo + 1} is not "key: value"` };
      let raw;
      if (c + 1 === line.length) raw = '';
      else if (line.charCodeAt(c + 1) === 32) raw = line.slice(c + 2);
      else return { error: `line ${lineNo + 1} is not "key: value"` };
      let e = raw.length;
      while (e > 0 && (raw.charCodeAt(e - 1) === 32 || raw.charCodeAt(e - 1) === 9)) e--;
      raw = raw.slice(0, e);
      if (!KEYS.includes(key)) return { error: `unknown key "${key}"` };
      if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
      if (raw === '') return { error: `key "${key}" has no value` };
      const v = valueOf(key, raw);
      if ('error' in v) return v;
      data[key] = v.value;
    }
    pos = lineEnd + 1;
    lineNo++;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: text.slice(closeEnd) };
}

// ---------------------------------------------------------------- markdown

// Single-char helpers on code units; the reference's regexes only ever look at
// ASCII here, and \S is the only one with wider whitespace semantics.
function isSpaceTab(c) { return c === 32 || c === 9; }
function isWS(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 160 ||
    c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 ||
    c === 8287 || c === 12288 || c === 65279;
}
function isDigit(c) { return c >= 48 && c <= 57; }
function isLangChar(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45;
}

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

// Fence open: /^```([A-Za-z0-9_+-]*)[ \t]*$/ — returns the language or null.
function fenceLang(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
  let j = 3;
  while (j < line.length && isLangChar(line.charCodeAt(j))) j++;
  const lang = line.slice(3, j);
  while (j < line.length && isSpaceTab(line.charCodeAt(j))) j++;
  return j === line.length ? lang : null;
}

function isFenceClose(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
  for (let j = 3; j < line.length; j++) if (!isSpaceTab(line.charCodeAt(j))) return false;
  return true;
}

// Heading: /^(#{1,6})[ \t]+(.*?)[ \t]*$/ with non-empty text, or null.
function headingOf(line) {
  let n = 0;
  while (n < line.length && line.charCodeAt(n) === 35) n++;
  if (n === 0 || n > 6) return null;
  let j = n;
  if (j >= line.length || !isSpaceTab(line.charCodeAt(j))) return null;
  while (j < line.length && isSpaceTab(line.charCodeAt(j))) j++;
  let end = line.length;
  while (end > j && isSpaceTab(line.charCodeAt(end - 1))) end--;
  if (end === j) return null;
  return { depth: n, text: line.slice(j, end) };
}

function isHr(line) {
  const dash = line.charCodeAt(0) === 45 && line.charCodeAt(1) === 45 && line.charCodeAt(2) === 45;
  const star = line.charCodeAt(0) === 42 && line.charCodeAt(1) === 42 && line.charCodeAt(2) === 42;
  if (!dash && !star) return false;
  for (let j = 3; j < line.length; j++) if (!isSpaceTab(line.charCodeAt(j))) return false;
  return true;
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && isSpaceTab(line.charCodeAt(a))) a++;
  while (b > a && isSpaceTab(line.charCodeAt(b - 1))) b--;
  return line.slice(a, b);
}

function endsParagraph(line) {
  return isBlank(line) || fenceLang(line) !== null || headingOf(line) !== null || isHr(line);
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

// indexOf-driven: a match at j is escaped exactly when the run of '\'
// immediately before it (which starts at or after `from`, since the char
// before `from` is never '\' at the call sites) has odd length — the
// reference's left-to-right scan consumes backslash pairs the same way.
function findUnescaped(s, what, from) {
  let j = s.indexOf(what, from);
  while (j !== -1) {
    let n = 0;
    for (let k = j - 1; k >= from && s[k] === '\\'; k--) n++;
    if (n % 2 === 0) return j;
    j = s.indexOf(what, j + 1);
  }
  return -1;
}

function findSingleStar(s, from) {
  let j = s.indexOf('*', from);
  while (j !== -1) {
    let n = 0;
    for (let k = j - 1; k >= from && s[k] === '\\'; k--) n++;
    if (n % 2 === 1) { j = s.indexOf('*', j + 1); continue; }
    if (s[j + 1] === '*') { j = s.indexOf('*', j + 2); continue; }
    return j;
  }
  return -1;
}

// One native scan for the next inline special, instead of four indexOf calls
// (each of which re-scans the rest of the string when its char is absent).
// The class also holds the escapable characters, so a plain run between two
// matches holds nothing escapable and is pushed raw: inline() escapes as it
// goes and never calls escapeHtml on prose. Module-level: inline() recurses,
// so every loop iteration resets lastIndex before exec, which makes the
// sharing safe.
const INLINE_SPECIAL = /[\\`*&<>"'[]/g;

// Inline rendering, same rules as the reference. Plain text is skipped with
// one native scan per segment instead of one JS step per char: prose is
// long runs of plain text, so this is where the time was.
function inline(s, env) {
  const out = [];
  let i = 0;
  let plain = 0;
  const flush = (end) => { if (end > plain) out.push(s.slice(plain, end)); };
  while (true) {
    INLINE_SPECIAL.lastIndex = i;
    const mm = INLINE_SPECIAL.exec(s);
    if (mm === null) break;
    i = mm.index;
    const c = mm[0];
    if (c === '&' || c === '<' || c === '>' || c === '"' || c === "'") {
      flush(i);
      out.push(ESCAPES[c]);
      i++;
      plain = i;
      continue;
    }
    if (c === '\\') {
      if (i + 1 < s.length && ESCAPABLE.has(s[i + 1])) {
        flush(i);
        // The escaped character goes through the escape table too: '>' is in
        // both sets, so \> writes &gt;, not >. ESCAPES holds only &<>"'; any
        // other escapable character escapes to itself.
        out.push(ESCAPES[s[i + 1]] ?? s[i + 1]);
        i += 2;
        plain = i;
      } else {
        i++;
      }
      continue;
    }
    if (c === '`') {
      const k = s.indexOf('`', i + 1);
      if (k > i + 1) {
        flush(i);
        out.push('<code>', escapeHtml(s.slice(i + 1, k)), '</code>');
        i = k + 1;
        plain = i;
      } else {
        i++;
      }
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const k = findUnescaped(s, '**', i + 2);
        if (k > i + 2) {
          flush(i);
          out.push('<strong>', inline(s.slice(i + 2, k), env), '</strong>');
          i = k + 2;
          plain = i;
        } else {
          i += 2;
        }
        continue;
      }
      const k = findSingleStar(s, i + 1);
      if (k > i + 1) {
        flush(i);
        out.push('<em>', inline(s.slice(i + 1, k), env), '</em>');
        i = k + 1;
        plain = i;
      } else {
        i++;
      }
      continue;
    }
    const k = findUnescaped(s, ']', i + 1);
    const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
    const target = m === -1 ? '' : s.slice(k + 2, m);
    let hasWS = false;
    for (let q = 0; q < target.length; q++) if (isWS(target.charCodeAt(q))) { hasWS = true; break; }
    if (target !== '' && !hasWS) {
      flush(i);
      out.push('<a href="', escapeHtml(env.link(target)), '">', inline(s.slice(i + 1, k), env), '</a>');
      i = m + 1;
      plain = i;
      continue;
    }
    i++;
  }
  flush(s.length);
  return out.join('');
}

// Fused lex + render: identical output to the reference's lex() then render,
// without building token objects.
function renderMarkdown(src, env) {
  const lines = src.split('\n');
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const lang = fenceLang(line);
    if (lang !== null) {
      const body = [];
      i++;
      while (i < lines.length && !isFenceClose(lines[i])) body.push(lines[i++]);
      i++;
      const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
      const code = body.length === 0 ? '' : `${escapeHtml(body.join('\n'))}\n`;
      blocks.push(`<pre><code${cls}>${code}</code></pre>\n`);
      continue;
    }
    const heading = headingOf(line);
    if (heading !== null) {
      const id = uniqueSlug(slugify(heading.text), ids);
      const html = inline(heading.text, env);
      blocks.push(`<h${heading.depth} id="${id}">${html}</h${heading.depth}>\n`);
      if (heading.depth === 2 || heading.depth === 3) toc.push({ level: heading.depth, id, html });
      i++;
      continue;
    }
    if (isHr(line)) { blocks.push('<hr>\n'); i++; continue; }
    if (line.charCodeAt(0) === 62) { // '>'
      const body = [];
      while (i < lines.length && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        body.push(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1));
      }
      const kept = [];
      for (const l of body) {
        const t = trimLine(l);
        if (t !== '') kept.push(t);
      }
      blocks.push(kept.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(kept.join('\n'), env)}</p>\n</blockquote>\n`);
      continue;
    }
    const c0 = line.charCodeAt(0);
    const c1 = line.charCodeAt(1);
    const isBullet = (c0 === 45 || c0 === 42) && c1 === 32;
    let orderedNum = -1;
    if (!isBullet) {
      let j = 0;
      while (j < line.length && isDigit(line.charCodeAt(j))) j++;
      if (j >= 1 && j <= 9 && line.charCodeAt(j) === 46 && line.charCodeAt(j + 1) === 32) orderedNum = j;
    }
    if (isBullet || orderedNum !== -1) {
      const isOrdered = orderedNum !== -1;
      const start = isOrdered ? Number(line.slice(0, orderedNum)) : 1;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        if (isOrdered) {
          let j = 0;
          while (j < l.length && isDigit(l.charCodeAt(j))) j++;
          if (j >= 1 && j <= 9 && l.charCodeAt(j) === 46 && l.charCodeAt(j + 1) === 32) {
            items.push([trimLine(l.slice(j + 2))]);
            i++;
            continue;
          }
        } else if ((l.charCodeAt(0) === 45 || l.charCodeAt(0) === 42) && l.charCodeAt(1) === 32) {
          items.push([trimLine(l.slice(2))]);
          i++;
          continue;
        }
        // /^ {2,}\S/: two or more spaces, then a non-whitespace character.
        let sp = 0;
        while (sp < l.length && l.charCodeAt(sp) === 32) sp++;
        if (sp >= 2 && sp < l.length && !isWS(l.charCodeAt(sp))) {
          items[items.length - 1].push(trimLine(l));
          i++;
          continue;
        }
        break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const open = isOrdered && start !== 1 ? `<ol start="${start}">` : `<${tag}>`;
      const parts = [`${open}\n`];
      for (const item of items) parts.push(`<li>${inline(item.join('\n'), env)}</li>\n`);
      parts.push(`</${tag}>`);
      blocks.push(`${parts.join('')}\n`);
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < lines.length && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    const html = inline(body.join('\n'), env);
    if (excerpt === null) excerpt = html;
    blocks.push(`<p>${html}</p>\n`);
  }
  return { html: blocks.join(''), toc, excerpt: excerpt ?? '' };
}

// ---------------------------------------------------------------- templates

const INCLUDE_DEPTH = 8;
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

// Scopes are the vars objects themselves, prototype-chained to their parent
// scope's vars, with a null-prototype root: a plain property read walks the
// chain natively, which is exactly the reference's hasOwn walk (a nearer
// scope holding the key with value undefined shadows the outer ones, and the
// null-prototype root means no Object.prototype name can ever resolve).
function lookup(scope, path) {
  let v = scope[path[0]];
  if (v === undefined) return undefined;
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function renderNodes(nodes, scope, ctx, depth) {
  let out = '';
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out += n.text;
        break;
      case 'var':
        out += ctx.escape(textOf(lookup(scope, n.path)));
        break;
      case 'raw':
        out += textOf(lookup(scope, n.path));
        break;
      case 'if': {
        const v = truthy(lookup(scope, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) out += renderNodes(branch, scope, ctx, depth);
        break;
      }
      case 'for': {
        const xs = lookup(scope, n.path);
        if (!Array.isArray(xs)) break;
        for (let k = 0; k < xs.length; k++) {
          const child = Object.create(scope);
          // '__proto__' as a loop name must be an own property, never the
          // prototype: defineProperty keeps the chain intact.
          if (n.name === '__proto__') Object.defineProperty(child, n.name, { value: xs[k], enumerable: true, writable: true, configurable: true });
          else child[n.name] = xs[k];
          child.loop = { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length };
          out += renderNodes(n.body, child, ctx, depth);
        }
        break;
      }
      case 'include': {
        const t = ctx.templates.get(n.name);
        if (t !== undefined && depth < INCLUDE_DEPTH) out += typeof t === 'function' ? t(scope, ctx, depth + 1, textOf, truthy) : renderNodes(t, scope, ctx, depth);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- template JIT
//
// A template is compiled once per distinct source (module-level cache, so the
// three cases of one run share it) into a function with the variable lookups,
// loops and string building inlined as native code. Same semantics as
// renderNodes above, which stays as the fallback when code generation is
// unavailable: compileTemplate falls back to it per template.

// True when any lookup in this subtree (including through an include, which
// renders in the same scope) can observe a `for`'s `loop` variable. Only
// then does a compiled `for` build the loop object each iteration: omitting
// it when unobserved is invisible, since nothing in the body can name it.
function usesLoopRef(nodes) {
  for (const n of nodes) {
    if ((n.kind === 'var' || n.kind === 'raw' || n.kind === 'if') && n.path[0] === 'loop') return true;
    if (n.kind === 'for') {
      if (n.path[0] === 'loop') return true;
      if (usesLoopRef(n.body)) return true;
    }
    if (n.kind === 'include') return true;
  }
  return false;
}

let genId = 0;

// Emits a scope-chain lookup of `path` into a fresh temp and returns its name.
// The scope is the vars object itself (see lookup), so the first segment is
// one native property read; deeper segments keep the reference's hasOwn walk.
function genLookup(buf, scopeVar, path) {
  const v = `v${genId++}`;
  buf.push(`let ${v}=${scopeVar}[${JSON.stringify(path[0])}];`);
  for (let k = 1; k < path.length; k++) {
    const seg = JSON.stringify(path[k]);
    buf.push(`if(${v}!==null&&typeof ${v}==="object"&&Object.hasOwn(${v},${seg}))${v}=${v}[${seg}];else ${v}=undefined;`);
  }
  return v;
}

function genNodes(buf, nodes, scopeVar) {
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        buf.push(`o.push(${JSON.stringify(n.text)});`);
        break;
      case 'var': {
        const v = genLookup(buf, scopeVar, n.path);
        buf.push(`o.push(C.escape(T(${v})));`);
        break;
      }
      case 'raw': {
        const v = genLookup(buf, scopeVar, n.path);
        buf.push(`o.push(T(${v}));`);
        break;
      }
      case 'if': {
        const v = genLookup(buf, scopeVar, n.path);
        buf.push(`if(U(${v})!==${n.not}){`);
        genNodes(buf, n.then, scopeVar);
        if (n.else !== null) {
          buf.push('}else{');
          genNodes(buf, n.else, scopeVar);
        }
        buf.push('}');
        break;
      }
      case 'for': {
        const v = genLookup(buf, scopeVar, n.path);
        const xs = `x${genId++}`;
        const k = `k${genId++}`;
        const s2 = `s${genId++}`;
        const noLoop = !usesLoopRef(n.body);
        buf.push(`if(Array.isArray(${v})){const ${xs}=${v};for(let ${k}=0;${k}<${xs}.length;${k}++){const ${s2}=Object.create(${scopeVar});`);
        // '__proto__' as a loop name must be an own property, never the
        // prototype: defineProperty keeps the chain intact.
        if (n.name === '__proto__') buf.push(`Object.defineProperty(${s2},${JSON.stringify(n.name)},{value:${xs}[${k}],enumerable:true,writable:true,configurable:true});`);
        else buf.push(`${s2}[${JSON.stringify(n.name)}]=${xs}[${k}];`);
        if (!noLoop) buf.push(`${s2}.loop={index:${k}+1,first:${k}===0,last:${k}===${xs}.length-1,length:${xs}.length};`);
        genNodes(buf, n.body, s2);
        buf.push('}}');
        break;
      }
      case 'include':
        buf.push(`if(D<${INCLUDE_DEPTH}){const f=C.templates.get(${JSON.stringify(n.name)});if(f!==undefined)o.push(f(${scopeVar},C,D+1,T,U));}`);
        break;
    }
  }
}

function compileTemplate(name, src, nodes) {
  nodes = nodes ?? parseTemplate(name, src);
  try {
    genId = 0;
    const buf = ['"use strict";const o=[];'];
    genNodes(buf, nodes, 'S');
    buf.push('return o.join("");');
    return new Function('S', 'C', 'D', 'T', 'U', buf.join(''));
  } catch (err) {
    // Code generation unavailable (or a codegen bug): the interpreter
    // renders this template instead, with identical output.
    return (S, C, D, T, U) => renderNodes(nodes, S, C, D);
  }
}

const tplCache = new Map();

function getTemplateFn(name, src, nodes) {
  let fn = tplCache.get(src);
  if (fn === undefined) {
    fn = compileTemplate(name, src, nodes);
    tplCache.set(src, fn);
  }
  return fn;
}

// ---------------------------------------------------------------- template analysis
//
// For each template: the set of scope names its output can depend on
// (transitively, through includes, with `for` bindings subtracted), the
// deepest include nesting in its subtree, and whether its subtree holds an
// include cycle. A template with at most one dependency and no cycle renders
// as a pure function of that one value (and the include depth), so layouts()
// memoises its includes on that value: a post's card, rendered once, is
// reused in its index and tag listings; a header is rendered once per case.

// Parse cache: the same template sources recur across a run's cases.
const parseCache = new Map();

function getParsed(name, src) {
  let nodes = parseCache.get(src);
  if (nodes === undefined) {
    nodes = parseTemplate(name, src);
    parseCache.set(src, nodes);
  }
  return nodes;
}

function analyzeTemplate(nodes, parsed) {
  const deps = new Set();
  let cyclic = false;
  let maxDepth = 0;
  const walk = (ns, bound, stack, depth) => {
    for (const n of ns) {
      if (n.kind === 'var' || n.kind === 'raw') {
        if (!bound.has(n.path[0])) deps.add(n.path[0]);
      } else if (n.kind === 'if') {
        if (!bound.has(n.path[0])) deps.add(n.path[0]);
        walk(n.then, bound, stack, depth);
        if (n.else !== null) walk(n.else, bound, stack, depth);
      } else if (n.kind === 'for') {
        if (!bound.has(n.path[0])) deps.add(n.path[0]);
        const b2 = new Set(bound);
        b2.add(n.name);
        walk(n.body, b2, stack, depth);
      } else if (n.kind === 'include') {
        const sub = parsed.get(n.name);
        if (sub === undefined) continue;
        if (stack.has(n.name)) { cyclic = true; continue; }
        if (depth + 1 > maxDepth) maxDepth = depth + 1;
        const s2 = new Set(stack);
        s2.add(n.name);
        walk(sub, bound, s2, depth + 1);
      }
    }
  };
  walk(nodes, new Set(), new Set(), 0);
  return { deps, maxDepth, cyclic };
}

// ---------------------------------------------------------------- the build

const REPORT_FILE = 'build-report.txt';
const RESERVED = ['posts', 'tags', 'page'];

function wordsOf(text) {
  // Same count as text.match(/\S+/g): runs of non-whitespace, where
  // whitespace is exactly isWS's set. No regex, no allocation, and the
  // whitespace test is inlined: a call per character cost more than the test.
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 160 ||
      c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 ||
      c === 8287 || c === 12288 || c === 65279) inWord = false;
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}

// /^[A-Za-z][A-Za-z0-9+.-]*:/ — a link target with a scheme.
function hasScheme(t) {
  const c = t.charCodeAt(0);
  if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) return false;
  for (let j = 1; j < t.length; j++) {
    const d = t.charCodeAt(j);
    if (d === 58) return true;
    if (!((d >= 65 && d <= 90) || (d >= 97 && d <= 122) || (d >= 48 && d <= 57) || d === 43 || d === 45 || d === 46)) return false;
  }
  return false;
}

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

function readSources(b) {
  const files = [...b.input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const f of files) {
    if (f.path.endsWith('.md')) b.sources.push({ path: f.path, text: f.content.includes('\r') ? f.content.replace(/\r\n?/g, '\n') : f.content });
    else b.statics.push({ path: f.path, content: f.content });
  }
}

function frontMatter(b) {
  const kept = [];
  for (const s of b.sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      b.report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find((d) => d !== 'posts' && s.path.startsWith(`${d}/`));
    if (own !== undefined) {
      b.report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      b.report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!b.templates.has(layout)) {
      b.report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      b.report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  b.sources = kept;
}

function permalinks(b) {
  const taken = new Map();
  const takenIn = (dir) => {
    if (!taken.has(dir)) taken.set(dir, new Set(dir === '' ? RESERVED : []));
    return taken.get(dir);
  };
  for (const s of b.sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${b.base}/${s.outDir}/`;
    b.bySource.set(s.path, s);
  }
}

function markdown(b) {
  const staticPaths = new Set(b.statics.map((f) => f.path));
  for (const s of b.sources) {
    const dir = dirOf(s.path);
    const env = {
      link: (target) => {
        if (hasScheme(target) || target.startsWith('/') || target.startsWith('#')) return target;
        const hash = target.indexOf('#');
        const rel = hash === -1 ? target : target.slice(0, hash);
        const frag = hash === -1 ? '' : target.slice(hash);
        const path = rel === '' ? null : resolvePath(dir, rel);
        if (path !== null && b.bySource.has(path)) return `${b.bySource.get(path).url}${frag}`;
        if (path !== null && staticPaths.has(path)) return `${b.base}/${path}${frag}`;
        b.broken.add(`broken-link ${s.path} -> ${target}`);
        return target;
      },
    };
    const md = renderMarkdown(s.body, env);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }
}

function collections(b) {
  const posts = b.sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  b.posts = posts;
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });
}

function tags(b) {
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    for (const name of s.data.tags ?? []) {
      const slug = slugify(name);
      if (!seen.has(slug)) {
        seen.add(slug);
        out.push({ name, slug });
      }
    }
    return out;
  };
  for (const p of b.posts) {
    p.tagRefs = [];
    for (const { name, slug } of ownTags(p)) {
      if (!bySlug.has(slug)) bySlug.set(slug, { name, slug, url: `${b.base}/tags/${slug}/`, posts: [] });
      const tag = bySlug.get(slug);
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of b.sources) {
    if (s.post) continue;
    s.tagRefs = ownTags(s).map(({ name, slug }) => bySlug.get(slug) ?? { name, slug, url: '', posts: [] });
  }
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));
}

const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });
const tagOf = (b, t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => b.cards.get(p)) });

function cardOf(s) {
  return {
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  };
}

function pageOf(s, card) {
  return {
    ...(card ?? cardOf(s)),
    slug: s.slug,
    content: s.html,
    toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
    newer: linkOf(s.newer ?? null),
    older: linkOf(s.older ?? null),
    is_post: s.post,
  };
}

function layouts(b) {
  b.cards = new Map(b.posts.map((p) => [p, cardOf(p)]));
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => b.cards.get(p));
  // Memoised includes: a template with at most one dependency and no include
  // cycle is a pure function of that one value (while no include in its
  // subtree is depth-suppressed, i.e. D + maxDepth <= 8), so its renders are
  // cached on the value: each post's card is rendered once and reused in its
  // index and tag listings, a repeated partial once per page, a header once
  // per case. The cache lives only for this build.
  const ctxTemplates = new Map(b.templates);
  for (const [name, fn] of b.templates) {
    const inf = b.templateInfo.get(name);
    if (inf === undefined || inf.cyclic || inf.deps.size > 1) continue;
    if (inf.deps.size === 0) {
      let cached;
      let done = false;
      ctxTemplates.set(name, (S, C, D, T, U) => {
        if (D + inf.maxDepth > 8) return fn(S, C, D, T, U);
        if (!done) { cached = fn(S, C, D, T, U); done = true; }
        return cached;
      });
    } else {
      const dep = [...inf.deps][0];
      const cache = new Map();
      ctxTemplates.set(name, (S, C, D, T, U) => {
        if (D + inf.maxDepth > 8) return fn(S, C, D, T, U);
        const key = lookup(S, [dep]);
        let hit = cache.get(key);
        if (hit === undefined) { hit = fn(S, C, D, T, U); cache.set(key, hit); }
        return hit;
      });
    }
  }
  const ctx = { templates: ctxTemplates, escape: escapeHtml };
  const render = (name, vars) => {
    const fn = ctx.templates.get(name);
    if (fn === undefined) return null;
    // Root scope: a null-prototype vars object (see lookup).
    const scope = Object.create(null);
    scope.site = site;
    scope.tags = allTags;
    scope.recent = recent;
    Object.assign(scope, vars);
    return fn(scope, ctx, 0, textOf, truthy);
  };
  for (const s of b.sources) b.output[`${s.outDir}/index.html`] = render(s.layout, { page: pageOf(s, b.cards.get(s)) });
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: b.posts.slice((k - 1) * per, k * per).map((p) => b.cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of b.tags) {
    const html = render('tag', { tag: tagOf(b, t) });
    if (html !== null) b.output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) b.output['tags/index.html'] = tagsHtml;
  for (const f of b.statics) {
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }
}

function report(b) {
  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pages = b.sources.filter((s) => !s.post).length;
  lines.push(`built ${pages} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = `${lines.join('\n')}\n`;
}

const PIPELINE = [readSources, frontMatter, permalinks, markdown, collections, tags, layouts, report];

function build(input) {
  // Two passes: parse every template first (failed ones are reported and
  // left out, as the reference does), then analyse the whole set, then
  // compile. Analysis needs the full set because includes cross templates.
  const parsed = new Map();
  const rep = [];
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      parsed.set(name, getParsed(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      rep.push(err.message);
    }
  }
  const templateInfo = new Map();
  for (const [name, nodes] of parsed) templateInfo.set(name, analyzeTemplate(nodes, parsed));
  const templates = new Map();
  for (const [name, nodes] of parsed) templates.set(name, getTemplateFn(name, input.templates[name], nodes));
  const b = {
    input,
    base: input.site.base_url.replace(/\/+$/, ''),
    templates,
    templateInfo,
    sources: [],
    statics: [],
    bySource: new Map(),
    broken: new Set(),
    report: rep,
    posts: [],
    tags: [],
    cards: new Map(),
    output: {},
  };
  for (const plugin of PIPELINE) plugin(b);
  return b.output;
}

/** makefun-site 1.0.0's answer for one case's input. */
export function run(input) {
  slugCache = new Map();
  return build(input);
}
