import { BitoError } from '@bito/shared';
import type { ASTNode, Token, TokenType } from './types.js';

export function parse(tokens: Token[]): ASTNode {
  let current = 0;

  function peek(): Token {
    return tokens[current] ?? { type: 'EOF', value: null, pos: -1 };
  }

  function consume(expected?: TokenType): Token {
    const tok = peek();
    if (expected && tok.type !== expected) {
      throw new BitoError(
        'EXPR_SYNTAX',
        `Expected token '${expected}' but found '${tok.type}' at position ${tok.pos}`,
        { details: { position: tok.pos } }
      );
    }
    current++;
    return tok;
  }

  function match(type: TokenType): boolean {
    if (peek().type === type) {
      current++;
      return true;
    }
    return false;
  }

  function parseExpression(depth = 1): ASTNode {
    if (depth > 30) {
      throw new BitoError('EXPR_SYNTAX', 'Expression exceeds maximum AST depth of 30', {
        details: { depth },
      });
    }
    return parseTernary(depth);
  }

  function parseTernary(depth: number): ASTNode {
    let node = parseOr(depth + 1);

    if (match('QUESTION')) {
      const consequent = parseExpression(depth + 1);
      consume('COLON');
      const alternate = parseTernary(depth + 1);
      node = {
        type: 'Ternary',
        condition: node,
        consequent,
        alternate,
      };
    }

    return node;
  }

  function parseOr(depth: number): ASTNode {
    let left = parseAnd(depth + 1);
    while (match('OR')) {
      const right = parseAnd(depth + 1);
      left = { type: 'Binary', operator: '||', left, right };
    }
    return left;
  }

  function parseAnd(depth: number): ASTNode {
    let left = parseEquality(depth + 1);
    while (match('AND')) {
      const right = parseEquality(depth + 1);
      left = { type: 'Binary', operator: '&&', left, right };
    }
    return left;
  }

  function parseEquality(depth: number): ASTNode {
    let left = parseCompare(depth + 1);
    while (peek().type === 'EQ' || peek().type === 'NEQ') {
      const op = consume().value as string;
      const right = parseCompare(depth + 1);
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  function parseCompare(depth: number): ASTNode {
    let left = parseAdditive(depth + 1);
    while (
      peek().type === 'LT' ||
      peek().type === 'LTE' ||
      peek().type === 'GT' ||
      peek().type === 'GTE'
    ) {
      const op = consume().value as string;
      const right = parseAdditive(depth + 1);
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  function parseAdditive(depth: number): ASTNode {
    let left = parsePipe(depth + 1);
    while (peek().type === 'PLUS' || peek().type === 'MINUS') {
      const op = consume().value as string;
      const right = parsePipe(depth + 1);
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  function parsePipe(depth: number): ASTNode {
    let node = parseUnary(depth + 1);

    while (match('PIPE')) {
      const filterToken = consume('IDENT');
      const filterName = filterToken.value as string;
      const args: ASTNode[] = [];

      if (match('LPAREN')) {
        if (!match('RPAREN')) {
          do {
            args.push(parseExpression(depth + 1));
          } while (match('COMMA'));
          consume('RPAREN');
        }
      }

      node = {
        type: 'Pipe',
        input: node,
        filterName,
        args,
      };
    }

    return node;
  }

  function parseUnary(depth: number): ASTNode {
    if (peek().type === 'NOT' || peek().type === 'MINUS') {
      const op = consume().value as '!' | '-';
      const arg = parseUnary(depth + 1);
      return { type: 'Unary', operator: op, argument: arg };
    }
    return parsePrimary(depth + 1);
  }

  function parsePrimary(depth: number): ASTNode {
    const tok = peek();

    if (tok.type === 'STRING' || tok.type === 'NUMBER' || tok.type === 'BOOLEAN') {
      consume();
      return { type: 'Literal', value: tok.value };
    }

    if (tok.type === 'NULL') {
      consume();
      return { type: 'Literal', value: null };
    }

    if (match('LPAREN')) {
      const expr = parseExpression(depth + 1);
      consume('RPAREN');
      return expr;
    }

    if (tok.type === 'IDENT') {
      return parsePath();
    }

    throw new BitoError('EXPR_SYNTAX', `Unexpected token '${tok.type}' at position ${tok.pos}`, {
      details: { position: tok.pos },
    });
  }

  function parsePath(): ASTNode {
    const firstTok = consume('IDENT');
    const segments: Array<string | number> = [firstTok.value as string];

    while (true) {
      if (match('DOT')) {
        const nextTok = consume('IDENT');
        segments.push(nextTok.value as string);
      } else if (match('LBRACKET')) {
        const indexTok = peek();
        if (indexTok.type === 'NUMBER' || indexTok.type === 'STRING') {
          consume();
          segments.push(indexTok.value as string | number);
          consume('RBRACKET');
        } else {
          throw new BitoError(
            'EXPR_SYNTAX',
            `Expected NUMBER or STRING inside brackets at position ${indexTok.pos}`,
            { details: { position: indexTok.pos } }
          );
        }
      } else {
        break;
      }
    }

    return { type: 'Path', segments };
  }

  const ast = parseExpression();
  if (peek().type !== 'EOF') {
    const tok = peek();
    throw new BitoError(
      'EXPR_SYNTAX',
      `Unexpected trailing token '${tok.type}' at position ${tok.pos}`,
      { details: { position: tok.pos } }
    );
  }
  return ast;
}
