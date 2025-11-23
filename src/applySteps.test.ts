import { describe, expect, it } from 'vitest';
import type { MacroStep } from './types';
import { applySteps } from './logic';

describe('applySteps', () => {
  it('applies multiple plain replacements', () => {
    const steps: MacroStep[] = [
      { find: 'foo', replace: 'bar' },
      { find: 'bar', replace: 'baz' }
    ];
    expect(applySteps('foo', steps)).toBe('baz');
  });

  it('respects regex and case sensitivity', () => {
    const steps: MacroStep[] = [
      { find: 'foo', replace: 'x', useRegex: true, caseSensitive: true },
      { find: 'BAR', replace: 'y', useRegex: false, caseSensitive: false }
    ];
    expect(applySteps('foo BAR Foo', steps)).toBe('x y Foo');
  });

  it('decodes \\t and \\n in replacement by default', () => {
    const steps: MacroStep[] = [{ find: ',', replace: '\\t', useRegex: true }];
    expect(applySteps('a,b', steps)).toBe('a\tb');
  });

  it('can keep backslash escapes when interpretEscapes is false', () => {
    const steps: MacroStep[] = [{ find: ',', replace: '\\t', useRegex: true, interpretEscapes: false }];
    expect(applySteps('a,b', steps)).toBe('a\\tb');
  });

  it('handles empty steps as identity', () => {
    expect(applySteps('abc', [])).toBe('abc');
  });
});
