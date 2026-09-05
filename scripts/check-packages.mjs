import { access, readFile } from 'node:fs/promises';

const expectedDependencies = {
  'organizer-contracts': [],
  'organizer-core': ['@tigao/organizer-contracts'],
  'organizer-react': ['@tigao/organizer-contracts', '@tigao/organizer-core'],
  'organizer-contract-tests': ['@tigao/organizer-contracts', '@tigao/organizer-core']
};

for (const [directory, expected] of Object.entries(expectedDependencies)) {
  const packageFile = new URL(`../packages/${directory}/package.json`, import.meta.url);
  const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
  const actual = Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith('@tigao/')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected.sort())) {
    throw new Error(`${manifest.name} has an invalid workspace dependency direction.`);
  }
  if (manifest.version !== '0.1.2' || manifest.private !== true || manifest.type !== 'module') {
    throw new Error(`${manifest.name} must be private ESM version 0.1.2.`);
  }
  await access(new URL(`../packages/${directory}/src/index.js`, import.meta.url));
}

console.log('Package manifests and dependency directions are valid.');
