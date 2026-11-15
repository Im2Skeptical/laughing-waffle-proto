import http from 'node:http';

// Short-lived tooling clients must release sockets and deadlines explicitly.
// Node 24 on Windows can assert during fetch/Undici teardown after a failure.
export function requestPreview(url, { method = 'GET', headers, timeout = 800, maxBytes = 1_048_576 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, headers, agent: false }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) request.destroy(new Error('Preview response exceeds size limit'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: { get: name => response.headers[name.toLowerCase()] ?? null },
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
    // A wall-clock deadline covers connections, headers AND stalled bodies.
    const timer = setTimeout(() => request.destroy(Object.assign(new Error('Preview request timed out'), { code: 'ETIMEDOUT' })), timeout);
    request.once('close', () => clearTimeout(timer));
    request.once('error', reject);
    request.end();
  });
}
