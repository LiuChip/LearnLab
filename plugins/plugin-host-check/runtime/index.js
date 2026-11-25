/* global require, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */

const { createReadStream, createWriteStream } = require('node:fs');
const { createInterface } = require('node:readline');

// A local development fixture for the private host protocol.
const requests = createWriteStream(null, { fd: 3 });
const responses = createReadStream(null, { fd: 4 });
const lines = createInterface({ input: responses });
const pending = new Map([
  [1, { name: '读取已授权的包摘要', expected: true }],
  [2, { name: '拒绝读取未授权的章节', expected: false }]
]);
const steps = [];

lines.on('line', (line) => {
  const reply = JSON.parse(line);
  const check = pending.get(reply?.id);
  if (!check) return;
  pending.delete(reply.id);
  const passed = check.expected
    ? reply.ok === true && typeof reply.value?.id === 'string'
    : reply.ok === false && reply.error === 'resource_not_allowed';
  steps.push({ name: check.name, status: passed ? 'passed' : 'failed' });
  if (pending.size > 0) return;
  console.log(JSON.stringify({ steps }));
  if (steps.some((step) => step.status === 'failed')) process.exitCode = 1;
  lines.close();
});

lines.on('close', () => {
  if (pending.size > 0) process.exitCode = 1;
  responses.destroy();
});
lines.on('error', () => lines.close());
requests.on('error', () => {
  process.exitCode = 1;
  lines.close();
});

requests.write(JSON.stringify({ id: 1, resource: 'package.manifest' }) + '\n');
requests.end(JSON.stringify({ id: 2, resource: 'package.chapter' }) + '\n');
