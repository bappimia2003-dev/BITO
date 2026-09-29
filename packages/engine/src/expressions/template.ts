import { BitoError } from '@bito/shared';
import type { ExpressionScope, EvaluateOptions } from './types.js';
import { tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import { evaluateAST } from './evaluator.js';

const MAX_RESOLVED_STRING_LENGTH = 1024 * 1024; // 1 MB

export function evaluateExpression(
  expressionStr: string,
  scope: ExpressionScope,
  options: EvaluateOptions = {}
): unknown {
  const trimmed = expressionStr.trim();
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  return evaluateAST(ast, scope, options);
}

export function resolveTemplate(
  template: string,
  scope: ExpressionScope,
  options: EvaluateOptions = {}
): unknown {
  if (typeof template !== 'string') {
    return template;
  }

  // Fast path: no {{ present
  if (!template.includes('{{')) {
    return template.replaceAll('\\{{', '{{');
  }

  // Check if template is exactly one expression: e.g. "{{ input.val }}"
  const singleMatch = template.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (singleMatch && !template.startsWith('\\{{')) {
    const expr = singleMatch[1]!;
    return evaluateExpression(expr, scope, options);
  }

  // Mixed template with text and/or multiple {{ ... }}
  let result = '';
  let i = 0;
  const len = template.length;

  while (i < len) {
    if (template.startsWith('\\{{', i)) {
      result += '{{';
      i += 3;
      continue;
    }

    if (template.startsWith('{{', i)) {
      const closeIdx = template.indexOf('}}', i + 2);
      if (closeIdx === -1) {
        throw new BitoError('EXPR_SYNTAX', 'Unclosed expression in template', {
          details: { position: i },
        });
      }
      const expr = template.slice(i + 2, closeIdx);
      const val = evaluateExpression(expr, scope, options);

      let stringified = '';
      if (val === null || val === undefined) {
        stringified = '';
      } else if (typeof val === 'object') {
        stringified = JSON.stringify(val);
      } else {
        stringified = String(val);
      }

      result += stringified;
      if (result.length > MAX_RESOLVED_STRING_LENGTH) {
        throw new BitoError(
          'EXPR_SYNTAX',
          'Resolved template exceeds maximum allowed length of 1 MB',
          { details: { length: result.length } }
        );
      }

      i = closeIdx + 2;
    } else {
      result += template[i]!;
      i++;
    }
  }

  return result;
}

export function extractReferences(template: string): string[] {
  if (typeof template !== 'string') return [];

  const references = new Set<string>();
  const regex = /(?<!\\)\{\{([\s\S]+?)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const expr = match[1]!;
    try {
      const tokens = tokenize(expr.trim());
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i]!;
        if (tok.type === 'IDENT' && tok.value === 'nodes' && i + 1 < tokens.length) {
          const nextTok = tokens[i + 1]!;
          if (nextTok.type === 'DOT' && i + 2 < tokens.length) {
            const nodeKeyTok = tokens[i + 2]!;
            if (nodeKeyTok.type === 'IDENT') {
              references.add(nodeKeyTok.value as string);
            }
          } else if (nextTok.type === 'LBRACKET' && i + 2 < tokens.length) {
            const nodeKeyTok = tokens[i + 2]!;
            if (nodeKeyTok.type === 'STRING') {
              references.add(nodeKeyTok.value as string);
            }
          }
        }
      }
    } catch {
      // Ignore syntax errors during reference extraction
    }
  }

  return Array.from(references);
}

export function validateExpressionSyntax(exprStr: string): {
  valid: boolean;
  error?: { message: string; position?: number };
} {
  try {
    const tokens = tokenize(exprStr.trim());
    parse(tokens);
    return { valid: true };
  } catch (err: unknown) {
    if (err instanceof BitoError) {
      return {
        valid: false,
        error: {
          message: err.message,
          position: (err.details?.position as number) ?? undefined,
        },
      };
    }
    return {
      valid: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}
