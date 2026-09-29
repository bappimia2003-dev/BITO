import { BitoError } from '@bito/shared';
import type { ASTNode, ExpressionScope, EvaluateOptions } from './types.js';
import { getFilter } from './filters.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function evaluateAST(
  node: ASTNode,
  scope: ExpressionScope,
  options: EvaluateOptions = {}
): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Path':
      return resolvePath(node.segments, scope, options);

    case 'Unary': {
      const val = evaluateAST(node.argument, scope, options);
      if (node.operator === '!') {
        return !val;
      }
      if (node.operator === '-') {
        return -Number(val);
      }
      return val;
    }

    case 'Binary': {
      // Short-circuit logical operators
      if (node.operator === '&&') {
        const leftVal = evaluateAST(node.left, scope, options);
        if (!leftVal) return leftVal;
        return evaluateAST(node.right, scope, options);
      }
      if (node.operator === '||') {
        const leftVal = evaluateAST(node.left, scope, options);
        if (leftVal) return leftVal;
        return evaluateAST(node.right, scope, options);
      }

      const left = evaluateAST(node.left, scope, options);
      const right = evaluateAST(node.right, scope, options);

      switch (node.operator) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') {
            return String(left ?? '') + String(right ?? '');
          }
          return Number(left) + Number(right);
        case '-':
          return Number(left) - Number(right);
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '<':
          return (left as number) < (right as number);
        case '<=':
          return (left as number) <= (right as number);
        case '>':
          return (left as number) > (right as number);
        case '>=':
          return (left as number) >= (right as number);
        default:
          throw new BitoError('EXPR_SYNTAX', `Unknown operator: ${node.operator}`);
      }
    }

    case 'Ternary': {
      const condition = evaluateAST(node.condition, scope, options);
      if (condition) {
        return evaluateAST(node.consequent, scope, options);
      } else {
        return evaluateAST(node.alternate, scope, options);
      }
    }

    case 'Pipe': {
      const inputVal = evaluateAST(node.input, scope, options);
      const filter = getFilter(node.filterName);
      const evaluatedArgs = node.args.map((arg) => evaluateAST(arg, scope, options));
      return filter(inputVal, ...evaluatedArgs);
    }
  }
}

function resolvePath(
  segments: Array<string | number>,
  scope: ExpressionScope,
  options: EvaluateOptions
): unknown {
  for (const seg of segments) {
    if (typeof seg === 'string' && FORBIDDEN_KEYS.has(seg)) {
      throw new BitoError(
        'EXPR_FORBIDDEN_PATH',
        `Access to forbidden property '${seg}' is blocked`
      );
    }
  }

  if (segments.length === 0) return undefined;

  const first = segments[0];
  let current: unknown;

  // Handle root special keywords and scopes
  if (first === 'now') {
    current = scope.now ?? new Date().toISOString();
  } else if (first === 'input') {
    current = scope.input;
  } else if (first === 'inputs') {
    current = scope.inputs;
  } else if (first === 'index') {
    current = scope.index ?? 0;
  } else if (first === 'trigger') {
    current = scope.trigger;
  } else if (first === 'nodes') {
    current = scope.nodes;
  } else if (first === 'vars') {
    current = scope.vars;
  } else if (first === 'loop') {
    current = scope.loop;
  } else if (first === 'execution') {
    current = scope.execution;
  } else if (first === 'workflow') {
    current = scope.workflow;
  } else if (first === 'project') {
    current = scope.project;
  } else if (first === 'param') {
    current = scope.param;
  } else {
    // If not a standard scope keyword, check if root is in scope directly or undefined
    const rootScope = scope as unknown as Record<string, unknown>;
    current = rootScope[String(first)];
  }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!;
    if (typeof seg === 'string' && FORBIDDEN_KEYS.has(seg)) {
      throw new BitoError(
        'EXPR_FORBIDDEN_PATH',
        `Access to forbidden property '${seg}' is blocked`
      );
    }

    if (current === null || current === undefined) {
      if (options.strict) {
        throw new BitoError(
          'EXPR_UNRESOLVED',
          `Unresolved path: '${segments.slice(0, i + 1).join('.')}' (parent is ${current})`
        );
      }
      options.onWarn?.('EXPR_UNRESOLVED', `Unresolved path: ${segments.join('.')}`, {
        path: segments.join('.'),
      });
      return undefined;
    }

    if (typeof current === 'object' || Array.isArray(current)) {
      current = (current as Record<string | number, unknown>)[seg];
    } else {
      current = undefined;
    }
  }

  if (current === undefined && options.strict) {
    throw new BitoError('EXPR_UNRESOLVED', `Unresolved path: '${segments.join('.')}'`);
  }

  if (current === undefined) {
    options.onWarn?.('EXPR_UNRESOLVED', `Unresolved path: ${segments.join('.')}`, {
      path: segments.join('.'),
    });
  }

  return current;
}
