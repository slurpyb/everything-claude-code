#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { discoverInstalledStates } = require('./lib/install-lifecycle');
const { SUPPORTED_INSTALL_TARGETS } = require('./lib/install-manifests');

const SURFACE_DIRS = ['skills', 'agents', 'commands', 'plugins', 'hooks', 'rules', 'mcp-configs'];
const SURFACE_FILES = ['settings.json', 'CLAUDE.md', 'AGENTS.md', '.mcp.json', 'marketplace.json', 'plugin.json'];

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort();
  } catch {
    return null;
  }
}

function collectSurface(root) {
  const dirs = {};
  for (const name of SURFACE_DIRS) {
    const entries = listDir(path.join(root, name));
    if (entries !== null) dirs[name] = entries;
  }
  const files = SURFACE_FILES.filter(name => fs.existsSync(path.join(root, name)));
  return { dirs, files };
}

function printSurface(root) {
  const { dirs, files } = collectSurface(root);
  console.log('  Surface:');
  console.log(`    Files present: ${files.join(', ') || '(none)'}`);
  for (const [name, entries] of Object.entries(dirs)) {
    console.log(`    ${name} (${entries.length}): ${entries.join(', ') || '(empty)'}`);
  }
}

function showHelp(exitCode = 0) {
  console.log(`
Usage: node scripts/list-installed.js [--target <${SUPPORTED_INSTALL_TARGETS.join('|')}>] [--json] [--verbose]

Inspect ECC install-state files for the current home/project context.

  --verbose   Also enumerate the on-disk surface (skills, agents, commands,
              plugins, hooks, rules, settings files) under each target root.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    targets: [],
    json: false,
    help: false,
    verbose: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--target') {
      parsed.targets.push(args[index + 1] || null);
      index += 1;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHuman(records, { verbose = false } = {}) {
  if (records.length === 0) {
    console.log('No ECC install-state files found for the current home/project context.');
    return;
  }

  console.log('Installed ECC targets:\n');
  for (const record of records) {
    if (record.error) {
      console.log(`- ${record.adapter.id}: INVALID (${record.error})`);
      continue;
    }

    const state = record.state;
    console.log(`- ${record.adapter.id}`);
    console.log(`  Root: ${state.target.root}`);
    console.log(`  Installed: ${state.installedAt}`);
    console.log(`  Profile: ${state.request.profile || '(legacy/custom)'}`);
    console.log(`  Modules: ${(state.resolution.selectedModules || []).join(', ') || '(none)'}`);
    console.log(`  Legacy languages: ${(state.request.legacyLanguages || []).join(', ') || '(none)'}`);
    console.log(`  Source version: ${state.source.repoVersion || '(unknown)'}`);
    if (verbose) {
      printSurface(state.target.root);
    }
  }
}

function main() {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      showHelp(0);
    }

    const records = discoverInstalledStates({
      homeDir: process.env.HOME || os.homedir(),
      projectRoot: process.cwd(),
      targets: options.targets,
    }).filter(record => record.exists);

    if (options.json) {
      const payload = { records };
      if (options.verbose) {
        payload.surfaces = records
          .filter(record => record.exists && !record.error)
          .map(record => ({
            adapterId: record.adapter.id,
            root: record.state.target.root,
            ...collectSurface(record.state.target.root),
          }));
      }
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    printHuman(records, { verbose: options.verbose });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
