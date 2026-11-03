// The smoke test: `npm run smoke`. It starts the dev server, opens every map in a hidden browser, spawns and kills
// each kind of enemy, fires arrows, stands next to every spawner, wins the Mindscape, and opens the two tools. It
// fails if any page throws an error or logs one. It does not judge whether anything looks or plays right; it
// catches "I broke the kitchen while fixing the garden".
//
// `npm run smoke garden` checks only that map (plus the Mindscape and tool checks).
//
// Needs Playwright and its Chromium. If they are missing: `npm i -D playwright && npx playwright install chromium`.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const maps = readdirSync('src/data/maps').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const assets = new Map(JSON.parse(readFileSync('src/data/assets.json', 'utf8')).assets.map((a) => [a.id, a]));
// Spawners in a map: things with an enemy that are not placed enemies.
const spawnersIn = (id) =>
  JSON.parse(readFileSync(`src/data/maps/${id}.json`, 'utf8')).objects.filter((o) => {
    const a = assets.get(o.asset);
    return a?.enemy && a.marker !== 'enemy';
  });

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await playwright.chromium.launch();
const failures = [];
const notes = [];

// One fresh page per check: a clean save, god mode on so the hero survives to keep testing, and every error caught.
async function open(name, path, god = true) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((on) => localStorage.setItem('swimply.config.v1', JSON.stringify({ sim: { godMode: on } })), god);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`${name}: ${m.text()}`);
    else if (m.type() === 'warning' && !m.text().includes('GL Driver Message')) notes.push(`${name}: ${m.text()}`);
  });
  await page.goto(base + path);
  return { page, ctx };
}

// Waits until the arena scene is running and has drawn some frames.
async function ready(page) {
  await page.waitForFunction(() => window.swimply?.scene.isActive('arena') && window.swimply.loop.frame > 20, null, { timeout: 20000 });
}

// Presses a dev menu button by its label (hidden or not). False if there is no such button.
const press = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll('#dev-menu button')].find((x) => x.textContent === l || x.textContent.startsWith(l));
    b?.click();
    return !!b;
  }, label);

// Holds the bow down while sweeping the aim round in a circle, so arrows fly every way.
async function shoot(page, seconds) {
  await page.mouse.move(640, 300);
  await page.mouse.down();
  const steps = seconds * 10;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 4;
    await page.mouse.move(640 + Math.cos(a) * 300, 400 + Math.sin(a) * 250);
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
}

const ENEMY_BUTTONS = [
  ['Spawn a Shade', 'Kill all Shades'],
  ['Spawn a Priest', 'Kill Priests'],
  ['Spawn elite werewolf', 'Kill elite werewolves'],
];

async function check(name, fn) {
  const before = failures.length;
  const t = Date.now();
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
  }
  console.log(`${failures.length > before ? 'FAIL' : 'ok  '} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

for (const id of maps.filter((m) => !process.argv[2] || m === process.argv[2])) {
  await check(`map ${id}: enemies and arrows`, async () => {
    const { page, ctx } = await open(id, `?map=${id}`);
    await ready(page);
    for (const [spawn] of ENEMY_BUTTONS) if (!(await press(page, spawn))) throw new Error(`no dev button "${spawn}"`);
    await page.waitForTimeout(1500);
    await shoot(page, 3);
    for (const [, kill] of ENEMY_BUTTONS) await press(page, kill);
    await press(page, 'Toggle hitboxes');
    await page.waitForTimeout(500);
    await ctx.close();
  });
  const list = spawnersIn(id);
  if (list.length) {
    await check(`map ${id}: ${list.length} spawner(s)`, async () => {
      for (const o of list) {
        const { page, ctx } = await open(`${id} spawner ${o.asset}`, `?map=${id}&at=${o.x + 60},${o.y + 60}`);
        await ready(page);
        await page.waitForTimeout(3000);
        await shoot(page, 1);
        await ctx.close();
      }
    });
  }
}

await check('Mindscape: werewolf comes and is beaten', async () => {
  const { page, ctx } = await open('mindscape win', '?map=mindscape');
  await ready(page);
  await press(page, 'Spawn werewolf');
  await page.waitForTimeout(2500);
  await shoot(page, 1);
  await press(page, 'Kill werewolf');
  // He wins, the Shades fade, and he travels back out.
  await page.waitForFunction(() => new URL(location.href).searchParams.get('map') !== 'mindscape', null, { timeout: 15000 });
  await ready(page);
  await ctx.close();
});

await check('Mindscape: death opens the tree', async () => {
  const { page, ctx } = await open('mindscape death', '?map=mindscape', false);
  await ready(page);
  await press(page, 'Spawn elite werewolf');
  await page.waitForFunction(() => window.swimply.scene.isActive('tree'), null, { timeout: 30000 });
  await ctx.close();
});

for (const tool of ['asset-maker.html', 'level-editor.html']) {
  await check(`tool ${tool}`, async () => {
    const { page, ctx } = await open(tool, tool);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await ctx.close();
  });
}

await browser.close();
await server.close();

if (notes.length) {
  console.log(`\n${notes.length} warning(s) (not failures):`);
  for (const n of [...new Set(notes)]) console.log(`  ${n}`);
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of [...new Set(failures)]) console.log(`  ${f}`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
