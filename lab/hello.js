import http from 'node:http';

const server = http.createServer((req, res) => {
    res.end('hello');
});

server.listen(3000, () => console.log('listening:3000'));

