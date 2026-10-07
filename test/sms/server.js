/**
 * Fast2SMS Local Test Server
 * Serves the UI at http://localhost:3333 and handles the API call to Fast2SMS
 * completely bypassing browser CORS restrictions.
 *
 * Run:
 *   node test/sms/server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3333;

// Load .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[trimmed.slice(0, eqIdx).trim()] = val;
    }
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.FAST2SMS_API_KEY;

function normalizeMobile(mobile) {
  let cleaned = String(mobile).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
  return cleaned;
}

function sendFast2Sms(mobile, message, apiKeyToUse) {
  const key = apiKeyToUse || API_KEY;
  if (!key) {
    return Promise.reject(new Error('No FAST2SMS_API_KEY found in .env or request'));
  }

  const payload = JSON.stringify({
    route: 'q',
    message: message,
    numbers: normalizeMobile(mobile),
  });

  const options = {
    hostname: 'www.fast2sms.com',
    port: 443,
    path: '/dev/bulkV2',
    method: 'POST',
    headers: {
      'authorization': key,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // Serve test UI
  if (url === '/' || url === '/index.html') {
    const htmlPath = path.resolve(__dirname, 'fast2sms-tester.html');
    if (!fs.existsSync(htmlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('fast2sms-tester.html not found');
      return;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // API proxy endpoint
  if (url === '/api/send-sms' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { mobile, message, apiKey } = JSON.parse(body);
        if (!mobile || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ return: false, message: 'mobile and message are required' }));
          return;
        }

        console.log(`[Proxy] Sending SMS to …${String(mobile).slice(-4)}`);
        const result = await sendFast2Sms(mobile, message, apiKey);
        console.log(`[Proxy] Response:`, result);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[Proxy] Error:`, err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ return: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Fast2SMS Test Server running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`======================================================`);
  console.log(`• Reads FAST2SMS_API_KEY from .env: ${API_KEY ? '✅ Found' : '❌ Not Found'}`);
  console.log(`• Open http://localhost:${PORT} in your browser to test!`);
  console.log(`• Press Ctrl+C to stop.\n`);
});
