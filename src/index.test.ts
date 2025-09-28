import request from 'supertest';
import { describe, it, beforeAll } from 'vitest';
import app from './index';

describe('GET /admin/auth (auth-protected)', () => {
  // ── Create an agent so cookies persist between requests ──────────
  const agent = request.agent(app);

  beforeAll(async () => {
    await agent
      .post('/login')
      .send({ password: process.env.AUTH_PASSWORD })
      .expect(200);
  });

  it('suceeds', async () => {
    await agent.get('/admin/auth').send().expect(200);
  });
});
