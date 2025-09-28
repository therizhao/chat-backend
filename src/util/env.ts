import { config } from 'dotenv';
import path from 'node:path';

// dev/test   ➜ .env.development
// other ➜ .env           (production / staging / etc.)
const env = process.env.NODE_ENV ?? 'development';
const dotenvFile =
    ['development', 'test'].includes(env) ? `.env.development` : '.env';

export function configEnv() {
    config({ path: path.resolve(process.cwd(), dotenvFile) });
}

