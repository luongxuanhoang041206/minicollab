import http from 'node:http';
import { once } from 'node:events';
import autocannon from 'autocannon';
import { compose } from '../src/core/pipeline.js';
import { createApp } from '../src/core/app.js';
import { createLogger } from '../src/core/logger.js';
import { createRouter } from '../src/core/router/index.js';
import { sendJson } from '../src/core/response.js';
import { accessLog } from '../src/middleware/access-log.js';
import { bodyParser } from '../src/middleware/body-parser.js';
import { cors } from '../src/middleware/cors.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';
import { routerMiddleware } from '../src/middleware/router.js';

const sizes = [0, 1, 5, 20, 100];
const iterations = 20_000;
const warmupIterations = 2_000;

async function benchmarkCompose(size) {
  const noop = async (_ctx, next) => next();
  const run = compose(Array.from({ length: size }, () => noop));
  for (let i = 0; i < warmupIterations; i += 1) {
    await run({});
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    await run({});
  }
  return Number(process.hrtime.bigint() - start) / iterations;
}

async function startAndBench(label, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const result = await new Promise((resolve, reject) => {
    autocannon(
      {
        url: `http://127.0.0.1:${port}/health`,
        connections: 100,
        duration: 30,
      },
      (error, stats) => (error ? reject(error) : resolve(stats)),
    );
  });

  console.log(
    `${label}: ${Math.round(result.requests.average)} req/s, p99 ${result.latency.p99} ms, ${result.errors} errors`,
  );

  server.closeAllConnections();
  const closed = once(server, 'close');
  server.close();
  await closed;
}

function createBareServer() {
  return http.createServer((_req, res) => sendJson(res, 200, { status: 'ok' }));
}

function createPipelineServer(logLevel, extraMiddlewareCount = 0) {
  const logger = createLogger({
    level: logLevel,
    service: 'bench',
    write: () => {},
  });
  const router = createRouter();
  router.get('/health', (ctx) => ctx.json(200, { status: 'ok' }));
  const noop = async (_ctx, next) => next();

  return createApp({
    logger,
    middleware: [
      errorHandler(),
      requestId,
      accessLog(),
      cors({ origins: ['http://localhost:5173'] }),
      bodyParser(),
      ...Array.from({ length: extraMiddlewareCount }, () => noop),
      routerMiddleware(router),
    ],
  });
}

console.log(
  'Prediction: empty middleware add a small, roughly linear Promise-dispatch cost; 20 should be minor beside HTTP work.',
);
console.log(`compose warm-up: ${warmupIterations}; measured runs: ${iterations}`);
for (const size of sizes) {
  const nsPerRun = await benchmarkCompose(size);
  console.log(`${size} middleware: ${nsPerRun.toFixed(0)} ns/run`);
}

if (process.argv.includes('--http')) {
  console.log('HTTP benchmark prediction: logging at info costs more than warn; 20 no-op middleware add less.');
  console.log('Each case uses autocannon -c 100 -d 30 against /health.');
  await startAndBench('M2 bare handler', createBareServer());
  await startAndBench('M3 full, LOG_LEVEL=warn', createPipelineServer('warn'));
  await startAndBench('M3 full, LOG_LEVEL=info', createPipelineServer('info'));
  await startAndBench(
    'M3 full + 20 empty middleware',
    createPipelineServer('warn', 20),
  );
}
