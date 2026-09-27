import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = process.env.SAN_PASCUAL_API_URL || '';

await fs.writeFile(
  path.join(projectDirectory, 'public', 'config.js'),
  `window.SAN_PASCUAL_API_URL = ${JSON.stringify(apiUrl)} || window.location.origin;\n`,
);