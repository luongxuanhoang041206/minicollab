import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function requestId(ctx, next) {
    const incomingRequestId = ctx.req.headers['x-request-id'];

    const requestId =
        typeof incomingRequestId === 'string' &&
        REQUEST_ID_PATTERN.test(incomingRequestId)
            ? incomingRequestId
            : randomUUID();

    ctx.requestId = requestId;

    ctx.logger = ctx.logger.child({
        requestId,
    });

    ctx.res.setHeader('x-request-id', requestId);

    await next();
}