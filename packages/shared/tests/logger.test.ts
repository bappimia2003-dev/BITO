import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../src/logger.js';

describe('Logger', () => {
  it('writes structured JSON lines to stdout and stderr', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const logger = new Logger({
      secretsInUse: ['secret123'],
      executionId: 'exec-1',
    });

    logger.info('Running execution with secret123', {
      apiKey: 'key999',
      status: 'starting',
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const logLine = stdoutSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(logLine.trim());

    expect(parsed.level).toBe('info');
    expect(parsed.executionId).toBe('exec-1');
    expect(parsed.message).toBe('Running execution with ***');
    expect(parsed.data.apiKey).toBe('***');
    expect(parsed.data.status).toBe('starting');

    logger.error('Failure occurred');
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
