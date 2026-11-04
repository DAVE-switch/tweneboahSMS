// Explicit Vercel API entry point. The rewrite in vercel.json passes the
// requested API path in __vercel_api_path so every /api/* request reaches the
// shared Neon handler, even when catch-all file routing is not detected.
const handler = require('../server.neon.js');

module.exports = (req, res) => {
  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const requestedPath = requestUrl.searchParams.get('__vercel_api_path');

  if (requestedPath !== null) {
    requestUrl.searchParams.delete('__vercel_api_path');
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${requestedPath}${query ? `?${query}` : ''}`;
  }

  return handler(req, res);
};
