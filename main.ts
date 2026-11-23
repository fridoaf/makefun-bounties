// main.ts is mend, the CLI SPEC.md specifies. Node 22, the standard library alone; run it as
// `node main.ts [options] [PATCH]`. Implements SPEC.md sections 1 to 10: the command line, the
// output and exit codes, safe paths, format detection, the three matching tiers, unified diffs,
// SEARCH/REPLACE blocks, V4A patches, JSON edits and the all-or-nothing write.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file
// hands over to runner.ts (the last lines below): keep that hand-over and runner.ts as they are.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** A file's lines, its line break and whether it ends with one (SPEC.md section 3). */
interface FileModel {
  lines: string[];
  br: string;
  final: boolean;
}

function parseFile(text: string): FileModel {
  if (text === '') return { lines: [], br: '\n', final: false };
  const nl = text.indexOf('\n');
  const br = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const parts = text.split(br);
  const final = text.endsWith(br);
  if (final) parts.pop();
  return { lines: parts, br, final };
}

function renderFile(m: FileModel): string {
  if (m.lines.length === 0) return '';
  return m.lines.join(m.br) + (m.final ? m.br : '');
}

function leadingWs(s: string): string {
  const m = /^[ \t]*/.exec(s);
  return m === null ? '' : m[0];
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  /** Successful moves, as [old, new] pairs, for the `R` output lines. */
  readonly moves: Array<[string, string]> = [];
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }
  /** True when the path exists on disk as anything (file or directory). */
  diskExists(p: string): boolean {
    try {
      statSync(p);
      return true;
    } catch {
      return false;
    }
  }
}

type Edit = (tree: Tree) => void;

