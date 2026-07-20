import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { InstrumentLLM } from './sdk/llm';
import { logger } from './logger';

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'OPENAI_API_KEY', 'GEMINI_API_KEY'];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    logger.fatal(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const app = express();

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-correlation-id', req.headers['x-correlation-id']);
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/chat', limiter);

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ 
      status: 'ok', 
      database: 'connected',
      uptime: process.uptime(),
      activeProviders: ['gemini', 'openai', 'anthropic', 'groq'],
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.post('/ingest', async (req, res) => {
  try {
    const { conversationId, provider, model, latency, promptTokens, completionTokens, totalTokens, status, error, requestPreview, responsePreview, timestamp, requestId, sessionId } = req.body;
    if (!provider || !model || latency === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const log = await prisma.inferenceLog.create({
      data: {
        conversationId, provider, model, latency, promptTokens, completionTokens, totalTokens,
        status, error: error ? String(error) : null, requestPreview, responsePreview,
        requestId, sessionId,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      }
    });
    res.status(201).json(log);
  } catch (error) {
    logger.error({ error }, 'Error in /ingest');
    res.status(500).json({ error: 'Failed to ingest log' });
  }
});

app.post('/chat', async (req, res) => {
  const { conversationId, content, provider = 'gemini', model } = req.body;
  const correlationId = req.headers['x-correlation-id'] as string;
  try {
    let cId = conversationId;
    if (!cId) {
      const newConv = await prisma.conversation.create({ data: { title: content.substring(0, 50) } });
      cId = newConv.id;
    }
    await prisma.message.create({ data: { conversationId: cId, role: 'user', content } });
    const messages = await prisma.message.findMany({ where: { conversationId: cId }, orderBy: { timestamp: 'asc' } });
    
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const aiResponse = await InstrumentLLM.generateChat({
      provider, model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      conversationId: cId,
      correlationId,
      abortSignal: abortController.signal
    });
    
    const aiMsg = await prisma.message.create({
      data: { conversationId: cId, role: 'assistant', content: aiResponse.text }
    });
    res.json({ conversationId: cId, message: aiMsg });
  } catch (error: any) {
    logger.error({ error }, 'Chat error');
    res.status(500).json({ error: error.message || 'Chat generation failed' });
  }
});

app.post('/chat/stream', async (req, res) => {
  const { conversationId, content, provider = 'gemini', model } = req.body;
  const correlationId = req.headers['x-correlation-id'] as string;
  try {
    let cId = conversationId;
    if (!cId) {
      const newConv = await prisma.conversation.create({ data: { title: content.substring(0, 50) } });
      cId = newConv.id;
    }
    await prisma.message.create({ data: { conversationId: cId, role: 'user', content } });
    const messages = await prisma.message.findMany({ where: { conversationId: cId }, orderBy: { timestamp: 'asc' } });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({ type: 'init', conversationId: cId })}\n\n`);

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const aiResponse = await InstrumentLLM.generateChat({
      provider, model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      conversationId: cId,
      correlationId,
      abortSignal: abortController.signal,
      onChunk: (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }
    });
    
    const aiMsg = await prisma.message.create({
      data: { conversationId: cId, role: 'assistant', content: aiResponse.text }
    });
    
    res.write(`data: ${JSON.stringify({ type: 'done', message: aiMsg })}\n\n`);
    res.end();
  } catch (error: any) {
    logger.error({ error }, 'Chat stream error');
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Stream generation failed' })}\n\n`);
    res.end();
  }
});

app.get('/conversations', async (req, res) => {
  const conversations = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json(conversations);
});

app.get('/conversations/search', async (req, res) => {
  const { q } = req.query;
  const term = String(q);
  if (!term) {
    return res.json(await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } }));
  }
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { title: { contains: term } },
        { messages: { some: { content: { contains: term } } } },
        { logs: { some: { provider: { contains: term } } } },
        { logs: { some: { model: { contains: term } } } }
      ]
    },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(conversations);
});

app.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: { timestamp: 'asc' } });
  res.json(messages);
});

app.delete('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  await prisma.conversation.delete({ where: { id } });
  res.json({ success: true });
});

app.get('/logs', async (req, res) => {
  const { conversationId } = req.query;
  const whereClause = conversationId ? { conversationId: String(conversationId) } : {};
  const logs = await prisma.inferenceLog.findMany({
    where: whereClause,
    orderBy: { timestamp: 'desc' },
    take: 100
  });
  res.json(logs);
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`Backend running on http://localhost:${PORT}`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Prisma disconnected.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Rejection');
  process.exit(1);
});
