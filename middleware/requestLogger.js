/**
 * Request logger middleware
 * Logs all incoming API requests with method, path, and response time.
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, path: urlPath } = req;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${statusColor}[${method}]\x1b[0m ${urlPath} → ${res.statusCode} (${ms}ms)`);
  });

  next();
}

module.exports = { requestLogger };