/** Line matching at the three tiers (SPEC.md section 5). */
function normLine(s: string, tier: number): string {
  if (tier === 0) return s;
  if (tier === 1) return s.replace(/[ \t]+$/, '');
  return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

function tiersFor(strict: boolean): number[] {
  return strict ? [0] : [0, 1, 2];
}

/** Every 0-based position where O occurs in the file's lines at the tier. */
function findOccurrences(file: string[], o: string[], tier: number): number[] {
  const n = o.length;
  const out: number[] = [];
  if (n === 0) return out;
  const on = o.map((l) => normLine(l, tier));
  const fn = file.map((l) => normLine(l, tier));
  for (let i = 0; i + n <= file.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (fn[i + j] !== on[j]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/** The first tier at which O occurs at least once, with every occurrence there. */
function findFirstTier(file: string[], o: string[], strict: boolean): { tier: number; occ: number[] } | null {
  for (const t of tiersFor(strict)) {
    const occ = findOccurrences(file, o, t);
    if (occ.length > 0) return { tier: t, occ };
  }
  return null;
}

/** The first occurrence of O at or after `from`, at the first tier with one; an end-of-file
 *  chunk takes only an occurrence that ends at the file's last line. */
function findFrom(file: string[], o: string[], from: number, strict: boolean, eof: boolean): { tier: number; pos: number } | null {
  for (const t of tiersFor(strict)) {
    const occ = findOccurrences(file, o, t);
    for (const p of occ) {
      if (p < from) continue;
      if (eof && p + o.length !== file.length) continue;
      return { tier: t, pos: p };
    }
  }
  return null;
}

/** The first line at or after `from` equal to the anchor (a single line) at the first tier
 *  where one is, or -1. */
function findAnchor(file: string[], anchor: string, from: number, strict: boolean): number {
  for (const t of tiersFor(strict)) {
    const a = normLine(anchor, t);
    for (let i = from; i < file.length; i++) {
      if (normLine(file[i]!, t) === a) return i;
    }
  }
  return -1;
}

/** Replace the k matched lines at `at` with N. Context lines of N take the file's own matched
 *  line; at tier 2 every other line of N is re-indented (SPEC.md section 5). `oCtx`/`nCtx`
 *  mark the context lines of O/N, in order. */
function applyReplacement(fileLines: string[], at: number, o: string[], n: string[], oCtx: boolean[], nCtx: boolean[], tier: number): string[] {
  const oCtxIdx: number[] = [];
  o.forEach((_, i) => {
    if (oCtx[i]) oCtxIdx.push(i);
  });
  let f = '';
  let p = '';
  if (tier === 2 && o.length > 0) {
    f = leadingWs(fileLines[at]!);
    p = leadingWs(o[0]!);
  }
  const rep: string[] = [];
  let ctx = 0;
  for (let i = 0; i < n.length; i++) {
    if (nCtx[i]) {
      rep.push(fileLines[at + oCtxIdx[ctx]!]!);
      ctx += 1;
    } else if (tier === 2) {
      const line = n[i]!;
      if (line !== '' && line.trim() !== '' && line.startsWith(p)) rep.push(f + line.slice(p.length));
      else rep.push(line);
    } else {
      rep.push(n[i]!);
    }
  }
  return [...fileLines.slice(0, at), ...rep, ...fileLines.slice(at + o.length)];
}

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null || tree.diskExists(p)) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

/** Unified diffs (SPEC.md section 6). */
interface UBodyLine {
  kind: ' ' | '-' | '+' | '\\';
  text: string;
  /** A `\` line follows this body line at once. */
  noNl: boolean;
}
interface UHunk {
  /** A from the `@@ -A[,B] +C[,D] @@` header (1-based). */
  a: number;
  body: UBodyLine[];
}
interface USection {
  /** undefined: not named here; null: `/dev/null`; string: the path (prefix removed). */
  oldPath: string | null | undefined;
  newPath: string | null | undefined;
  hasPair: boolean;
  newFile: boolean;
  deletedFile: boolean;
  diffOld: string | undefined;
  diffNew: string | undefined;
  renameOld: string | undefined;
  renameNew: string | undefined;
  hunks: UHunk[];
}

function newUSection(): USection {
  return { oldPath: undefined, newPath: undefined, hasPair: false, newFile: false, deletedFile: false, diffOld: undefined, diffNew: undefined, renameOld: undefined, renameNew: undefined, hunks: [] };
}

/** The path after `--- `/`+++ `: text after four characters, up to the first tab, spaces
 *  removed, `/dev/null` as null, one leading `a/` or `b/` removed. */
function uPath(raw: string): string | null {
  let p = raw.slice(4);
  const tab = p.indexOf('\t');
  if (tab >= 0) p = p.slice(0, tab);
  p = p.trim();
  if (p === '/dev/null') return null;
  if (p.startsWith('a/') || p.startsWith('b/')) p = p.slice(2);
  return p;
}

/** O/N of a hunk body, with context flags, in body order. */
function hunkON(body: UBodyLine[]): { o: string[]; n: string[]; oCtx: boolean[]; nCtx: boolean[] } {
  const o: string[] = [];
  const n: string[] = [];
  const oCtx: boolean[] = [];
  const nCtx: boolean[] = [];
  for (const b of body) {
    if (b.kind === '\\') continue;
    if (b.kind === ' ') {
      o.push(b.text);
      oCtx.push(true);
      n.push(b.text);
      nCtx.push(true);
    } else if (b.kind === '-') {
      o.push(b.text);
      oCtx.push(false);
    } else {
      n.push(b.text);
      nCtx.push(false);
    }
  }
  return { o, n, oCtx, nCtx };
}

/** Whether a `\` line follows the hunk's last context or `+` line. */
function hunkLastNoNl(h: UHunk): boolean {
  for (let i = h.body.length - 1; i >= 0; i--) {
    const b = h.body[i]!;
    if (b.kind === ' ' || b.kind === '+') return b.noNl;
  }
  return false;
}

function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const sections: USection[] = [];
  let cur: USection | null = null;
  let curHunk: UHunk | null = null;
  let inBody = false;
  let headerPhase = false;

  const startSection = (s: USection): void => {
    sections.push(s);
    cur = s;
    curHunk = null;
    inBody = false;
    headerPhase = true;
  };
  const endBody = (): void => {
    if (curHunk !== null) {
      while (curHunk.body.length > 0) {
        const b = curHunk.body[curHunk.body.length - 1]!;
        if (b.kind === ' ' && b.text === '') curHunk.body.pop();
        else break;
      }
    }
    curHunk = null;
    inBody = false;
  };
  const parseDiffGit = (line: string, lineNo: number): [string, string] => {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line.trimEnd());
    if (m === null) throw new Exit2(`error: parse ${lineNo}`);
    return [m[1]!, m[2]!];
  };
  const parseHunkHeader = (line: string, lineNo: number): number => {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m === null) throw new Exit2(`error: parse ${lineNo}`);
    return parseInt(m[1]!, 10);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const lineNo = i + 1;
    if (inBody) {
      if (line === '' || line[0] === ' ' || line[0] === '-' || line[0] === '+' || line[0] === '\\') {
        if (line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
          endBody();
          const s = newUSection();
          s.oldPath = uPath(line);
          s.newPath = uPath(lines[i + 1]!);
          s.hasPair = true;
          startSection(s);
          i += 2;
          continue;
        }
        if (line === '') {
          curHunk!.body.push({ kind: ' ', text: '', noNl: false });
        } else if (line[0] === '\\') {
          for (let j = curHunk!.body.length - 1; j >= 0; j--) {
            if (curHunk!.body[j]!.kind !== '\\') {
              curHunk!.body[j]!.noNl = true;
              break;
            }
          }
          curHunk!.body.push({ kind: '\\', text: line.slice(1), noNl: false });
        } else {
          curHunk!.body.push({ kind: line[0] as ' ' | '-' | '+', text: line.slice(1), noNl: false });
        }
        i += 1;
        continue;
      }
      endBody();
      // Fall through: this line ends the body and is read as outside it.
    }
    if (line === 'diff --git' || line.startsWith('diff --git ')) {
      const [x, y] = parseDiffGit(line, lineNo);
      const s = newUSection();
      s.diffOld = x;
      s.diffNew = y;
      startSection(s);
      i += 1;
      continue;
    }
    if (line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      if (cur !== null && headerPhase && !cur.hasPair) {
        cur.oldPath = uPath(line);
        cur.newPath = uPath(lines[i + 1]!);
        cur.hasPair = true;
        i += 2;
        continue;
      }
      const s = newUSection();
      s.oldPath = uPath(line);
      s.newPath = uPath(lines[i + 1]!);
      s.hasPair = true;
      startSection(s);
      i += 2;
      continue;
    }
    if (line.startsWith('@@')) {
      if (cur === null) throw new Exit2(`error: parse ${lineNo}`);
      const a = parseHunkHeader(line, lineNo);
      curHunk = { a, body: [] };
      cur.hunks.push(curHunk);
      inBody = true;
      headerPhase = false;
      i += 1;
      continue;
    }
    if (cur !== null && headerPhase) {
      if (line.startsWith('--- ')) throw new Exit2(`error: parse ${lineNo + 1}`);
      if (line.startsWith('rename from ') && cur.renameOld === undefined) {
        cur.renameOld = line.slice('rename from '.length).trim();
        i += 1;
        continue;
      }
      if (line.startsWith('rename to ') && cur.renameNew === undefined) {
        cur.renameNew = line.slice('rename to '.length).trim();
        i += 1;
        continue;
      }
      if (line.startsWith('new file mode')) {
        cur.newFile = true;
        i += 1;
        continue;
      }
      if (line.startsWith('deleted file mode')) {
        cur.deletedFile = true;
        i += 1;
        continue;
      }
      // index, old mode, new mode, similarity index, dissimilarity index, Index: and any
      // other header line are ignored.
      i += 1;
      continue;
    }
    // Outside bodies, lines that are not part of a section header are ignored (prose, fences).
    i += 1;
  }
  endBody();
  if (sections.length === 0) throw new Exit2('error: parse 1');
  return sections.map((s) => uSectionEdit(s, strict));
}

