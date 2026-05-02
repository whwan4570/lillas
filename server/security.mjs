import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function isValidPassword(password) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const attempt = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(attempt, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signToken(userId, tokenSecret) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `${userId}.${exp}`;
  const signature = createHmac('sha256', tokenSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyToken(token, tokenSecret) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, expStr, signature] = raw.split('.');
    if (!userId || !expStr || !signature) return null;
    const payload = `${userId}.${expStr}`;
    const expected = createHmac('sha256', tokenSecret).update(payload).digest('hex');
    if (!timingSafeStringEqual(expected, signature)) return null;
    if (Number(expStr) < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}

export function makeOAuthState(page, tokenSecret) {
  const exp = Date.now() + 1000 * 60 * 10;
  const nonce = randomBytes(8).toString('hex');
  const payload = JSON.stringify({ page, exp, nonce });
  const payloadEncoded = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', tokenSecret).update(payloadEncoded).digest('hex');
  return `${payloadEncoded}.${signature}`;
}

export function readOAuthState(state, tokenSecret) {
  if (!state || !state.includes('.')) return null;
  const [payloadEncoded, signature] = state.split('.');
  if (!payloadEncoded || !signature) return null;
  const expected = createHmac('sha256', tokenSecret).update(payloadEncoded).digest('hex');
  if (!timingSafeStringEqual(expected, signature)) return null;
  try {
    const raw = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
    const payload = JSON.parse(raw);
    if (Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateResetToken() {
  return randomBytes(24).toString('base64url');
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
