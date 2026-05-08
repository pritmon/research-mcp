/**
 * @module logger
 *
 * Minimal structured JSON logger for the research-mcp server.
 *
 * Role in the system:
 *   Every module imports `log()` from here to emit consistent, machine-parseable
 *   log events. The HTTP server (server.ts) and MCP server (index.ts) both share
 *   this utility so that all log output flows through a single code path.
 *
 * Design decisions:
 *   - Outputs to **stderr**, never stdout.  The MCP protocol transmits JSON-RPC
 *     messages over stdout; mixing log lines into that stream would corrupt the
 *     protocol framing for any MCP host reading the process output.
 *   - Emits newline-delimited JSON (NDJSON) so log aggregators (Datadog, Loki,
 *     CloudWatch Logs Insights, etc.) can parse each line as a separate record
 *     without a dedicated multiline parser.
 *   - The `name` field is always `'research-mcp'` — a static discriminator that
 *     lets you grep/filter this service's logs in a mixed-process log stream.
 */

/** Severity levels mirroring the conventional syslog-inspired set used by Pino/Bunyan. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Shape of a single log record written to stderr.
 *
 * All fields are serialised to JSON on one line.  Optional `data` and `err`
 * fields carry structured context so callers never need to bake details into
 * the human-readable `msg` string.
 */
export type LogEvent = {
  level: LogLevel;
  msg: string;
  /** ISO-8601 timestamp, e.g. "2025-05-08T12:34:56.789Z". */
  time: string;
  /** Static service identifier — simplifies filtering in multi-service logs. */
  name: 'research-mcp';
  /** Arbitrary key/value context (request ids, URLs, retry counts, etc.). */
  data?: Record<string, unknown>;
  /** Serialised error — extracted from an `Error` instance or a plain string. */
  err?: { name?: string; message: string; stack?: string };
};

/**
 * Emit a structured JSON log event to stderr.
 *
 * Accepts both `Error` instances and plain strings for the `err` parameter so
 * callers can pass `catch (err)` blocks directly without type-narrowing first.
 *
 * @param level   - Severity: 'debug' | 'info' | 'warn' | 'error'.
 * @param msg     - Short, human-readable description of the event.
 * @param data    - Optional bag of structured context to attach to the record.
 * @param err     - Optional error value to serialise (Error or string).
 *
 * @remarks
 * Why stderr?  MCP uses stdout for JSON-RPC protocol traffic; writing logs to
 * stdout may corrupt the JSON-RPC stream, so this always logs to stderr.
 *
 * The `try/catch` around `process.stderr.write` guards against the rare but
 * real case where stderr itself is closed or broken (e.g. the parent process
 * has exited); falling back to `console.error` is a best-effort last resort
 * that at least keeps the process alive.
 */
export function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
  err?: unknown
): void {
  // Build the base event, conditionally spreading `data` to avoid a key with
  // value `undefined` in the JSON output (which JSON.stringify would omit
  // anyway, but this makes the intent explicit).
  const event: LogEvent = {
    level,
    msg,
    time: new Date().toISOString(),
    name: 'research-mcp',
    ...(data ? { data } : {}),
  };

  // Normalise the error into a serialisable shape.
  // Why separate branches?  Error instances have a non-enumerable `stack`
  // property that JSON.stringify skips; we must extract it manually.
  if (err instanceof Error) {
    event.err = {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
    };
  } else if (typeof err === 'string') {
    event.err = { message: err };
  }

  // Write atomically as a single newline-terminated JSON line.
  // Why `process.stderr.write` instead of `console.error`?
  // `console.error` adds its own newline and may buffer differently across
  // Node versions; `write` gives us precise control over the byte sequence.
  try {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  } catch {
    // eslint-disable-next-line no-console
    console.error(event);
  }
}

