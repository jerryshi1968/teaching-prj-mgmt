import { copyFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const packages = [
  { name: 'organizer-contracts', external: [] },
  { name: 'organizer-core', external: ['@tigao/organizer-contracts'] },
  {
    name: 'organizer-react',
    external: [
      '@tigao/organizer-contracts',
      '@tigao/organizer-core',
      'react',
      'react/jsx-runtime',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities'
    ]
  },
  {
    name: 'organizer-contract-tests',
    external: ['@tigao/organizer-contracts', '@tigao/organizer-core']
  }
];

for (const packageConfig of packages) {
  const packageRoot = new URL(`../packages/${packageConfig.name}/`, import.meta.url);
  await rm(new URL('dist/', packageRoot), { recursive: true, force: true });
  await build({
    entryPoints: [new URL('src/index.js', packageRoot).pathname.slice(1)],
    outfile: new URL('dist/index.js', packageRoot).pathname.slice(1),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    jsx: 'automatic',
    external: packageConfig.external,
    legalComments: 'none'
  });
  await copyFile(new URL('src/index.d.ts', packageRoot), new URL('dist/index.d.ts', packageRoot));

  if (packageConfig.name === 'organizer-react') {
    await build({
      entryPoints: [new URL('src/styles.css', packageRoot).pathname.slice(1)],
      outfile: new URL('dist/styles.css', packageRoot).pathname.slice(1),
      bundle: true,
      minify: false,
      sourcemap: true,
      legalComments: 'none'
    });
  }
}