function uSectionEdit(s: USection, strict: boolean): Edit {
  const oldP = s.oldPath !== undefined ? s.oldPath : (s.renameOld ?? s.diffOld);
  const newP = s.newPath !== undefined ? s.newPath : (s.renameNew ?? s.diffNew);
  return (tree) => {
    if (oldP === undefined && newP === undefined) return;
    if (oldP === null && newP === null) return;
    if (oldP === null || s.newFile) {
      // Creation: the new path does not exist; the file is the `+` lines of all hunks.
      const p = newP!;
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null || tree.diskExists(p)) throw new Fail('exists', p);
      const plus: string[] = [];
      let lastNoNl = false;
      for (const h of s.hunks) {
        for (const b of h.body) {
          if (b.kind === '+') {
            plus.push(b.text);
            lastNoNl = b.noNl;
          }
        }
      }
      tree.now.set(p, plus.length === 0 ? '' : plus.join('\n') + (lastNoNl ? '' : '\n'));
      return;
    }
    if (newP === null || s.deletedFile) {
      // Deletion: the old path exists; its hunks are not read.
      const p = oldP!;
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
      return;
    }
    const p = oldP!;
    if (!safe(p)) throw new Fail('unsafe', p);
    const isMove = newP !== oldP;
    if (isMove && !safe(newP!)) throw new Fail('unsafe', newP!);
    const cur = tree.get(p);
    if (cur === null) throw new Fail('missing', p);
    if (isMove && (tree.get(newP!) !== null || tree.diskExists(newP!))) throw new Fail('exists', newP!);
    let m = parseFile(cur);
    let d = 0;
    for (const h of s.hunks) {
      const { o, n, oCtx, nCtx } = hunkON(h.body);
      if (o.length === 0) {
        const idx = Math.max(0, Math.min(h.a + d, m.lines.length));
        const atEnd = idx === m.lines.length;
        m.lines = [...m.lines.slice(0, idx), ...n, ...m.lines.slice(idx)];
        if (atEnd && n.length > 0) m.final = !hunkLastNoNl(h);
        d += n.length;
      } else {
        const found = findFirstTier(m.lines, o, strict);
        if (found === null) throw new Fail('no-match', p);
        const target = h.a - 1 + d;
        let best = found.occ[0]!;
        let bestDist = Math.abs(best - target);
        for (const pos of found.occ) {
          const dist = Math.abs(pos - target);
          if (dist < bestDist) {
            best = pos;
            bestDist = dist;
          }
        }
        const atEnd = best + o.length === m.lines.length;
        m.lines = applyReplacement(m.lines, best, o, n, oCtx, nCtx, found.tier);
        if (atEnd) m.final = !hunkLastNoNl(h);
        d += n.length - o.length;
      }
    }
    const out = renderFile(m);
    if (isMove) {
      tree.now.set(p, null);
      tree.now.set(newP!, out);
      tree.moves.push([p, newP!]);
    } else {
      tree.now.set(p, out);
    }
  };
}

