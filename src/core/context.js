import { sendJson } from './response.js';

export function createContext({ req, res, url, logger }) {
  return {
    req, res, url,
    query: parseQuery(url.searchParams),
    params: {},                            // router sẽ gán
    state: {},                             // nơi middleware để lại dữ liệu cho handler (ví dụ user ở M4)
    body: undefined,                       // bodyParser gán
    requestId: undefined,                  // requestId middleware gán
    logger,
    json(status, data) { sendJson(res, status, data); },
  };
}

function parseQuery(searchParams) {
  const query = Object.create(null);
  for (const [key, value] of searchParams) {
    query[key] = key in query ? [].concat(query[key], value) : value;
  }
  return query;
}