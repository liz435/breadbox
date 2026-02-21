const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
} as const;

type LogLevel = "debug" | "info" | "warn" | "error";

const levelConfig: Record<LogLevel, { color: string; label: string }> = {
  debug: { color: colors.dim, label: "debug" },
  info: { color: colors.cyan, label: "info" },
  warn: { color: colors.yellow, label: "warn" },
  error: { color: colors.red, label: "error" },
};

function timestamp(): string {
  const now = new Date();
  return now.toISOString().slice(11, 23); // HH:mm:ss.SSS
}

function formatMessage(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown
): string {
  const { color, label } = levelConfig[level];
  const ts = `${colors.dim}${timestamp()}${colors.reset}`;
  const lvl = `${color}${label}${colors.reset}`;
  const t = `${colors.bold}[${tag}]${colors.reset}`;
  const base = `${ts} ${lvl} ${t} ${message}`;

  if (data === undefined) return base;

  const serialized =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return `${base}\n${colors.dim}${serialized}${colors.reset}`;
}

function createLogger(tag: string) {
  return {
    debug(message: string, data?: unknown) {
      console.debug(formatMessage("debug", tag, message, data));
    },
    info(message: string, data?: unknown) {
      console.info(formatMessage("info", tag, message, data));
    },
    warn(message: string, data?: unknown) {
      console.warn(formatMessage("warn", tag, message, data));
    },
    error(message: string, data?: unknown) {
      console.error(formatMessage("error", tag, message, data));
    },
    child(childTag: string) {
      return createLogger(`${tag}:${childTag}`);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

export { createLogger };