/** SEARCH/REPLACE blocks (SPEC.md section 7). */
function srEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let prevEnd = -1; // index after the previous block's `>>>>>>> REPLACE` line
  let prevPath: string | null = null;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trimEnd() !== '<<<<<<< SEARCH') {
      i += 1;
      continue;
    }
    const searchLine = i + 1;
    // The path is the nearest line before the SEARCH line, after the previous block, that
    // is not blank and does not start with three backticks.
    let path: string | null = null;
    for (let j = i - 1; j > prevEnd; j--) {
      const t = lines[j]!.trim();
      if (t === '' || t.startsWith('```')) continue;
      path = t;
      break;
    }
    if (path === null) {
      if (prevPath === null) throw new Exit2(`error: parse ${searchLine}`);
      path = prevPath;
    }
    let eq = -1;
    for (let k = i + 1; k < lines.length; k++) {
      const t = lines[k]!.trimEnd();
      if (t === '=======') {
        eq = k;
        break;
      }
      if (t === '>>>>>>> REPLACE') break;
    }
    if (eq < 0) throw new Exit2(`error: parse ${searchLine}`);
    let rep = -1;
    for (let k = eq + 1; k < lines.length; k++) {
      if (lines[k]!.trimEnd() === '>>>>>>> REPLACE') {
        rep = k;
        break;
      }
    }
    if (rep < 0) throw new Exit2(`error: parse ${searchLine}`);
    const old = lines.slice(i + 1, eq);
    const nw = lines.slice(eq + 1, rep);
    edits.push(srBlockEdit(path, old, nw, strict));
    prevPath = path;
    prevEnd = rep;
    i = rep + 1;
  }
  if (edits.length === 0) throw new Exit2('error: parse 1');
  return edits;
}

