// Enforces the layer rules in ARCHITECTURE.md: a folder may only import from the folders listed for it.
// Run by `npm run check` (and by the build). If this fails, the import you just added breaks a layer.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve('src');

// folder -> folders it may import from (itself is always allowed)
const allowed = {
  config: [],
  core: ['config'],
  data: ['config', 'core'],
  sim: ['config', 'core', 'data'],
  render: ['config', 'core', 'data', 'sim'],
  dev: ['config', 'core'],
  scenes: ['config', 'core', 'data', 'sim', 'render', 'dev'],
  tools: ['config', 'core', 'data', 'render', 'dev'],
};

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk(ROOT);

const layerOf = (file) => relative(ROOT, file).split('/')[0];
const problems = [];

for (const file of files) {
  const from = layerOf(file);
  if (!relative(ROOT, file).includes('/')) continue; // src/main.ts wires everything and may import anything
  if (!(from in allowed)) {
    problems.push(`${relative(ROOT, file)}: folder "${from}" is not a known layer (add it to scripts/check-layers.mjs and ARCHITECTURE.md)`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[1]);
    const to = layerOf(target);
    if (to !== from && !allowed[from].includes(to)) {
      problems.push(`${relative(ROOT, file)} imports "${m[1]}": layer "${from}" may not use layer "${to}"`);
    }
  }
}

if (problems.length) {
  console.error('Layer check failed:\n' + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`Layer check passed (${files.length} files).`);
