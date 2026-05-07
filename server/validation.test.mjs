import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  parseOrThrow,
  passwordResetSchema,
  pipelineReprocessSchema,
  pipelineRunSchema,
  registerSchema,
  savedProductsSchema,
  skinTestAnswersSchema
} from './validation.mjs';

describe('request validation', () => {
  it('normalizes registration input and rejects weak passwords', () => {
    expect(() =>
      parseOrThrow(registerSchema, {
        name: ' Example ',
        email: 'USER@EXAMPLE.COM',
        password: 'weak',
        skinType: ''
      })
    ).toThrow(/Password/);

    expect(
      parseOrThrow(registerSchema, {
        name: ' Example ',
        email: 'USER@EXAMPLE.COM',
        password: 'valid123',
        skinType: ''
      })
    ).toMatchObject({ name: 'Example', email: 'user@example.com', skinType: 'Not set' });
  });

  it('validates reset password payloads with the same password policy', () => {
    expect(() => parseOrThrow(passwordResetSchema, { token: 'abc', password: '12345678' })).toThrow(
      /Password/
    );
    expect(parseOrThrow(passwordResetSchema, { token: 'abc', password: 'valid123' })).toMatchObject({
      token: 'abc',
      password: 'valid123'
    });
  });

  it('deduplicates and bounds saved product ids', () => {
    expect(parseOrThrow(savedProductsSchema, { productIds: [1, '2', 2, -1] }).productIds).toEqual([
      1,
      2
    ]);
  });

  it('sanitizes skin test arrays', () => {
    expect(
      parseOrThrow(skinTestAnswersSchema, {
        skinType: ' dry ',
        concerns: [' hydration ', ''],
        sensitivity: ' none '
      })
    ).toMatchObject({ skinType: 'dry', concerns: ['hydration'], sensitivity: 'none' });
  });

  it('rejects unsafe post image values', () => {
    expect(() =>
      parseOrThrow(createPostSchema, {
        content: 'hello',
        images: ['javascript:alert(1)']
      })
    ).toThrow(/Image/);
  });

  it('normalizes pipeline run payload defaults', () => {
    const parsed = parseOrThrow(pipelineRunSchema, {
      amazon: { ASIN: 'B07L3QJZQX' }
    });
    expect(parsed.autoDiscoverCandidates).toBe(true);
    expect(parsed.candidateLimit).toBe(60);
    expect(parsed.candidates).toEqual([]);
  });

  it('normalizes pipeline reprocess defaults and status list', () => {
    const parsed = parseOrThrow(pipelineReprocessSchema, {});
    expect(parsed.limit).toBe(25);
    expect(parsed.statuses).toEqual(['comparison_only']);
    expect(parsed.autoDiscoverCandidates).toBe(true);
    expect(parsed.candidateLimit).toBe(60);
  });
});
