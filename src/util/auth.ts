import crypto from 'crypto';
import express from 'express';

// ─── Simple password-hash helper ───────────────────────────────────────────────
export const hash = (value: string) =>
    crypto.createHash('sha256').update(value).digest('hex');

export function checkHashedPassword(hashedPassword: string): boolean {
    if (!process.env.AUTH_PASSWORD) {
        return false;
    }

    const correctHash = hash(process.env.AUTH_PASSWORD)
    return hashedPassword === correctHash;
}


// ─── Authentication middleware ────────────────────────────────────────────────
export function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const cookieHash = req.cookies?.auth;
    if (cookieHash && checkHashedPassword(cookieHash)) {
        return next()
    };

    res.status(401).json({ error: 'Unauthorized' });
}
