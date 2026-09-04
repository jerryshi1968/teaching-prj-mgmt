import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../packages/', import.meta.url));
const forbidden = [
  ['/api/' + 'cpp', 'fixed C++ API path'],
  ['/api/' + 'projects', 'fixed project API path'],
  ['/api/' + 'project-groups', 'fixed group API path'],
  ['teaching' + '_token', 'host login key'],
  ['project' + '_type', 'host project discriminator'],
  ['local' + 'Storage', 'host storage access'],
  ['document.' + 'cookie', 'host cookie access'],
  ['fetch' + '(', 'direct network request'],
  ['G:' + '\\teaching-', 'business repository path']
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else if (['.js', '.jsx', '.css'].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

const packageDirectories = await readdir(packageRoot, { withFileTypes: true });
const violations = [];
for (const packageDirectory of packageDirectories) {
  if (!packageDirectory.isDirectory()) continue;
  const sourceDirectory = join(packageRoot, packageDirectory.name, 'src');
  for (const filePath of await collectFiles(sourceDirectory)) {
    const source = await readFile(filePath, 'utf8');
    for (const [pattern, label] of forbidden) {
      if (source.includes(pattern)) violations.push(`${filePath}: ${label}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Runtime source boundary check passed.');
}
