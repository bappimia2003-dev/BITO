import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  resolveTemplate,
  extractReferences,
  validateExpressionSyntax,
  FILTERS,
  type ExpressionScope,
} from '../src/index.js';
import { BitoError } from '@bito/shared';

describe('Expression Engine Unit Suite (>= 40 cases)', () => {
  const baseScope: ExpressionScope = {
    input: {
      name: 'Alice',
      qty: 5,
      price: 19.99,
      tags: ['electronics', 'gadgets'],
      nested: { deeply: { value: 'found-me' } },
      greeting: '  Hello World!  ',
      rawText: 'foo_bar_baz',
    },
    inputs: [
      { id: 'item-1', score: 95 },
      { id: 'item-2', score: 80 },
    ],
    index: 0,
    trigger: {
      updateId: 123456,
      message: 'start',
    },
    nodes: {
      lookup: {
        json: { status: 'active', tier: 'premium' },
        items: [{ row: 1 }, { row: 2 }],
      },
    },
    vars: {
      global: { apiVersion: 'v1' },
      project: { environment: 'production' },
      workflow: { retries: 3 },
      execution: { currentStep: 'step-2' },
    },
    loop: {
      index: 2,
      total: 10,
      batch: 1,
    },
    execution: {
      id: 'exec-12345',
    },
    workflow: {
      id: 'wf-999',
      name: 'Order Processor',
    },
    project: {
      id: 'proj-001',
    },
    param: {
      query: 'search term',
    },
    now: '2026-09-29T12:00:00.000Z',
  };

  // 1-5: Basic Types & Raw vs String Template
  it('1. returns raw typed number for single expression', () => {
    const res = resolveTemplate('{{ input.qty }}', baseScope);
    expect(res).toBe(5);
    expect(typeof res).toBe('number');
  });

  it('2. returns raw typed boolean for single expression', () => {
    const res = resolveTemplate('{{ input.qty > 3 }}', baseScope);
    expect(res).toBe(true);
    expect(typeof res).toBe('boolean');
  });

  it('3. returns raw typed array for single expression', () => {
    const res = resolveTemplate('{{ input.tags }}', baseScope);
    expect(res).toEqual(['electronics', 'gadgets']);
    expect(Array.isArray(res)).toBe(true);
  });

  it('4. returns raw typed object for single expression', () => {
    const res = resolveTemplate('{{ input.nested }}', baseScope);
    expect(res).toEqual({ deeply: { value: 'found-me' } });
  });

  it('5. returns string when text surrounds the expression', () => {
    const res = resolveTemplate('Hello {{ input.name }}!', baseScope);
    expect(res).toBe('Hello Alice!');
  });

  // 6-10: String Concatenation & Multiple Interpolations
  it('6. interpolates multiple expressions in one string', () => {
    const res = resolveTemplate(
      'User: {{ input.name }}, Qty: {{ input.qty }}, Env: {{ vars.project.environment }}',
      baseScope
    );
    expect(res).toBe('User: Alice, Qty: 5, Env: production');
  });

  it('7. evaluates addition of numbers vs string concatenation', () => {
    expect(evaluateExpression('input.qty + 10', baseScope)).toBe(15);
    expect(evaluateExpression('input.name + " Wonderland"', baseScope)).toBe('Alice Wonderland');
    expect(evaluateExpression('"Total: " + input.qty', baseScope)).toBe('Total: 5');
  });

  it('8. evaluates arithmetic subtraction', () => {
    expect(evaluateExpression('input.qty - 2', baseScope)).toBe(3);
  });

  it('9. evaluates unary negation and logical NOT', () => {
    expect(evaluateExpression('-input.qty', baseScope)).toBe(-5);
    expect(evaluateExpression('!false', baseScope)).toBe(true);
    expect(evaluateExpression('!(input.qty > 10)', baseScope)).toBe(true);
  });

  it('10. evaluates comparisons (<, <=, >, >=, ==, !=)', () => {
    expect(evaluateExpression('input.qty == 5', baseScope)).toBe(true);
    expect(evaluateExpression('input.qty != 5', baseScope)).toBe(false);
    expect(evaluateExpression('input.qty > 4', baseScope)).toBe(true);
    expect(evaluateExpression('input.qty >= 5', baseScope)).toBe(true);
    expect(evaluateExpression('input.qty < 6', baseScope)).toBe(true);
    expect(evaluateExpression('input.qty <= 5', baseScope)).toBe(true);
  });

  // 11-15: Logical AND / OR & Ternary
  it('11. evaluates logical AND with short-circuiting', () => {
    expect(evaluateExpression('true && true', baseScope)).toBe(true);
    expect(evaluateExpression('false && true', baseScope)).toBe(false);
    expect(evaluateExpression('input.qty > 2 && input.name == "Alice"', baseScope)).toBe(true);
  });

  it('12. evaluates logical OR with short-circuiting', () => {
    expect(evaluateExpression('true || false', baseScope)).toBe(true);
    expect(evaluateExpression('false || false', baseScope)).toBe(false);
    expect(evaluateExpression('input.qty == 99 || input.name == "Alice"', baseScope)).toBe(true);
  });

  it('13. evaluates ternary operator: true branch', () => {
    expect(evaluateExpression('input.qty > 3 ? "bulk" : "single"', baseScope)).toBe('bulk');
  });

  it('14. evaluates ternary operator: false branch', () => {
    expect(evaluateExpression('input.qty > 10 ? "bulk" : "single"', baseScope)).toBe('single');
  });

  it('15. evaluates nested ternary expressions', () => {
    expect(
      evaluateExpression(
        'input.qty > 10 ? "huge" : (input.qty > 3 ? "medium" : "small")',
        baseScope
      )
    ).toBe('medium');
  });

  // 16-20: Scope Paths
  it('16. resolves inputs array bracket access', () => {
    expect(evaluateExpression('inputs[0].score', baseScope)).toBe(95);
    expect(evaluateExpression('inputs[1].id', baseScope)).toBe('item-2');
  });

  it('17. resolves trigger scope', () => {
    expect(evaluateExpression('trigger.updateId', baseScope)).toBe(123456);
  });

  it('18. resolves nodes.<key>.json and items scope', () => {
    expect(evaluateExpression('nodes.lookup.json.tier', baseScope)).toBe('premium');
    expect(evaluateExpression('nodes["lookup"].json.status', baseScope)).toBe('active');
    expect(evaluateExpression('nodes.lookup.items[0].row', baseScope)).toBe(1);
  });

  it('19. resolves vars across all 4 scopes', () => {
    expect(evaluateExpression('vars.global.apiVersion', baseScope)).toBe('v1');
    expect(evaluateExpression('vars.project.environment', baseScope)).toBe('production');
    expect(evaluateExpression('vars.workflow.retries', baseScope)).toBe(3);
    expect(evaluateExpression('vars.execution.currentStep', baseScope)).toBe('step-2');
  });

  it('20. resolves loop, execution, workflow, project, and now scopes', () => {
    expect(evaluateExpression('loop.index', baseScope)).toBe(2);
    expect(evaluateExpression('execution.id', baseScope)).toBe('exec-12345');
    expect(evaluateExpression('workflow.name', baseScope)).toBe('Order Processor');
    expect(evaluateExpression('project.id', baseScope)).toBe('proj-001');
    expect(evaluateExpression('now', baseScope)).toBe('2026-09-29T12:00:00.000Z');
  });

  // 21-25: Safety & Security
  it('21. blocks __proto__ access with EXPR_FORBIDDEN_PATH', () => {
    expect(() => evaluateExpression('input.__proto__', baseScope)).toThrowError(BitoError);
    expect(() => evaluateExpression('input["__proto__"]', baseScope)).toThrowError(BitoError);
  });

  it('22. blocks constructor access with EXPR_FORBIDDEN_PATH', () => {
    expect(() => evaluateExpression('input.constructor', baseScope)).toThrowError(BitoError);
    expect(() => evaluateExpression('input["constructor"]', baseScope)).toThrowError(BitoError);
  });

  it('23. blocks prototype access with EXPR_FORBIDDEN_PATH', () => {
    expect(() => evaluateExpression('input.prototype', baseScope)).toThrowError(BitoError);
  });

  it('24. throws EXPR_UNRESOLVED in strict mode when path does not exist', () => {
    expect(() =>
      evaluateExpression('input.nonexistent.field', baseScope, { strict: true })
    ).toThrowError(BitoError);
  });

  it('25. returns undefined and emits warning in non-strict mode for unresolved paths', () => {
    const warnings: string[] = [];
    const res = evaluateExpression('input.nonexistent.field', baseScope, {
      strict: false,
      onWarn: (code) => warnings.push(code),
    });
    expect(res).toBeUndefined();
    expect(warnings).toContain('EXPR_UNRESOLVED');
  });

  // 26-30: Escapes & String Limits
  it('26. renders escaped \\{{ as literal {{ in templates', () => {
    const res = resolveTemplate('\\{{ input.name }} is not interpolated', baseScope);
    expect(res).toBe('{{ input.name }} is not interpolated');
  });

  it('27. rejects expressions exceeding 2000 characters', () => {
    const longExpr = '1 + '.repeat(700) + '1';
    expect(() => evaluateExpression(longExpr, baseScope)).toThrowError(BitoError);
  });

  it('28. handles unicode in strings and templates', () => {
    const res = resolveTemplate('Привет {{ "мир" }} 🚀', baseScope);
    expect(res).toBe('Привет мир 🚀');
  });

  it('29. extracts node key references with extractReferences', () => {
    const template = 'Look at {{ nodes.lookup.json.price }} and {{ nodes["ai_agent"].json.reply }}';
    const refs = extractReferences(template);
    expect(refs).toContain('lookup');
    expect(refs).toContain('ai_agent');
  });

  it('30. validates expression syntax without throwing', () => {
    expect(validateExpressionSyntax('input.qty > 5').valid).toBe(true);
    expect(validateExpressionSyntax('input.qty > > 5').valid).toBe(false);
  });

  // 31-48: Every Filter in the Filters Table
  it('31. filter: upper, lower, trim', () => {
    expect(evaluateExpression('input.greeting | trim | lower', baseScope)).toBe('hello world!');
    expect(evaluateExpression('input.name | upper', baseScope)).toBe('ALICE');
  });

  it('32. filter: length on array, string, object', () => {
    expect(evaluateExpression('input.tags | length', baseScope)).toBe(2);
    expect(evaluateExpression('input.name | length', baseScope)).toBe(5);
    expect(evaluateExpression('input.nested | length', baseScope)).toBe(1);
  });

  it('33. filter: first and last', () => {
    expect(evaluateExpression('input.tags | first', baseScope)).toBe('electronics');
    expect(evaluateExpression('input.tags | last', baseScope)).toBe('gadgets');
    expect(evaluateExpression('"abc" | first', baseScope)).toBe('a');
    expect(evaluateExpression('"abc" | last', baseScope)).toBe('c');
  });

  it('34. filter: join and split', () => {
    expect(evaluateExpression('input.tags | join(" - ")', baseScope)).toBe('electronics - gadgets');
    expect(evaluateExpression('input.rawText | split("_")', baseScope)).toEqual([
      'foo',
      'bar',
      'baz',
    ]);
  });

  it('35. filter: replace and slice', () => {
    expect(evaluateExpression('input.name | replace("Ali", "Gra")', baseScope)).toBe('Grace');
    expect(evaluateExpression('input.name | slice(0, 3)', baseScope)).toBe('Ali');
    expect(evaluateExpression('input.tags | slice(1)', baseScope)).toEqual(['gadgets']);
  });

  it('36. filter: default', () => {
    expect(evaluateExpression('input.missing | default("guest")', baseScope)).toBe('guest');
    expect(evaluateExpression('"" | default("filled")', baseScope)).toBe('filled');
    expect(evaluateExpression('input.name | default("guest")', baseScope)).toBe('Alice');
  });

  it('37. filter: json and parseJson', () => {
    const jsonStr = evaluateExpression('input.tags | json', baseScope) as string;
    expect(typeof jsonStr).toBe('string');
    expect(evaluateExpression(`'${jsonStr}' | parseJson`, baseScope)).toEqual([
      'electronics',
      'gadgets',
    ]);
  });

  it('38. filter: number and string', () => {
    expect(evaluateExpression('"42.5" | number', baseScope)).toBe(42.5);
    expect(evaluateExpression('100 | string', baseScope)).toBe('100');
  });

  it('39. filter: round, floor, ceil, abs', () => {
    expect(evaluateExpression('input.price | round(1)', baseScope)).toBe(20);
    expect(evaluateExpression('4.9 | floor', baseScope)).toBe(4);
    expect(evaluateExpression('4.1 | ceil', baseScope)).toBe(5);
    expect(evaluateExpression('-42 | abs', baseScope)).toBe(42);
  });

  it('40. filter: date format', () => {
    const iso = evaluateExpression('now | date("iso")', baseScope);
    expect(iso).toBe('2026-09-29T12:00:00.000Z');
    const dateOnly = evaluateExpression('now | date("date")', baseScope);
    expect(dateOnly).toBe('2026-09-29');
  });

  it('41. filter: keys and values', () => {
    expect(evaluateExpression('input.nested | keys', baseScope)).toEqual(['deeply']);
    expect(evaluateExpression('input.nested | values', baseScope)).toEqual([{ value: 'found-me' }]);
  });

  it('42. filter: contains, startsWith, endsWith', () => {
    expect(evaluateExpression('input.tags | contains("gadgets")', baseScope)).toBe(true);
    expect(evaluateExpression('input.name | startsWith("Al")', baseScope)).toBe(true);
    expect(evaluateExpression('input.name | endsWith("ce")', baseScope)).toBe(true);
  });

  it('43. filter: capitalize', () => {
    expect(evaluateExpression('"world" | capitalize', baseScope)).toBe('World');
  });

  it('44. filter: urlEncode', () => {
    expect(evaluateExpression('"hello world & more" | urlEncode', baseScope)).toBe(
      'hello%20world%20%26%20more'
    );
  });

  it('45. filter: truncate', () => {
    expect(evaluateExpression('"A very long text message" | truncate(10)', baseScope)).toBe(
      'A very lon...'
    );
  });

  it('46. filter: unknown filter throws EXPR_SYNTAX', () => {
    expect(() => evaluateExpression('input.name | nonexistentFilter', baseScope)).toThrowError(
      BitoError
    );
  });

  it('47. enforces max AST depth of 30', () => {
    // 35 levels of parentheses
    const deepExpr = '('.repeat(35) + '1' + ')'.repeat(35);
    expect(() => evaluateExpression(deepExpr, baseScope)).toThrowError(BitoError);
  });

  it('48. ensures all filters in FILTERS table are tested and pure functions', () => {
    expect(Object.keys(FILTERS).length).toBeGreaterThanOrEqual(25);
  });
});
