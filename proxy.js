const http = require('http');
const httpProxy = require('http-proxy');
const PROXY_PORT = 3000;
const AUTH_PORT = 8010;
const USER_PORT = 8011;
const PAYMENT_PORT = 8012;

const TARGETS = {
  AUTH: `http://127.0.0.1:${AUTH_PORT}`,
  USER: `http://127.0.0.1:${USER_PORT}`,
  PAYMENT: `http://127.0.0.1:${PAYMENT_PORT}`,
};

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

// Attach CORS headers to proxied responses
proxy.on('proxyRes', (proxyRes, req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    proxyRes.headers['access-control-allow-origin'] = origin;
    proxyRes.headers['access-control-allow-credentials'] = 'true';
    proxyRes.headers['access-control-allow-methods'] = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
    proxyRes.headers['access-control-allow-headers'] =
      req.headers['access-control-request-headers'] ||
      'Content-Type,Authorization,X-Requested-With,X-CSRF-Token,x-csrf-token,Accept,Origin,Range,Cookie,x-razorpay-signature,ngrok-skip-browser-warning';
    proxyRes.headers['access-control-expose-headers'] = 'Set-Cookie,Content-Range,X-Content-Range';
  }
});

proxy.on('error', (err, req, res) => {
  const method = req?.method || 'WS';
  const url = req?.url || '';
  console.error(`\x1b[31m[Proxy Error]\x1b[0m ${method} ${url}: ${err.message}`);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    const origin = (req.headers && req.headers.origin) || '*';
    res.writeHead(502, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end(
      JSON.stringify({
        statusCode: 502,
        error: 'Bad Gateway',
        message: `Proxy failed to connect to upstream service: ${err.message}`,
      })
    );
  } else if (res && typeof res.destroy === 'function') {
    res.destroy();
  }
});

function resolveTarget(url = '') {
  if (url.startsWith('/api/auth')) {
    return { name: 'auth-service', target: TARGETS.AUTH, port: AUTH_PORT };
  }
  if (url.startsWith('/api/payments')) {
    return { name: 'payment-service', target: TARGETS.PAYMENT, port: PAYMENT_PORT };
  }
  return { name: 'user-service', target: TARGETS.USER, port: USER_PORT };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '*';

  // Handle CORS preflight OPTIONS request directly in proxy
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':
        req.headers['access-control-request-headers'] ||
        'Content-Type,Authorization,X-Requested-With,X-CSRF-Token,x-csrf-token,Accept,Origin,Range,Cookie,x-razorpay-signature,ngrok-skip-browser-warning',
      'Access-Control-Expose-Headers': 'Set-Cookie,Content-Range,X-Content-Range',
      'Access-Control-Max-Age': '86400',
      'Content-Length': '0',
    });
    res.end();
    return;
  }

  const { name, target, port } = resolveTarget(req.url);

  console.log(
    `\x1b[36m[Proxy ${PROXY_PORT}]\x1b[0m \x1b[33m${req.method}\x1b[0m ${req.url} -> \x1b[32m${name} (${port})\x1b[0m`
  );

  proxy.web(req, res, { target }, (err) => {
    console.error(`[Proxy Forward Error] ${name}:`, err.message);
  });
});

// WebSocket support (Socket.io)
server.on('upgrade', (req, socket, head) => {
  const { name, target } = resolveTarget(req.url);
  console.log(`\x1b[35m[Proxy WS]\x1b[0m Upgrade ${req.url} -> ${name}`);

  socket.on('error', (err) => {
    console.error(`\x1b[31m[Proxy WS Client Socket Error]\x1b[0m: ${err.message}`);
  });

  proxy.ws(req, socket, head, { target }, (err) => {
    if (err) {
      console.error(`\x1b[31m[Proxy WS Error]\x1b[0m: ${err.message}`);
      if (socket && !socket.destroyed && typeof socket.destroy === 'function') {
        socket.destroy();
      }
    }
  });
});

process.on('uncaughtException', (err) => {
  console.error('\x1b[31m[Proxy Uncaught Exception]:\x1b[0m', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('\x1b[31m[Proxy Unhandled Rejection]:\x1b[0m', reason);
});

server.listen(PROXY_PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 POOJAWALA LOCAL PROXY GATEWAY RUNNING ON PORT ${PROXY_PORT}`);
  console.log(`======================================================`);
  console.log(`👉 Auth Service:    /api/auth/*     -> ${TARGETS.AUTH}`);
  console.log(`👉 Payment Service: /api/payments/* -> ${TARGETS.PAYMENT}`);
  console.log(`👉 User Service:    /* (Default)    -> ${TARGETS.USER}`);
  console.log(`👉 CORS Support:    Full preflight (OPTIONS) & credentials enabled`);
  console.log(`👉 Ngrok Target:    Pass traffic to port ${PROXY_PORT}`);
  console.log(`======================================================\n`);
});
