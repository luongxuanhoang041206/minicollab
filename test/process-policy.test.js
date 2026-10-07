import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

test('uncaught callback exception is fatal and exits with code 1', async () => {
  const port = await unusedPort();
  const root = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, ['bin/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LOG_LEVEL: 'error',
      AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });

  try {
    const deadline = Date.now() + 5000;
    let response;
    while (!response && Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`server exited before ready: ${output}`);
      }
      try {
        response = await fetch(`http://127.0.0.1:${port}/health`);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.ok(response, 'server did not become ready');
    assert.equal(response.status, 200);
    await response.arrayBuffer();

    const exitPromise = once(child, 'exit');
    const callbackResponse = await fetch(
      `http://127.0.0.1:${port}/_lab/callback-throw`,
    );
    assert.equal(callbackResponse.status, 200);
    await callbackResponse.arrayBuffer();

    const [code] = await Promise.race([
      exitPromise,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('server did not exit after callback exception')),
          5000,
        );
        timer.unref();
      }),
    ]);
    assert.equal(code, 1);
    assert.match(output, /"msg":"fatal"/);
    assert.match(output, /"event":"uncaughtException"/);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
});
