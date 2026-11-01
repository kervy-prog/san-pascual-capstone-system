import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '..', 'public');
const output = path.join(directory, 'www');
const apiUrl = 'https://san-pascual-capstone-system.vercel.app';

await fs.mkdir(output, { recursive: true });
await fs.cp(source, output, { recursive: true });
await fs.writeFile(path.join(output, 'config.js'), `window.SAN_PASCUAL_API_URL = ${JSON.stringify(apiUrl)};\n`);
await build({
  entryPoints: [path.join(directory, 'native.js')],
  outfile: path.join(output, 'native.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
});
for (const name of await fs.readdir(output)) {
  if (!name.endsWith('.html')) continue;
  const filename = path.join(output, name);
  const html = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, html.replace('</head>', '  <script src="/native.js"></script>\n</head>'));
}
console.log('Bundled Android UI with HTTPS production API.');
