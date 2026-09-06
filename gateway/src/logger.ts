type Level = "info" | "warn" | "error";

function write(level: Level, args: unknown[]): void {
  const time = new Date().toISOString();
  const line = [`[${time}]`, level.toUpperCase(), ...args.map(String)];
  if (level === "error") console.error(...line);
  else if (level === "warn") console.warn(...line);
  else console.log(...line);
}

export const logger = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args)
};
