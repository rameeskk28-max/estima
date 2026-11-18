#!/usr/bin/env node
// Create a user entry for the APP_USERS environment variable.
//   npm run add-user                       (interactive)
//   npm run add-user -- <username> "<Full Name>"   (password is asked, hidden)
// Paste the printed JSON into Netlify → Site configuration → Environment variables → APP_USERS.
// To add more users, append each printed {..} object to the existing JSON array.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 50000; // keep in sync with netlify/edge-functions/auth.js limits

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (str) => {
  if (!muted || str.includes(':')) write?.(str);
  else if (str.trim()) write?.('*');
};
const lines = [];
let waiting = null;
rl.on('line', (l) => (waiting ? (waiting(l), (waiting = null)) : lines.push(l)));
function ask(q, hidden = false) {
  muted = hidden && process.stdin.isTTY;
  process.stdout.write(q);
  return new Promise((resolve) => {
    const done = (a) => {
      if (muted) process.stdout.write('\n');
      muted = false;
      resolve(a);
    };
    if (lines.length) done(lines.shift());
    else waiting = done;
  });
}

const [, , argUser, argName] = process.argv;
const u = (argUser || (await ask('Username: '))).trim();
const n = (argName || (await ask('Full name (shown in the app): '))).trim() || u;
if (!/^[A-Za-z0-9._@-]{2,64}$/.test(u)) {
  rl.close();
  console.error('Username must be 2-64 characters: letters, digits, . _ @ -');
  process.exit(1);
}
const p1 = await ask('Password (min 8 chars): ', true);
const p2 = await ask('Repeat password: ', true);
if (p1 !== p2) {
  rl.close();
  console.error('Passwords do not match.');
  process.exit(1);
}
if (p1.length < 8) {
  rl.close();
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = pbkdf2Sync(p1, salt, ITERATIONS, 32, 'sha256');
const entry = { u, n, h: `pbkdf2_sha256$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}` };
rl.close();
console.log('\nUser entry:\n' + JSON.stringify(entry));
console.log('\nAPP_USERS value (single user):\n' + JSON.stringify([entry]));