function srBlockEdit(path: string, old: string[], nw: string[], strict: boolean): Edit {
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (old.length === 0) {
      if (tree.get(path) !== null || tree.diskExists(path)) throw new Fail('exists', path);
      tree.now.set(path, nw.length === 0 ? '' : nw.join('\n') + '\n');
      return;
    }
    const cur = tree.get(path);
    if (cur === null) throw new Fail('missing', path);
    const m = parseFile(cur);
    const found = findFirstTier(m.lines, old, strict);
    if (found === null) throw new Fail('no-match', path);
    if (found.occ.length > 1) throw new Fail('ambiguous', path);
    const none = old.map(() => false);
    const lines = applyReplacement(m.lines, found.occ[0]!, old, nw, none, none, found.tier);
    tree.now.set(path, renderFile({ lines, br: m.br, final: m.final }));
  };
}

/** V4A patches (SPEC.md section 8). */
interface VChunk {
  /** null: no anchor. */
  anchor: string | null;
  eof: boolean;
  body: Array<{ kind: ' ' | '-' | '+'; text: string }>;
}
interface VSection {
  kind: 'add' | 'delete' | 'update';
  path: string;
  headerLine: number;
  lines: Array<{ text: string; lineNo: number }>;
}

function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!blank(lines[i]!)) {
      last = i;
      break;
    }
  }
  if (lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const edits: Edit[] = [];
  let i = first + 1;
  while (i < last) {
    const line = lines[i]!;
    if (blank(line)) {
      i += 1;
      continue;
    }
    let kind: 'add' | 'delete' | 'update' | null = null;
    let path = '';
    if (line.startsWith('*** Add File: ')) {
      kind = 'add';
      path = line.slice('*** Add File: '.length).trim();
    } else if (line.startsWith('*** Delete File: ')) {
      kind = 'delete';
      path = line.slice('*** Delete File: '.length).trim();
    } else if (line.startsWith('*** Update File: ')) {
      kind = 'update';
      path = line.slice('*** Update File: '.length).trim();
    } else {
      throw new Exit2(`error: parse ${i + 1}`);
    }
    const headerLine = i + 1;
    i += 1;
    const collected: Array<{ text: string; lineNo: number }> = [];
    while (i < last) {
      const l = lines[i]!;
      if (l.startsWith('*** Add File: ') || l.startsWith('*** Delete File: ') || l.startsWith('*** Update File: ')) break;
      collected.push({ text: l, lineNo: i + 1 });
      i += 1;
    }
    while (collected.length > 0 && blank(collected[collected.length - 1]!.text)) collected.pop();
    edits.push(vSectionEdit({ kind, path, headerLine, lines: collected }, strict));
  }
  if (edits.length === 0) throw new Exit2('error: parse 1');
  return edits;
}

