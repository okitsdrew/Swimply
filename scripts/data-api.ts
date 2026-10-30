import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Lets the tools (asset maker, later the level editor) save JSON into src/data/ while `npm run dev` runs. It only
// exists on the dev server, so the built game has no way to write files. Only the data files listed here can be
// written, so a bug in a tool can never overwrite code.
const WRITABLE = /^src\/data\/(assets|floors|sprites)\.json$|^src\/data\/maps\/[a-z0-9_-]+\.json$/;

// A file the tools just saved would normally make Vite reload every open page, including the tool itself, which
// would throw away its undo history and selection. Instead, pages are sent a "swimply:data" message: the game
// reloads to show the change, the tool ignores it because it already has the new data.
export function dataApi(): Plugin {
  const savedByTool = new Map<string, number>();
  return {
    name: 'swimply-data-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__swimply/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { file, text } = JSON.parse(body) as { file: string; text: string };
            if (typeof file !== 'string' || !WRITABLE.test(file)) throw new Error(`not a writable data file: ${file}`);
            if (typeof text !== 'string') throw new Error('no text');
            JSON.parse(text);
            const path = resolve(file);
            savedByTool.set(path, Date.now());
            writeFileSync(path, text);
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e instanceof Error ? e.message : e));
          }
        });
      });
    },
    handleHotUpdate(ctx) {
      const at = savedByTool.get(ctx.file);
      if (at === undefined || Date.now() - at > 3000) return;
      savedByTool.delete(ctx.file);
      ctx.server.ws.send({ type: 'custom', event: 'swimply:data', data: { file: ctx.file } });
      return [];
    },
  };
}
