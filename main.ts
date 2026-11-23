// Solara Bay — entry driver for make.fun (Node 22, standard library only).
//
// The game is plain static files under game/ (index.html plus ES modules,
// no build step, no network). This program copies game/ and screenshots/
// next to this file into the output directory and writes dossier.json with
// the vendored make.fun library, so the judge can read the entry.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader, MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): text_max_bytes shapes the
// dossier text; the rest refuse an entry the scorer would refuse — more
// than 4 screenshots or one over 256 KiB; more than 993 files in game/
// or 48 MiB of game files in all; a path under game/ over 1000 bytes.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyEntry() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) {
    cpSync(shots, join(outDir, 'screenshots'), { recursive: true });
  } else {
    console.warn('warning: no screenshots/ folder beside main.ts — the entry needs 3-4 real renders');
  }
}

// The grader collects the output as another user, so every file must be
// world-readable and every folder world-traversable.
function fixPermissions(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      chmodSync(full, 0o755);
      fixPermissions(full);
    } else {
      chmodSync(full, 0o644);
    }
  }
}

copyEntry();
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, LIMITS));
chmodSync(outDir, 0o755);
fixPermissions(outDir);
console.log('Solara Bay entry written to ' + outDir);
