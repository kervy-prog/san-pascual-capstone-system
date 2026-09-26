import http from 'node:http';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const frontendHost = process.env.FRONTEND_HOST || '0.0.0.0';
const frontendPort = Number(process.env.FRONTEND_PORT || 5500);
const apiProxyHost = process.env.API_PROXY_HOST || '127.0.0.1';
const apiProxyPort = Number(process.env.API_PROXY_PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function proxyApiRequest(request, response) {
  const apiRequest = http.request({
    hostname: apiProxyHost,
    port: apiProxyPort,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: `${apiProxyHost}:${apiProxyPort}` },
  }, (apiResponse) => {
    response.writeHead(apiResponse.statusCode || 502, apiResponse.headers);
    apiResponse.pipe(response);
  });

  apiRequest.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'API is unavailable' }));
  });

  request.pipe(apiRequest);
}

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith('/api/') || request.url === '/health' || request.url === '/health/db') {
    proxyApiRequest(request, response);
    return;
  }

  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.resolve(frontendDirectory, `.${requestedPath}`);

  if (!filePath.startsWith(frontendDirectory)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(frontendPort, frontendHost, () => {
  console.log(`San Pascual frontend listening on http://${frontendHost}:${frontendPort}`);
});