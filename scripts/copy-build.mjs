import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (dirname(output) !== root) throw new Error('Build output must stay inside the project.');
// Fixed build-output directory only; never mix artifacts from different base paths.
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
await cp(resolve(root, 'apps/web/out'),output,{recursive:true});
await writeFile(resolve(output, '.nojekyll'), '');
