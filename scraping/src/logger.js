import fs from "fs";
import path from "path";
import { createLogger, format, transports } from "winston";
import chalk from "chalk";

const { combine, timestamp, printf, splat } = format;

// ensure logs dir
const LOG_DIR = path.resolve("./logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// small icons per level
const ICONS = {
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
  debug: "🐞",
  verbose: "✳️",
};

// colorize levels using chalk
function colorizeLevel(level, msg) {
  switch (level) {
    case "error": return chalk.bold.red(msg);
    case "warn": return chalk.keyword("orange")(msg);
    case "info": return chalk.cyan(msg);
    case "debug": return chalk.magenta(msg);
    case "verbose": return chalk.gray(msg);
    default: return msg;
  }
}

// pretty print format for console
const prettyConsole = printf(({ level, message, timestamp, ...meta }) => {
  const time = chalk.dim(new Date(timestamp).toLocaleString());
  const icon = ICONS[level] || "•";
  const lvl = colorizeLevel(level, level.toUpperCase().padEnd(7));
  // safely stringify meta if provided
  const metaKeys = Object.keys(meta || {}).filter(k => k !== "stack" && k !== "message");
  const metaStr = metaKeys.length ? chalk.dim(` ${JSON.stringify(meta, null, 2)}`) : "";
  // if message is an error stack, show stack
  const stack = (meta && meta.stack) ? `\n${chalk.gray(meta.stack)}` : "";
  return `${time} ${icon} ${lvl} ${message}${metaStr}${stack}`;
});

// plain JSON format for file logs (structured)
const jsonFile = combine(
  timestamp(),
  splat(),
  format.json()
);

// create logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    // Console transport: pretty
    new transports.Console({
      format: combine(timestamp(), splat(), prettyConsole),
      handleExceptions: true,
    }),
    // File transport: structured json for persistence (rotating not included, keep simple)
    new transports.File({
      filename: path.join(LOG_DIR, "scraper.log"),
      format: jsonFile,
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
      tailable: true,
      handleExceptions: true,
    })
  ],
  exitOnError: false,
});

// convenience wrappers keeping API same as before
export const info = (...args) => logger.info(formatArgs(args));
export const warn = (...args) => logger.warn(formatArgs(args));
export const error = (...args) => logger.error(formatArgs(args));
export const debug = (...args) => logger.debug(formatArgs(args));
export const verbose = (...args) => logger.verbose(formatArgs(args));

// helper to handle Error or plain values
function formatArgs(args) {
  if (!args || args.length === 0) return "";
  if (args.length === 1) {
    const a = args[0];
    if (a instanceof Error) {
      // attach stack for pretty printing & structured logging
      return { message: a.message, stack: a.stack };
    }
    // simple string or object
    return (typeof a === "object") ? JSON.stringify(a) : String(a);
  }
  // multiple args -> join but preserve objects
  return args.map((a) => {
    if (a instanceof Error) return { message: a.message, stack: a.stack };
    if (typeof a === "object") return a;
    return String(a);
  });
}

export default logger;
