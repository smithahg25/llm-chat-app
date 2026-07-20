import 'dotenv/config';
import jwt from 'jsonwebtoken';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { InstrumentLLM, ingester } from './sdk/llm';
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

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username: ADMIN_USERNAME } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.json({ success: true });
});

const authMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Expired token' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/auth/me', authMiddleware, (req: any, res: any) => {
  res.json({ user: req.user });
});

app.use('/ingest', authMiddleware);
app.use('/chat', authMiddleware);
app.use('/conversations', authMiddleware);
app.use('/logs', authMiddleware);
app.use('/throughput', authMiddleware);

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

app.post('/ingest/batch', async (req, res) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs must be an array' });
    }

    const results = [];
    let hasError = false;
    for (const logPayload of logs) {
      try {
        const { conversationId, provider, model, latency, promptTokens, completionTokens, totalTokens, status, error, requestPreview, responsePreview, timestamp, requestId, sessionId } = logPayload;
        if (!provider || !model || latency === undefined) {
          results.push({ success: false, error: 'Missing required fields' });
          hasError = true;
          continue;
        }
        const created = await prisma.inferenceLog.create({
          data: {
            conversationId, provider, model, latency, promptTokens, completionTokens, totalTokens,
            status, error: error ? String(error) : null, requestPreview, responsePreview,
            requestId, sessionId,
            timestamp: timestamp ? new Date(timestamp) : new Date()
          }
        });
        results.push({ success: true, id: created.id });
      } catch (err: any) {
        results.push({ success: false, error: err.message });
        hasError = true;
      }
    }
    res.status(207).json({ summary: results, hasError });
  } catch (error) {
    logger.error({ error }, 'Error in /ingest/batch');
    res.status(500).json({ error: 'Failed to ingest batch' });
  }
});

app.get('/ingest/metrics', (req, res) => {
  res.json(ingester.getMetrics());
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

const paginate = (req: any) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 50;
  return { page: Math.max(1, page), pageSize: Math.max(1, pageSize), skip: (Math.max(1, page) - 1) * Math.max(1, pageSize), take: Math.max(1, pageSize) };
};

app.get('/conversations', async (req, res) => {
  if (!req.query.page) {
    const conversations = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
    return res.json(conversations);
  }
  const { page, pageSize, skip, take } = paginate(req);
  const total = await prisma.conversation.count();
  const data = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' }, skip, take });
  res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

app.get('/conversations/search', async (req, res) => {
  const { q } = req.query;
  const term = String(q);
  const where = term ? {
    OR: [
      { title: { contains: term } },
      { messages: { some: { content: { contains: term } } } },
      { logs: { some: { provider: { contains: term } } } },
      { logs: { some: { model: { contains: term } } } }
    ]
  } : {};
  
  if (!req.query.page) {
    return res.json(await prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' } }));
  }

  const { page, pageSize, skip, take } = paginate(req);
  const total = await prisma.conversation.count({ where });
  const data = await prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take });
  res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

app.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!req.query.page) {
    const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: { timestamp: 'asc' } });
    return res.json(messages);
  }
  const { page, pageSize, skip, take } = paginate(req);
  const total = await prisma.message.count({ where: { conversationId: id } });
  const data = await prisma.message.findMany({ where: { conversationId: id }, orderBy: { timestamp: 'asc' }, skip, take });
  res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

app.delete('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  await prisma.conversation.delete({ where: { id } });
  res.json({ success: true });
});

app.get('/logs', async (req, res) => {
  const { conversationId } = req.query;
  const whereClause = conversationId ? { conversationId: String(conversationId) } : {};
  if (!req.query.page) {
    const logs = await prisma.inferenceLog.findMany({ where: whereClause, orderBy: { timestamp: 'desc' }, take: 100 });
    return res.json(logs);
  }
  const { page, pageSize, skip, take } = paginate(req);
  const total = await prisma.inferenceLog.count({ where: whereClause });
  const data = await prisma.inferenceLog.findMany({ where: whereClause, orderBy: { timestamp: 'desc' }, skip, take });
  res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

app.get('/throughput', async (req, res) => {
  const { timeRange } = req.query;
  const now = new Date();
  let startTime = new Date();

  if (timeRange === '1h') startTime.setHours(now.getHours() - 1);
  else if (timeRange === '24h') startTime.setHours(now.getHours() - 24);
  else if (timeRange === '7d') startTime.setDate(now.getDate() - 7);
  else startTime.setHours(now.getHours() - 1);

  const logs = await prisma.inferenceLog.findMany({
    where: { timestamp: { gte: startTime } },
    orderBy: { timestamp: 'asc' }
  });

  const total = logs.length;
  const success = logs.filter(l => l.status === 'success').length;
  const failure = logs.filter(l => l.status === 'failure').length;
  const cancelled = logs.filter(l => l.status === 'cancelled').length;

  const seconds = Math.max(1, (now.getTime() - startTime.getTime()) / 1000);
  const minutes = Math.max(1, seconds / 60);
  
  const rps = total / seconds;
  const rpm = total / minutes;

  const chartMap = new Map<string, number>();
  logs.forEach(l => {
    const date = new Date(l.timestamp);
    let key = '';
    if (timeRange === '1h') {
      key = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
      key = `${(date.getMonth()+1)}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:00`;
    }
    chartMap.set(key, (chartMap.get(key) || 0) + 1);
  });

  const chartData = Array.from(chartMap.entries()).map(([time, count]) => ({ time, count }));

  res.json({
    total,
    success,
    failure,
    cancelled,
    rps: rps.toFixed(2),
    rpm: rpm.toFixed(2),
    successRate: total ? ((success/total)*100).toFixed(1) : "0.0",
    failureRate: total ? ((failure/total)*100).toFixed(1) : "0.0",
    cancellationRate: total ? ((cancelled/total)*100).toFixed(1) : "0.0",
    chartData
  });
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
