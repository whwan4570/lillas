import { describe, expect, it } from 'vitest';
import { parsePipelineReprocessIntervalHours } from './productPipelineScheduler.mjs';

describe('parsePipelineReprocessIntervalHours', () => {
  it('falls back when input is invalid', () => {
    expect(parsePipelineReprocessIntervalHours(undefined, 24)).toBe(24);
    expect(parsePipelineReprocessIntervalHours('abc', 24)).toBe(24);
    expect(parsePipelineReprocessIntervalHours(0, 24)).toBe(24);
  });

  it('clamps to allowed range 1..168', () => {
    expect(parsePipelineReprocessIntervalHours(1)).toBe(1);
    expect(parsePipelineReprocessIntervalHours(12)).toBe(12);
    expect(parsePipelineReprocessIntervalHours(999)).toBe(168);
  });
});

