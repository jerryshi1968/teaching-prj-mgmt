import { spawnSync } from 'node:child_process';

const packageNames = [
  '@tigao/organizer-contracts',
  '@tigao/organizer-core',
  '@tigao/organizer-react',
  '@tigao/organizer-contract-tests'
];
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('Run this command through npm so the active npm executable is known.');

for (const packageName of packageNames) {
  const result = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--workspace', packageName], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  const report = JSON.parse(result.stdout)[0];
  const unexpected = report.files.filter(({ path }) => /(^|\/)(test|src|playground|coverage)(\/|$)/.test(path));
  if (unexpected.length > 0) {
    throw new Error(`${packageName} would include non-runtime files: ${unexpected.map(({ path }) => path).join(', ')}`);
  }
  console.log(`${report.filename}: ${report.files.length} files, ${report.size} bytes`);
}
