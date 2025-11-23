"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const logic_1 = require("./logic");
(0, vitest_1.describe)('applySteps', () => {
    (0, vitest_1.it)('applies multiple plain replacements', () => {
        const steps = [
            { find: 'foo', replace: 'bar' },
            { find: 'bar', replace: 'baz' }
        ];
        (0, vitest_1.expect)((0, logic_1.applySteps)('foo', steps)).toBe('baz');
    });
    (0, vitest_1.it)('respects regex and case sensitivity', () => {
        const steps = [
            { find: 'foo', replace: 'x', useRegex: true, caseSensitive: true },
            { find: 'BAR', replace: 'y', useRegex: false, caseSensitive: false }
        ];
        (0, vitest_1.expect)((0, logic_1.applySteps)('foo BAR Foo', steps)).toBe('x y Foo');
    });
    (0, vitest_1.it)('decodes \\t and \\n in replacement by default', () => {
        const steps = [{ find: ',', replace: '\\t', useRegex: true }];
        (0, vitest_1.expect)((0, logic_1.applySteps)('a,b', steps)).toBe('a\tb');
    });
    (0, vitest_1.it)('can keep backslash escapes when interpretEscapes is false', () => {
        const steps = [{ find: ',', replace: '\\t', useRegex: true, interpretEscapes: false }];
        (0, vitest_1.expect)((0, logic_1.applySteps)('a,b', steps)).toBe('a\\tb');
    });
    (0, vitest_1.it)('handles empty steps as identity', () => {
        (0, vitest_1.expect)((0, logic_1.applySteps)('abc', [])).toBe('abc');
    });
});
//# sourceMappingURL=applySteps.test.js.map