import { BitoError } from '@bito/shared';
import type { Token } from './types.js';

export function tokenize(input: string): Token[] {
  if (input.length > 2000) {
    throw new BitoError('EXPR_SYNTAX', 'Expression exceeds maximum length of 2000 characters', {
      details: { length: input.length },
    });
  }

  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i]!;

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    const pos = i;

    // String literals ('...' or "...")
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let val = '';
      i++;
      let closed = false;
      while (i < len) {
        const c = input[i]!;
        if (c === '\\' && i + 1 < len) {
          const next = input[i + 1]!;
          if (next === 'n') val += '\n';
          else if (next === 't') val += '\t';
          else if (next === 'r') val += '\r';
          else if (next === quote) val += quote;
          else if (next === '\\') val += '\\';
          else val += next;
          i += 2;
        } else if (c === quote) {
          closed = true;
          i++;
          break;
        } else {
          val += c;
          i++;
        }
      }
      if (!closed) {
        throw new BitoError(
          'EXPR_SYNTAX',
          `Unterminated string literal starting at position ${pos}`,
          {
            details: { position: pos },
          }
        );
      }
      tokens.push({ type: 'STRING', value: val, pos });
      continue;
    }

    // Number literals
    if (/[0-9]/.test(ch)) {
      let numStr = '';
      while (i < len && /[0-9]/.test(input[i]!)) {
        numStr += input[i]!;
        i++;
      }
      if (i < len && input[i] === '.' && i + 1 < len && /[0-9]/.test(input[i + 1]!)) {
        numStr += '.';
        i++;
        while (i < len && /[0-9]/.test(input[i]!)) {
          numStr += input[i]!;
          i++;
        }
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr), pos });
      continue;
    }

    // Two-character operators
    if (ch === '|' && i + 1 < len && input[i + 1] === '|') {
      tokens.push({ type: 'OR', value: '||', pos });
      i += 2;
      continue;
    }
    if (ch === '&' && i + 1 < len && input[i + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&', pos });
      i += 2;
      continue;
    }
    if (ch === '=' && i + 1 < len && input[i + 1] === '=') {
      tokens.push({ type: 'EQ', value: '==', pos });
      i += 2;
      continue;
    }
    if (ch === '!' && i + 1 < len && input[i + 1] === '=') {
      tokens.push({ type: 'NEQ', value: '!=', pos });
      i += 2;
      continue;
    }
    if (ch === '<' && i + 1 < len && input[i + 1] === '=') {
      tokens.push({ type: 'LTE', value: '<=', pos });
      i += 2;
      continue;
    }
    if (ch === '>' && i + 1 < len && input[i + 1] === '=') {
      tokens.push({ type: 'GTE', value: '>=', pos });
      i += 2;
      continue;
    }

    // Single-character punctuation / operators
    switch (ch) {
      case '.':
        tokens.push({ type: 'DOT', value: '.', pos });
        i++;
        continue;
      case '|':
        tokens.push({ type: 'PIPE', value: '|', pos });
        i++;
        continue;
      case '?':
        tokens.push({ type: 'QUESTION', value: '?', pos });
        i++;
        continue;
      case ':':
        tokens.push({ type: 'COLON', value: ':', pos });
        i++;
        continue;
      case '<':
        tokens.push({ type: 'LT', value: '<', pos });
        i++;
        continue;
      case '>':
        tokens.push({ type: 'GT', value: '>', pos });
        i++;
        continue;
      case '+':
        tokens.push({ type: 'PLUS', value: '+', pos });
        i++;
        continue;
      case '-':
        tokens.push({ type: 'MINUS', value: '-', pos });
        i++;
        continue;
      case '!':
        tokens.push({ type: 'NOT', value: '!', pos });
        i++;
        continue;
      case '(':
        tokens.push({ type: 'LPAREN', value: '(', pos });
        i++;
        continue;
      case ')':
        tokens.push({ type: 'RPAREN', value: ')', pos });
        i++;
        continue;
      case '[':
        tokens.push({ type: 'LBRACKET', value: '[', pos });
        i++;
        continue;
      case ']':
        tokens.push({ type: 'RBRACKET', value: ']', pos });
        i++;
        continue;
      case ',':
        tokens.push({ type: 'COMMA', value: ',', pos });
        i++;
        continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(input[i]!)) {
        ident += input[i]!;
        i++;
      }
      if (ident === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, pos });
      } else if (ident === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, pos });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: null, pos });
      } else {
        tokens.push({ type: 'IDENT', value: ident, pos });
      }
      continue;
    }

    throw new BitoError('EXPR_SYNTAX', `Unexpected character '${ch}' at position ${pos}`, {
      details: { position: pos },
    });
  }

  tokens.push({ type: 'EOF', value: null, pos: len });
  return tokens;
}