function vSectionEdit(s: VSection, strict: boolean): Edit {
  if (s.kind === 'add') {
    const content: string[] = [];
    for (const l of s.lines) {
      if (l.text === '') content.push('');
      else if (l.text.startsWith('+')) content.push(l.text.slice(1));
      else throw new Exit2(`error: parse ${l.lineNo}`);
    }
    return (tree) => {
      const p = s.path;
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null || tree.diskExists(p)) throw new Fail('exists', p);
      tree.now.set(p, content.length === 0 ? '' : content.join('\n') + '\n');
    };
  }
  if (s.kind === 'delete') {
    for (const l of s.lines) throw new Exit2(`error: parse ${l.lineNo}`);
    return (tree) => {
      const p = s.path;
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
    };
  }
  // Update File: an optional `*** Move to:` first line, then chunks.
  let moveTo: string | null = null;
  let idx = 0;
  if (s.lines.length > 0 && s.lines[0]!.text.startsWith('*** Move to: ')) {
    moveTo = s.lines[0]!.text.slice('*** Move to: '.length).trim();
    idx = 1;
  }
  const chunks: VChunk[] = [];
  let cur: VChunk | null = null;
  let sawChunk = false;
  for (; idx < s.lines.length; idx++) {
    const l = s.lines[idx]!;
    const t = l.text;
    if (t.startsWith('@@')) {
      if (cur !== null) chunks.push(cur);
      const anchor = t.slice(2).trim();
      cur = { anchor: anchor === '' ? null : anchor, eof: false, body: [] };
      sawChunk = true;
    } else if (t === '*** End of File') {
      if (cur === null) throw new Exit2(`error: parse ${l.lineNo}`);
      cur.eof = true;
      chunks.push(cur);
      cur = null;
    } else if (t === '' || t[0] === ' ' || t[0] === '-' || t[0] === '+') {
      if (cur === null) {
        if (sawChunk) throw new Exit2(`error: parse ${l.lineNo}`);
        cur = { anchor: null, eof: false, body: [] };
        sawChunk = true;
      }
      cur.body.push({ kind: t === '' ? ' ' : (t[0] as ' ' | '-' | '+'), text: t === '' ? '' : t.slice(1) });
    } else {
      throw new Exit2(`error: parse ${l.lineNo}`);
    }
  }
  if (cur !== null) chunks.push(cur);
  if (chunks.length === 0 && moveTo === null) throw new Exit2(`error: parse ${s.headerLine}`);
  return (tree) => {
    const p = s.path;
    if (!safe(p)) throw new Fail('unsafe', p);
    if (moveTo !== null && !safe(moveTo)) throw new Fail('unsafe', moveTo);
    const curText = tree.get(p);
    if (curText === null) throw new Fail('missing', p);
    if (moveTo !== null && (tree.get(moveTo) !== null || tree.diskExists(moveTo))) throw new Fail('exists', moveTo);
    const m = parseFile(curText);
    let cursor = 0;
    for (const ch of chunks) {
      if (ch.anchor !== null) {
        const ai = findAnchor(m.lines, ch.anchor, cursor, strict);
        if (ai < 0) throw new Fail('no-match', p);
        cursor = ai + 1;
      }
      const o: string[] = [];
      const n: string[] = [];
      const oCtx: boolean[] = [];
      const nCtx: boolean[] = [];
      for (const b of ch.body) {
        if (b.kind === ' ') {
          o.push(b.text);
          oCtx.push(true);
          n.push(b.text);
          nCtx.push(true);
        } else if (b.kind === '-') {
          o.push(b.text);
          oCtx.push(false);
        } else {
          n.push(b.text);
          nCtx.push(false);
        }
      }
      if (o.length === 0) {
        const at = ch.eof ? m.lines.length : cursor;
        m.lines = [...m.lines.slice(0, at), ...n, ...m.lines.slice(at)];
        cursor = at + n.length;
      } else {
        const found = findFrom(m.lines, o, cursor, strict, ch.eof);
        if (found === null) throw new Fail('no-match', p);
        m.lines = applyReplacement(m.lines, found.pos, o, n, oCtx, nCtx, found.tier);
        cursor = found.pos + n.length;
      }
    }
    const out = renderFile(m);
    if (moveTo !== null) {
      tree.now.set(p, null);
      tree.now.set(moveTo, out);
      tree.moves.push([p, moveTo]);
    } else {
      tree.now.set(p, out);
    }
  };
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    edits =
      kind === 'json'
        ? jsonEdits(text, lines)
        : kind === 'unified'
          ? unifiedEdits(lines, strict)
          : kind === 'search-replace'
            ? srEdits(lines, strict)
            : v4aEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const rows: Array<{ key: string; line: string }> = [];
  const moved = new Set<string>();
  for (const [oldP, newP] of tree.moves) {
    if (tree.original(oldP) !== null && tree.now.get(oldP) === null && tree.original(newP) === null && tree.now.get(newP) !== null) {
      rows.push({ key: newP, line: `R ${oldP} -> ${newP}` });
      moved.add(oldP);
      moved.add(newP);
    }
  }
  for (const p of [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    if (moved.has(p)) continue;
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    rows.push({ key: p, line: `${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}` });
  }
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  if (!check) {
    for (const p of [...tree.now.keys()]) {
      if (tree.now.get(p) === null) rmSync(p, { force: true });
    }
    for (const p of [...tree.now.keys()]) {
      const was = tree.original(p);
      const now = tree.now.get(p)!;
      if (now === null || was === now) continue;
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, now);
    }
  }
  const out = rows.map((r) => r.line);
  return { code: 0, out: [...out, `ok: ${out.length} ${out.length === 1 ? 'file' : 'files'}`] };
}

const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
