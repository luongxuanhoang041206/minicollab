import http from 'node:http';
import { createContext } from './context.js';
import { compose } from './pipeline.js';
import { sendJson } from './response.js';

export function createApp({ logger, middleware, timeouts = {} } = {}) {
  if (!logger || !Array.isArray(middleware)) {
    throw new TypeError('createApp requires a logger and middleware array');
  }

  const run = compose(middleware);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ctx = createContext({ req, res, url, logger });

    try {
      await run(ctx);
    } catch (err) {
      logger.error('unhandled_in_pipeline', {
        err: String(err?.stack ?? err),
      });
      if (!res.headersSent) {
        sendJson(res, 500, { error: { code: 'internal_error' } });
      } else {
        res.destroy();
      }
      return;
    }

    if (!res.writableEnded && !res.destroyed) {
      logger.error('pipeline_finished_without_response', {
        path: url.pathname,
      });
      if (!res.headersSent) {
        sendJson(res, 500, { error: { code: 'no_response' } });
      } else {
        res.end();
      }
    }
  });

  if (timeouts.headersTimeout) server.headersTimeout = timeouts.headersTimeout;
  if (timeouts.requestTimeout) server.requestTimeout = timeouts.requestTimeout;
  if (timeouts.keepAliveTimeout) server.keepAliveTimeout = timeouts.keepAliveTimeout;

  server.on('clientError', (err, socket) => {
    logger.warn('Client HTTP parse error', { error: err.message });
    if (socket.writable) {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n400 Bad Request\r\n',
      );
    } else {
      socket.destroy(err);
    }
  });

  return server;
}
