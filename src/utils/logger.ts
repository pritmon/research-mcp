export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
  level: LogLevel;
  msg: string;
  time: string;
  name: 'research-mcp';
  data?: Record<string, unknown>;
  err?: { name?: string; message: string; stack?: string };
};

/**
 * Emit structured JSON logs to stderr.
 *
 * MCP uses stdout for protocol traffic; writing logs to stdout may corrupt
 * the JSON-RPC stream, so this always logs to stderr.
 */
export function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
  err?: unknown
): void {
  const event: LogEvent = {
    level,
    msg,
    time: new Date().toISOString(),
    name: 'research-mcp',
    ...(data ? { data } : {}),
  };

  if (err instanceof Error) {
    event.err = {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
    };
  } else if (typeof err === 'string') {
    event.err = { message: err };
  }

  try {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  } catch {
    // eslint-disable-next-line no-console
    console.error(event);
  }
}

