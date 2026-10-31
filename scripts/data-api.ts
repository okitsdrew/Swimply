import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// Lets the tools (asset maker, level editor) save JSON into src/data/ while `npm run dev` runs. It only exists on
// the dev server, so the built game has no way to write files. Only the data files listed here can be written, so a
// bug in a tool can never overwrite code. Only map files can be deleted.
const WRITABLE = /^src\/data\/(assets|floors|sprites)\.json$|^src\/data\/maps\/[a-z0-9_-]+\.json$/;
const MAP_FILE = /^src\/data\/maps\/[a-z0-9_-]+\.json$/;
const MAPS_DIR = 'src/data/maps';

// A tool can say what it expects the file to hold right now (`expect`: the text it last read or wrote, or null for
// "must not exist yet"). If the file has changed since, because the other tool or a git checkout wrote it, the
// write is refused instead of silently undoing that change.
function checkExpect(path: string, expect: unknown): void {
  if (expect === undefined) return;
  const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (now !== expect) {
    throw Object.assign(new Error(now === null ? 'the file was deleted since this tool read it' : 'the file changed on disk since this tool read it (another tool or a git command wrote it)'), { status: 409 });
  }
}

function readBody(req: IncomingMessage, run: (body: Record<string, unknown>) => string, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('POST only');
    return;
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      res.end(run(JSON.parse(body) as Record<string, unknown>));
    } catch (e) {
      res.statusCode = (e as { status?: number }).status ?? 400;
      res.end(String(e instanceof Error ? e.message : e));
    }
  });
}

// A file the tools just saved would normally make Vite reload every open page, including the tool itself, which
// would throw away its undo history and selection. Instead, pages are sent a "swimply:data" message: the game
// reloads to show the change, the tools decide for themselves.
export function dataApi(): Plugin {
  const savedByTool = new Map<string, number>();
  return {
    name: 'swimply-data-api',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use('/__swimply/save', (req, res) => readBody(req, (b) => {
        const { file, text } = b;
        if (typeof file !== 'string' || !WRITABLE.test(file)) throw new Error(`not a writable data file: ${file}`);
        if (typeof text !== 'string') throw new Error('no text');
        JSON.parse(text);
        const path = resolve(file);
        checkExpect(path, b.expect);
        savedByTool.set(path, Date.now());
        writeFileSync(path, text);
        return 'ok';
      }, res));

      server.middlewares.use('/__swimply/delete', (req, res) => readBody(req, (b) => {
        const { file } = b;
        if (typeof file !== 'string' || !MAP_FILE.test(file)) throw new Error(`only map files can be deleted: ${file}`);
        const path = resolve(file);
        checkExpect(path, b.expect);
        savedByTool.set(path, Date.now());
        if (existsSync(path)) unlinkSync(path);
        return 'ok';
      }, res));

      // Every map file's text as it is on disk now, keyed by map id.
      server.middlewares.use('/__swimply/maps', (_req, res) => {
        const out: Record<string, string> = {};
        for (const name of readdirSync(MAPS_DIR)) {
          if (MAP_FILE.test(`${MAPS_DIR}/${name}`)) out[name.replace(/\.json$/, '')] = readFileSync(resolve(MAPS_DIR, name), 'utf8');
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out));
      });

      // One data file's text as it is on disk now.
      server.middlewares.use('/__swimply/read', (req, res) => {
        const file = new URL(req.url ?? '', 'http://x').searchParams.get('file') ?? '';
        if (!WRITABLE.test(file) || !existsSync(resolve(file))) {
          res.statusCode = 404;
          return res.end('no such data file');
        }
        res.end(readFileSync(resolve(file), 'utf8'));
      });
    },
    // Runs after Vite's own handling (enforce: 'post'), so it also catches a new or deleted map file, which Vite would
    // otherwise answer by reloading every page that lists the maps. The modules are still marked stale, so the next
    // page load reads the new files.
    hotUpdate({ file, modules }) {
      if (this.environment.name !== 'client') return;
      const at = savedByTool.get(file);
      if (at === undefined || Date.now() - at > 3000) return;
      savedByTool.delete(file);
      for (const m of modules) this.environment.moduleGraph.invalidateModule(m);
      this.environment.hot.send({ type: 'custom', event: 'swimply:data', data: { file } });
      return [];
    },
  };
}
