// apps/frontend/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.PROXY_TARGET || 'https://rakie-backend.onrender.com';

  app.use(
    ['/api', '/healthz', '/ping'],
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      logLevel: 'silent',
    })
  );
};
