export function sendJson(res, statusCode, data) {
    const payload = JSON.stringify(data);

    const contentLength = Buffer.byteLength(payload, 'utf8');

    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': contentLength,
        'X-Powered-By': 'MiniCollab'
    })

    res.end(payload);
}

