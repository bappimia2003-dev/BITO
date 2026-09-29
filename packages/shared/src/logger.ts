import { redact } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogKind = 'system' | 'node' | 'http' | 'ai_step';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  kind?: LogKind;
  message: string;
  data?: unknown;
  executionId?: string;
  nodeRunId?: string;
  projectId?: string;
  userId?: string;
}

export interface LoggerOptions {
  secretsInUse?: readonly string[];
  executionId?: string;
  nodeRunId?: string;
  projectId?: string;
  userId?: string;
  kind?: LogKind;
}

export class Logger {
  private secrets: readonly string[];
  private context: Omit<LoggerOptions, 'secretsInUse'>;

  constructor(options: LoggerOptions = {}) {
    const { secretsInUse, ...context } = options;
    this.secrets = secretsInUse ?? [];
    this.context = context;
  }

  withContext(extra: LoggerOptions): Logger {
    return new Logger({
      secretsInUse: [...this.secrets, ...(extra.secretsInUse ?? [])],
      executionId: extra.executionId ?? this.context.executionId,
      nodeRunId: extra.nodeRunId ?? this.context.nodeRunId,
      projectId: extra.projectId ?? this.context.projectId,
      userId: extra.userId ?? this.context.userId,
      kind: extra.kind ?? this.context.kind,
    });
  }

  private write(level: LogLevel, message: string, data?: unknown, kind?: LogKind): void {
    const redactedMessage = redact(message, this.secrets) as string;
    const redactedData = data !== undefined ? redact(data, this.secrets) : undefined;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      kind: kind ?? this.context.kind ?? 'system',
      message: redactedMessage,
      ...(redactedData !== undefined ? { data: redactedData } : {}),
      ...(this.context.executionId ? { executionId: this.context.executionId } : {}),
      ...(this.context.nodeRunId ? { nodeRunId: this.context.nodeRunId } : {}),
      ...(this.context.projectId ? { projectId: this.context.projectId } : {}),
      ...(this.context.userId ? { userId: this.context.userId } : {}),
    };

    const line = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  debug(message: string, data?: unknown, kind?: LogKind): void {
    this.write('debug', message, data, kind);
  }

  info(message: string, data?: unknown, kind?: LogKind): void {
    this.write('info', message, data, kind);
  }

  warn(message: string, data?: unknown, kind?: LogKind): void {
    this.write('warn', message, data, kind);
  }

  error(message: string, data?: unknown, kind?: LogKind): void {
    this.write('error', message, data, kind);
  }
}

export const logger = new Logger();
