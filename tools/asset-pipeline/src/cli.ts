import { loadConfig } from './schema';

const HELP = `signal-lost asset pipeline

Usage: pnpm asset:build [--help]

  -h, --help    show this help and exit

By default it loads and validates pipeline.config.json against the schema.
The optimize / budget-check / manifest steps (gltf-transform + KTX2) land in M2 (T36/T37).
`;

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const config = loadConfig();
  const typeCount = Object.keys(config.budgets.per_glb).length;
  process.stdout.write(
    `asset pipeline · config OK — first-load budget ${config.budgets.slice_first_load_mb}MB, ` +
      `${typeCount} asset-type budgets, default codec "${config.codec.default}", ` +
      `${config.codec.lods.length} LODs.\n`,
  );
}

main(process.argv.slice(2));
