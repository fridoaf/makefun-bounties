// Ember Pact — the hand-in program (Node 22, standard library only).
//
// The game itself is plain static files under game/ (game/index.html and its
// ES modules, no library, no network request). This program hands it in: it
// copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-game.ts, the kit's copy, unchanged).
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// NOTE: never rmSync(out): the grader mounts /output as a bind mount, and
// removing a mount point throws EBUSY ("Device or resource busy") and exits 1.
// The kit starter only creates the directories and copies over them.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own: the dossier text is capped at 160 KiB, at
// most 4 screenshots of 256 KiB each, and game/ holds at most 993 files and
// directories, 48 MiB in all, no path over 1000 bytes. buildDossier refuses
// an entry that breaks any of them instead of writing a bad dossier.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
