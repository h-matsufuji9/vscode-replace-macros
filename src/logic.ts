import { MacroStep } from './types';

export function applySteps(text: string, steps: MacroStep[]): string {
  return steps.reduce((current, step) => {
    const flags = step.useRegex ? 'g' + (step.caseSensitive ? '' : 'i') : 'g';
    const pattern = step.useRegex ? step.find : escapeRegExp(step.find);
    const regex = new RegExp(pattern, flags);
    const replacement = step.interpretEscapes === false ? step.replace : decodeEscapes(step.replace);
    return current.replace(regex, replacement);
  }, text);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function macroSummary(steps: MacroStep[]): string {
  if (!steps.length) {
    return 'no steps';
  }
  const count = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
  const hasRegex = steps.some((s) => s.useRegex);
  return hasRegex ? `${count}, regex含む` : count;
}

export function decodeEscapes(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrt0\\'"f])/g, (_m, g1: string) => {
    switch (g1) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '0':
        return '\0';
      case '\\':
        return '\\';
      case "'":
        return "'";
      case '"':
        return '"';
      case 'f':
        return '\f';
      default:
        if (g1.startsWith('u') && g1.length === 5) {
          return String.fromCharCode(parseInt(g1.slice(1), 16));
        }
        if (g1.startsWith('x') && g1.length === 3) {
          return String.fromCharCode(parseInt(g1.slice(1), 16));
        }
        return g1;
    }
  });
}
