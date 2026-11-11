import pino from 'pino';

export const REDACTED_PATHS = [
  'password',
  'token',
  'cookie',
  'authorization',
  'embedding',
  'frame',
  'image',
  '*.password',
  'req.headers.cookie',
  'req.headers.authorization',
  'headers.cookie',
  'headers.authorization',
];

export function createLogger(options?: pino.LoggerOptions, destination?: pino.DestinationStream) {
  const isDev = process.env.NODE_ENV === 'development';
  const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

  return pino(
    {
      level: logLevel,
      redact: {
        paths: REDACTED_PATHS,
        censor: '[REDACTED]',
      },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...options,
    },
    destination,
  );
}

export const logger = createLogger();

