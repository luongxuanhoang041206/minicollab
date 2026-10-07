import { badRequest, payloadTooLarge } from '../core/errors.js';

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function bodyParser({ limit = 1_048_576 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError('bodyParser limit must be a non-negative safe integer');
  }

  return async function bodyParserMiddleware(ctx, next) {
    const { req } = ctx;
    ctx.bodyLimit = limit;
    const contentType = req.headers['content-type'];
    if (
      !BODY_METHODS.has(req.method) ||
      typeof contentType !== 'string' ||
      !JSON_CONTENT_TYPE.test(contentType)
    ) {
      await next();
      return;
    }

    const contentLength = req.headers['content-length'];
    if (contentLength !== undefined && Number(contentLength) > limit) {
      drainRequest(req, ctx.logger);
      throw payloadTooLarge(limit);
    }

    const chunks = [];
    const body = await readRequest(req, chunks, limit, ctx.logger);

    if (body === null) {
      return;
    }
    if (body.length === 0) {
      ctx.body = undefined;
    } else {
      try {
        ctx.body = JSON.parse(body.toString('utf8'));
      } catch (cause) {
        throw badRequest('invalid_json', undefined, { cause });
      }
    }

    await next();
  };
}

function readRequest(req, chunks, limit, logger) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;

    const removeBodyListeners = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('aborted', onAborted);
    };
    const removeDrainListeners = () => {
      req.removeListener('error', onError);
      req.removeListener('close', removeDrainListeners);
      req.removeListener('end', removeDrainListeners);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        settled = true;
        chunks.length = 0;
        removeBodyListeners();
        req.once('close', removeDrainListeners);
        req.once('end', removeDrainListeners);
        req.removeListener('error', onError);
        req.on('error', onError);
        req.resume();
        reject(payloadTooLarge(limit));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (!settled) {
        settled = true;
        removeBodyListeners();
        resolve(Buffer.concat(chunks));
      }
      removeDrainListeners();
    };
    const onAborted = () => {
      if (!settled) {
        settled = true;
        removeBodyListeners();
        resolve(null);
      }
    };
    const onError = (error) => {
      if (settled) {
        if (error.code !== 'ECONNRESET') {
          logger.error('request_body_stream_error', {
            err: String(error.stack ?? error),
          });
        }
        return;
      }
      settled = true;
      removeBodyListeners();
      if (error.code === 'ECONNRESET' || req.aborted) {
        resolve(null);
      } else {
        reject(error);
      }
    };

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('aborted', onAborted);
    req.once('error', onError);
  });
}

function drainRequest(req, logger) {
  const onError = (error) => {
    if (error.code !== 'ECONNRESET') {
      logger.error('request_body_stream_error', {
        err: String(error.stack ?? error),
      });
    }
  };
  const cleanup = () => req.removeListener('error', onError);
  req.on('error', onError);
  req.once('end', cleanup);
  req.once('close', cleanup);
  req.resume();
}