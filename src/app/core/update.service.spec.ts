import { describe, expect, it } from 'vitest';
import { isNewer } from './update.service';

describe('isNewer', () => {
  it('compares build numbers numerically, not as text', () => {
    expect(isNewer('0.1.10', '0.1.9')).toBe(true);
    expect(isNewer('0.1.9', '0.1.10')).toBe(false);
  });

  it('respects major and minor', () => {
    expect(isNewer('0.2.1', '0.1.99')).toBe(true);
    expect(isNewer('1.0.0', '0.9.500')).toBe(true);
    expect(isNewer('0.1.50', '1.0.0')).toBe(false);
  });

  it('is false for the same version or malformed input', () => {
    expect(isNewer('0.1.10', '0.1.10')).toBe(false);
    expect(isNewer('dev', '0.1.10')).toBe(false);
    expect(isNewer('0.1', '0.1.10')).toBe(false);
  });
});
