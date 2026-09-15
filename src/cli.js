#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { convertMermaidFlowchartToD2 } from './convert.js';

function usage() {
  return `mmd2d2 - Mermaid flowchart to D2/TALA converter

Usage:
  mmd2d2 input.mmd [-o output.d2]
  mmd2d2 input.mmd --render output.svg [--d2-bin d2] [--seed 42]
  cat input.mmd | mmd2d2 -

Options:
  -o, --output <file>   Write D2 source (default: stdout)
  --render <file>       Render with D2 using the TALA layout
  --d2-bin <path>       D2 executable (default: d2)
  --seed <number>       Pass a deterministic TALA seed
  --strict              Fail on unsupported Mermaid statements
  -h, --help            Show help
`;
}

function parseArgs(argv) {
  const out = { input: null, output: null, render: null, d2bin: 'd2', seed: null, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '-o' || a === '--output') out.output = argv[++i];
    else if (a === '--render') out.render = argv[++i];
    else if (a === '--d2-bin') out.d2bin = argv[++i];
    else if (a === '--seed') out.seed = argv[++i];
    else if (a === '--strict') out.strict = true;
    else if (a.startsWith('-') && a !== '-') throw new Error(`Unknown option: ${a}`);
    else if (out.input === null) out.input = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited with ${code}`)));
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 2);
  }
  const mermaid = args.input === '-' ? await readStdin() : await readFile(args.input, 'utf8');
  const { d2, warnings } = convertMermaidFlowchartToD2(mermaid, { strict: args.strict });
  for (const w of warnings) process.stderr.write(`warning: line ${w.line}: ${w.message}\n`);

  let d2Path = args.output;
  if (args.render && !d2Path) {
    const base = resolve(args.render);
    d2Path = base.slice(0, base.length - extname(base).length) + '.d2';
  }
  if (d2Path) {
    await mkdir(dirname(resolve(d2Path)), { recursive: true });
    await writeFile(d2Path, d2, 'utf8');
  } else {
    process.stdout.write(d2);
  }

  if (args.render) {
    await mkdir(dirname(resolve(args.render)), { recursive: true });
    const renderArgs = ['--layout', 'tala'];
    if (args.seed !== null) renderArgs.push('--tala-seeds', String(args.seed));
    renderArgs.push(d2Path, args.render);
    await run(args.d2bin, renderArgs);
  }
} catch (error) {
  process.stderr.write(`error: ${error.message}\n`);
  process.exit(1);
}
