export class HttpError extends Error {
  constructor(status, code, message, { details, cause, headers } = {}) {
    super(message ?? code, { cause });
    this.name = 'HttpError';
    this.status = status;       // số HTTP
    this.code = code;           // chuỗi máy đọc được: 'not_found', 'invalid_json'...
    this.details = details;     // dữ liệu thêm cho client (có thể undefined)
    this.headers = headers;     // ví dụ { Allow: 'GET, POST' }
    this.expose = status < 500; // có được lộ message ra client không
  }
}

export const badRequest       = (code, msg, o) => new HttpError(400, code, msg, o);
export const unauthorized     = (code = 'unauthorized', msg, o) => new HttpError(401, code, msg, o);
export const forbidden        = (code = 'forbidden', msg, o) => new HttpError(403, code, msg, o);
export const notFound         = (code = 'not_found', msg, o) => new HttpError(404, code, msg, o);
export const methodNotAllowed = (allowed) => new HttpError(405, 'method_not_allowed', undefined, { headers: { Allow: allowed.join(', ') } });
export const payloadTooLarge  = (limit) => new HttpError(413, 'payload_too_large', `Body vượt quá ${limit} byte`);