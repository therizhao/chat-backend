import cors from 'cors';
import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import http from 'http';
import cookieParser from 'cookie-parser';
import { createLogger } from './util/logger';
import { configEnv } from './util/env';
import { authMiddleware, hash, checkHashedPassword } from './util/auth';

configEnv()

const app = express();
const server = http.createServer(app);
const log = createLogger('Entrypoint');

app.use(helmet({ hidePoweredBy: true }));
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS,
  methods: process.env.CORS_ALLOWED_METHODS,
  allowedHeaders: process.env.CORS_ALLOWED_HEADERS,
  exposedHeaders: process.env.CORS_EXPOSED_HEADERS,
  credentials: process.env.CORS_ALLOW_CREDENTIALS === 'true'
}));
app.use(json());
app.use(urlencoded({ extended: true }));
app.set('port', process.env.SERVER_PORT ?? 3000);
app.use(cookieParser());

// ─── Public routes ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  log.debug('Received hello request');
  res.status(200).json({ message: 'hello' });
});

app.post('/login', (req, res) => {
  const { password } = req.body ?? {};
  const hashedPassword = hash(password);

  if (password && checkHashedPassword(hashedPassword)) {
    res.cookie('auth', hashedPassword, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',       // allow cross-site
      maxAge: 24 * 60 * 60 * 1000 // 24h
    });
    res.status(200).json({ message: 'Logged in' });
    return;
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/logout', (_req, res) => {
  res.clearCookie('auth', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    path: '/'
  });
  res.status(200).json({ message: 'Logged out' });
});


// ─── Protected routes ─────────────────────────────────────────────────────────
app.post('/gql', authMiddleware, async (req, res) => {
  const rsp = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RAILWAY_TOKEN}`
    },
    body: JSON.stringify(req.body)
  });

  res.status(rsp.status).json(await rsp.json());
});



server.listen(app.get('port'), () => {
  log.info(`Application started on port ${app.get('port')}`);
});

export default app;