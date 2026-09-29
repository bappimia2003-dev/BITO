import type { Json } from '@bito/shared';

export type TokenType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENT'
  | 'DOT'
  | 'PIPE'
  | 'QUESTION'
  | 'COLON'
  | 'OR'
  | 'AND'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'PLUS'
  | 'MINUS'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string | number | boolean | null;
  pos: number;
}

export type ASTNode =
  | { type: 'Literal'; value: unknown }
  | { type: 'Path'; segments: Array<string | number> }
  | { type: 'Unary'; operator: '!' | '-'; argument: ASTNode }
  | { type: 'Binary'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'Ternary'; condition: ASTNode; consequent: ASTNode; alternate: ASTNode }
  | { type: 'Pipe'; input: ASTNode; filterName: string; args: ASTNode[] };

export interface ScopeLoopState {
  index: number;
  total?: number;
  batch?: number;
}

export interface ScopeNodeState {
  json?: Record<string, Json>;
  items?: Array<Record<string, Json>>;
}

export interface ExpressionScope {
  input?: Record<string, Json>;
  inputs?: Array<Record<string, Json>>;
  index?: number;
  trigger?: Record<string, Json>;
  nodes?: Record<string, ScopeNodeState>;
  vars?: {
    global?: Record<string, Json>;
    project?: Record<string, Json>;
    workflow?: Record<string, Json>;
    execution?: Record<string, Json>;
  };
  loop?: ScopeLoopState;
  execution?: {
    id: string;
  };
  workflow?: {
    id: string;
    name?: string;
  };
  project?: {
    id: string;
  };
  param?: Record<string, unknown>;
  now?: string;
}

export interface EvaluateOptions {
  strict?: boolean;
  onWarn?: (code: string, message: string, details?: Record<string, unknown>) => void;
}
