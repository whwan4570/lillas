import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  isValidPassword,
  makeOAuthState,
  readOAuthState,
  signToken,
  verifyPassword,
  verifyToken
} from './security.mjs';

describe('security helpers', () => {
  it('enforces the shared password policy', () => {
    expect(isValidPassword('short1')).toBe(false);
    expect(isValidPassword('longbutnonumber')).toBe(false);
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('valid123')).toBe(true);
  });

  it('hashes and verifies passwords without accepting wrong passwords', () => {
    const hash = hashPassword('valid123');
    expect(hash).not.toContain('valid123');
    expect(verifyPassword('valid123', hash)).toBe(true);
    expect(verifyPassword('invalid123', hash)).toBe(false);
  });

  it('signs tamper-resistant auth tokens', () => {
    const token = signToken('user-1', 'test-secret');
    expect(verifyToken(token, 'test-secret')).toBe('user-1');
    expect(verifyToken(`${token}x`, 'test-secret')).toBeNull();
    expect(verifyToken(token, 'wrong-secret')).toBeNull();
  });

  it('round-trips signed OAuth state', () => {
    const state = makeOAuthState('dashboard', 'test-secret');
    expect(readOAuthState(state, 'test-secret')).toMatchObject({ page: 'dashboard' });
    expect(readOAuthState(`${state}x`, 'test-secret')).toBeNull();
  });
});
