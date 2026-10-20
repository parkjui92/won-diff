import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = await build({
  entryPoints: ['src/app.ts'], bundle: true, platform: 'browser', target: 'es2022',
  format: 'iife', outfile: 'offline.js', write: false, minify: true
});
const js = output.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = output.outputFiles.find(f => f.path.endsWith('.css')).text;
const hash = createHash('sha256').update(js).digest('base64');
let html = await readFile('index.html', 'utf8');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'">`);
html = html.replace('</head>', () => `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/app.ts"></script>', () => `<script>${js}</script>`);
await writeFile('dist/won-diff.html', html);
console.log(`Offline HTML: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB`);
