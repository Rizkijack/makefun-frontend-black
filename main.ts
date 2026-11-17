// OBSIDIAN v3 entrypoint. Node 22, standard library only, erasable TypeScript.
//
// This program is deliberately authored by hand for this entry (not the kit starter):
// it is the packer that hands app/ + screenshots/ to the judge. It copies the static
// frontend into MAKEFUN_OUTPUT_DIR (default /output), then writes dossier.json using
// the vendored buildDossier so the file is byte-for-byte what the scorer recomputes.
// Nothing here touches vendor/, serve.ts, LICENSE, .makefun/ or .gitignore.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// Resolve paths from this file, never from the process CWD, so the pack works from anywhere.
const here: string = fileURLToPath(new URL('.', import.meta.url));
const out: string = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The scorer's caps from reference/gate.json. Only text_max_bytes shapes the dossier bytes;
// the others make us fail exactly where the scorer would, so we pass them through unchanged.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
} as const;

/** Copy a directory when it exists; the one required input is app/. */
function copyDir(from: string, to: string, required: boolean): void {
  if (!existsSync(from)) {
    if (required) throw new Error(`missing required directory: ${from}`);
    return;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

// A minimal preflight so a broken pack fails here with a clear message, not at the judge.
const appDir = join(here, 'app');
if (!existsSync(join(appDir, 'index.html'))) {
  throw new Error('app/index.html must exist');
}
const appFiles = readdirSync(appDir);
if (!appFiles.includes('main.js') || !appFiles.includes('style.css')) {
  throw new Error('app/main.js and app/style.css must exist');
}

// Materialise the hand-in directory.
mkdirSync(out, { recursive: true });
copyDir(appDir, join(out, 'app'), true);
copyDir(join(here, 'screenshots'), join(out, 'screenshots'), false);

// Write the dossier exactly as the scorer's copy of buildDossier would.
const dossier = buildDossier(out, CAPS);
const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);

// Short, stable stdout summary for the transcript and the run log. Keep it deterministic:
// the dossier itself is the artifact the judge validates, not this line.
console.log(`[OBSIDIAN] out=${out} dossier=${dossierPath} app_entries=${appFiles.length} dossier_bytes=${dossier.length}`);
