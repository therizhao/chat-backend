type DomainEnvironment = {
    // Basic
    NODE_ENV: string
    SERVER_PORT: number | string
    LOGGING_LEVEL: string
    RAILWAY_TOKEN: string
    AUTH_PASSWORD: string

    // Cors
    CORS_ALLOWED_ORIGINS?: string
    CORS_ALLOWED_METHODS?: string
    CORS_ALLOWED_HEADERS?: string
    CORS_EXPOSED_HEADERS?: string
    CORS_ALLOW_CREDENTIALS?: string
}

declare global { namespace NodeJS { interface ProcessEnv extends DomainEnvironment { } } }
export { };
