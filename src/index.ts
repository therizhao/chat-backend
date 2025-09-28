import cors from 'cors';
import express, { json, type Request, type Response } from 'express';
import helmet from 'helmet';
import http from 'http';
import cookieParser from 'cookie-parser';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from './util/logger';
import { configEnv } from './util/env';
import { authMiddleware, hash, checkHashedPassword } from './util/auth';
import OpenAI from 'openai';

configEnv();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const log = createLogger('Entrypoint');

const app = express();
const server = http.createServer(app);

app.use(helmet({ hidePoweredBy: true }));
app.use(
  cors({
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  })
);
app.use(json());
app.use(cookieParser());
app.set('port', process.env.SERVER_PORT ?? 3000);

// ─── Supabase Service Client (use service_role, keep on server only) ──────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Healthcheck
app.get('/', (_req: any, res: any) => {
  res.status(200).json({ message: 'hello' });
});

// ─── Start a new chat ─────────────────────────────────────────────────────────
app.post('/chat/start', async (_req: any, res: any) => {
  try {
    // 1. Create chat row
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({}) // status defaults to 'bot'
      .select()
      .single();

    if (chatError) {
      log.error(chatError);
      return res.status(500).json({ error: 'Failed to create chat' });
    }

    // 2. Insert greeting
    const greeting =
      'Hello! I’m the Cats University admissions assistant. How can I help you today?';

    const { error: msgError } = await supabase.from('messages').insert({
      chat_id: chat.id,
      sender: 'bot',
      content: greeting,
    });

    if (msgError) {
      log.error(msgError);
      // Not fatal, still return chat
    }

    // 3. Return new chat with greeting
    res.status(200).json({
      chat_id: chat.id,
      greeting,
    });
  } catch (err) {
    log.error(err);
    res.status(500).json({ error: 'Unexpected error starting chat' });
  }
});

// ─── Student sends a message (with bot reply) ─────────────────────────────────
app.post('/chat/:chatId/message', async (req: any, res: any) => {
  const { chatId } = req.params;
  const { content } = req.body;

  // 1. Insert student message
  const { error: msgError } = await supabase.from('messages').insert({
    chat_id: chatId,
    sender: 'student',
    content,
  });

  if (msgError) {
    log.error(msgError);
    return res.status(500).json({ error: 'Failed to save message' });
  }

  // --- 2. If chat is not in bot phase, return and update to status = awaiting_human ───────────────────────────────────────
  const { data: chatData, error: chatError } = await supabase
    .from('chats')
    .select('status')
    .eq('id', chatId)
    .single();

  if (chatError || !chatData) {
    log.error(chatError);
    return res.status(500).json({ error: 'Failed to fetch chat status' });
  }

  // If status is not "bot", terminate
  if (chatData.status !== 'bot') {
    // Update chat status to awaiting human
    await supabase
      .from('chats')
      .update({ status: 'awaiting_human' })
      .eq('id', chatId);

    return res.status(200).json({
      student: { chat_id: chatId, sender: 'student', content },
    });
  }

  // ─── 3. Chat with our team ───────────────────────────────────────
  if (
    content.trim().toLowerCase() === 'i want to chat with an admissions staff'
  ) {
    const cannedReply =
      'Hello! Our College Admissions Staff will be here to answer you shortly. Please wait...';

    // Insert bot reply
    const { error: botError } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender: 'bot',
      content: cannedReply,
    });

    if (botError) {
      log.error(botError);
      return res.status(500).json({ error: 'Failed to save bot reply' });
    }

    // Update chat status to awaiting human
    await supabase
      .from('chats')
      .update({ status: 'awaiting_human' })
      .eq('id', chatId);

    // Return student + bot
    return res.status(200).json({
      student: { chat_id: chatId, sender: 'student', content },
      bot: { chat_id: chatId, sender: 'bot', content: cannedReply },
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

  // 4. Call OpenAI to generate reply
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful admissions assistant for Cats University. Our university teaches humans how to take good care of cats. Keep answers concise and factual. Always return your answer in plain text. Escalate to a human if unsure.',
        },
        { role: 'user', content },
      ],
      max_tokens: 200,
    });

    const botReply =
      completion.choices[0].message?.content ?? 'Sorry, I did not understand.';

    const { error: botError } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender: 'bot',
      content: botReply,
    });

    if (botError) {
      log.error(botError);
      return res.status(500).json({ error: 'Failed to save bot reply' });
    }

    res.status(200).json({
      student: { chat_id: chatId, sender: 'student', content },
      bot: { chat_id: chatId, sender: 'bot', content: botReply },
    });
  } catch (err) {
    log.error(err);
    return res.status(500).json({ error: 'Bot reply failed' });
  }
});

// ─── Admin auth ───────────────────────────────────────────────────────────────

// Admin login
app.post('/login', (req: any, res: any) => {
  const { password } = req.body ?? {};
  const hashedPassword = hash(password);

  if (password && checkHashedPassword(hashedPassword)) {
    res.cookie('auth', hashedPassword, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });
    return res.status(200).json({ message: 'Logged in' });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

// Admin logout
app.post('/logout', (_req: any, res: any) => {
  res.clearCookie('auth', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(200).json({ message: 'Logged out' });
});

// ─── Protected admin routes ───────────────────────────────────────────────────

// Check if is authenticated
app.get('/admin/auth', authMiddleware, async (_req: any, res: any) => {
  res.status(200).send('authenticated');
});

// Get all chats (dashboard view)
app.get('/admin/chats', authMiddleware, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabase.from('chats').select(`
        *,
        followups:followups (
          student_email,
          student_phone,
          preferred_time
        )
      `);

    if (error) {
      log.error(error);
      return res
        .status(500)
        .json({ error: 'Failed to fetch chats with followups' });
    }

    res.status(200).json({ chats: data });
  } catch (err) {
    log.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin reply in a chat
app.post(
  '/admin/chat/:chatId/reply',
  authMiddleware,
  async (req: any, res: any) => {
    const { chatId } = req.params;
    const { content } = req.body;

    // Insert message
    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender: 'admin',
      content,
    });

    if (error) {
      log.error(error);
      return res.status(500).json({ error: 'Failed to send reply' });
    }

    // Update to status=human if it's awaiting_human previously
    try {
      // Fetch current chat status
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('status')
        .eq('id', chatId)
        .single();

      if (chatError || !chatData) {
        log.error(chatError);
        return res.status(500).json({ error: 'Failed to fetch chat status' });
      }

      // If status is awaiting_human, update to human
      if (chatData.status === 'awaiting_human') {
        const { error: statusError } = await supabase
          .from('chats')
          .update({ status: 'human' })
          .eq('id', chatId);

        if (statusError) {
          log.error(statusError);
          return res
            .status(500)
            .json({ error: 'Failed to update chat status' });
        }
      }

      res.status(200).json({ message: 'Reply sent' });
    } catch (err) {
      log.error(err);
      return res.status(500).json({ error: 'Failed to update chat status' });
    }
  }
);

// ─── Server start ─────────────────────────────────────────────────────────────
server.listen(app.get('port'), () => {
  log.info(`Application started on port ${app.get('port')}`);
});

export default app;
