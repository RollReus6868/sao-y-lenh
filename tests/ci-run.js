// Runs a command, echoes its output, and on failure emits the tail as one GitHub
// ::error annotation (job logs cannot be read from the session, annotations can).
// Usage: node tests/ci-run.js "<title>" <cmd> [args...]
'use strict';
const { spawn } = require('child_process');

const [title, cmd, ...args] = process.argv.slice(2);
let out = '';
const p = spawn(cmd, args, { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
p.stdout.on('data', (d) => { process.stdout.write(d); out += d; });
p.stderr.on('data', (d) => { process.stderr.write(d); out += d; });
p.on('exit', (code) => {
  if (code !== 0) {
    const tail = out.slice(-6000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=${title} (exit ${code})::${tail}`);
  }
  process.exit(code === null ? 1 : code);
});
