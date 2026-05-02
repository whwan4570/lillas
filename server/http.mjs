import { config } from './config.mjs';

function resolveAllowedOrigin(req) {
  const requestOrigin = String(req?.headers?.origin ?? '').trim();
  if (!requestOrigin) return config.frontendOrigin;
  if (config.frontendOrigins.includes(requestOrigin)) return requestOrigin;
  return config.frontendOrigin;
}

export function json(res, statusCode, body) {
  const allowedOrigin = resolveAllowedOrigin(res.req);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    Vary: 'Origin'
  });
  res.end(JSON.stringify(body));
}

export function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 12_000_000) reject(new Error('Body too large (max 12MB)'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
