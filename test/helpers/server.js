import { once } from 'node:events';
import { createApp } from '../../src/core/app.js';
import { createLogger } from '../../src/core/logger.js';
import { accessLog } from '../../src/middleware/access-log.js';
import { bodyParser } from '../../src/middleware/body-parser.js';
import { cors } from '../../src/middleware/cors.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { requestId } from '../../src/middleware/request-id.js';
import { routerMiddleware } from '../../src/middleware/router.js';

const defaultLogger = createLogger({
  level: 'error',
  service: 'test',
  write: () => {},
});

export function buildTestApp({
  router,
  config = {},
  limits = { bodyBytes: 1_048_576 },
  logger = defaultLogger,
  additionalMiddleware = [],
  pipeline,
} = {}) {
  const middleware = pipeline ?? [
    errorHandler(),
    requestId,
    accessLog(),
    cors({ origins: config.corsOrigins ?? ['http://localhost:5173'] }),
    bodyParser({ limit: limits.bodyBytes }),
    ...additionalMiddleware,
    routerMiddleware(router),
  ];

  return createApp({
    logger,
    middleware,
  });
}

export async function startTestServer(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      server.closeAllConnections(); // fetch giữ keep-alive, không đóng thì test treo
      server.close();
      await once(server, 'close');
    },
  };
}
