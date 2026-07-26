import { LoggerService } from '@nestjs/common';
import { LogLevel, splitNestArgs, toLogLine } from './log-rules';

/**
 * One JSON object per line on stdout/stderr so container logs can be filtered
 * by level and correlated by requestId. Enabled from main.ts only when
 * LOG_FORMAT=json (implied in production); local runs keep Nest's pretty logger.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly service = 'mini-ecommerce-api') {}

  log(message: unknown, ...rest: unknown[]): void {
    this.write('info', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.write('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.write('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.write('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.write('verbose', message, rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.write('fatal', message, rest);
  }

  private write(level: LogLevel, message: unknown, rest: unknown[]): void {
    const { stack, context } = splitNestArgs(rest);
    const detail =
      typeof message === 'string'
        ? { message }
        : { payload: message as Record<string, unknown> };

    const line = toLogLine({
      level,
      time: new Date().toISOString(),
      service: this.service,
      context,
      ...detail,
      stack,
    });

    const stream =
      level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }
}
