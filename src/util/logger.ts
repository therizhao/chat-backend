import { Logger, createLogger as createWinstonLogger, format, transports } from 'winston';


const { combine, timestamp, printf, label } = format;

const customFormat = printf(({ level, message, timestamp, label }) => {
    return `${timestamp} - ${level.toUpperCase().padEnd(5)} [${(label as string).padEnd(25).slice(0, 25)}]: ${message}`;
});

export const createLogger = (name: string): Logger => createWinstonLogger({
    level: process.env.LOGGING_LEVEL
        ? process.env.LOGGING_LEVEL
        : process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(timestamp(), label({ label: name }), customFormat),
    transports: [
        new transports.Console()
    ]
});