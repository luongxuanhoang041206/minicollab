import { once } from 'node:events';

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
