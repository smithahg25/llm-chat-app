# NexusAI - Scalable Full-Stack LLM Architecture

A production-grade, multi-provider LLM chat application featuring asynchronous telemetry ingestion, observability dashboards, and real-time streaming.

## 1. Setup Instructions

### Prerequisites
- Node.js (v18+)
- SQLite (built-in via Prisma)
- API Keys for desired providers (OpenAI, Gemini, Groq, Anthropic)

### Installation
1. Clone the repository.
2. Navigate to the backend and frontend directories to install dependencies:
```bash
cd backend && npm install
cd ../frontend && npm install
```

3. Setup Environment Variables in `/backend/.env`:
```env
PORT=3001
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="sk-..."
GEMINI_API_KEY="AIza..."
GROQ_API_KEY="gsk_..."
ANTHROPIC_API_KEY="sk-ant-..."
```

4. Apply database schema and generate the Prisma Client:
```bash
cd backend
npx prisma db push
npx prisma generate
```

5. Run the application (development mode):
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

### Docker Deployment
```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

---

## 2. Architecture Overview

NexusAI utilizes a heavily decoupled Client-Server architecture:
- **Frontend**: React, Vite, TailwindCSS v4, Recharts, `react-markdown`.
- **Backend**: Node.js, Express, Prisma, Better-SQLite3, custom LLM SDK Wrapper.
- **Observability**: A custom telemetry pipeline logs request metadata, latencies, token usages, and correlation IDs asynchronously without blocking the user's chat stream.

The application uses **Server-Sent Events (SSE)** to stream LLM chunks back to the client in real-time, providing immediate visual feedback while the server computes the full completion. 

---

## 3. Schema Design Decisions

The database is modeled sequentially around a `Conversation` aggregate:
- **Conversation**: The root entity. Holds the title and metadata.
- **Message**: Child of `Conversation`. Represents a single turn (user or assistant). Relies on `Cascade` deletion.
- **InferenceLog**: Disconnected from `Message` but loosely coupled to `Conversation` (SetNull on delete). This allows us to track API usage and telemetry independently of the user's message history. It contains strict telemetry indices (`requestId`, `timestamp`, `conversationId`) for high-speed dashboard aggregations.

**Design Choice**: By separating `InferenceLog` from `Message`, we ensure that if a user deletes a message, our telemetry/audit logs remain intact for billing and observability.

---

## 4. Tradeoffs Made

- **Database Choice**: Used SQLite for portability and ease of setup. *Tradeoff*: SQLite locks on heavy concurrent writes. For true horizontal scaling, this would be swapped to PostgreSQL.
- **Ingestion Synchronicity**: The ingestion HTTP endpoint is synchronous to the backend's Express loop. *Tradeoff*: Under immense traffic, firing telemetry synchronously can bottleneck Node's event loop. 
- **In-Memory Streaming**: The LLM streams chunk-by-chunk through the Express router to the client. *Tradeoff*: We hold the aggregated response string in memory until the stream finishes to redact PII and save the full message. Highly intensive for long contexts.

---

## 5. What I Would Improve With More Time

1. **Message Broker Integration**: Introduce Apache Kafka or Redis (BullMQ) to decouple the `/ingest` telemetry pipeline from the main chat loop.
2. **PostgreSQL / Connection Pooling**: Migrate off SQLite and implement Prisma Accelerate or pgBouncer to handle concurrent DB connections across horizontally scaled containers.
3. **Authentication Layer**: Add NextAuth or JWT middleware to protect the API routes from unauthorized API key consumption.
4. **Caching Layer**: Implement a Redis cache to deduplicate identical user queries and serve them instantly, bypassing the LLMs entirely.

---

## 6. Architecture Notes

### Ingestion Flow
1. A user sends a prompt via the UI.
2. The custom `InstrumentLLM` SDK intercepts the request.
3. It assigns a `correlationId` and `sessionId`.
4. It streams the LLM response to the client via SSE.
5. Once complete, it calculates tokens, latency, applies PII redaction, and fires a non-blocking background request to `POST /ingest`.
6. The `POST /ingest` endpoint persists the telemetry in the database for the Recharts dashboard.

### Logging Strategy
- We utilize `pino` for high-performance, structured JSON logging.
- `req.headers['x-correlation-id']` is injected at the middleware level, tracing a request entirely from the HTTP ingress down through the Prisma database transaction.
- Critical errors (`uncaughtException`, `unhandledRejection`) gracefully shutdown the server after flushing logs.

### Scaling Considerations
- The current Node.js setup is largely stateless, meaning you can spin up multiple backend containers behind a load balancer (e.g., NGINX).
- To truly scale, SQLite must be replaced with PostgreSQL to prevent `SQLITE_BUSY` errors during concurrent writes to `InferenceLog`.

### Failure Handling Assumptions
- **Network Interruptions**: The frontend relies on `AbortController`. If the user hits "Stop", the network request is aborted, the backend catches the `close` event, and the LLM stream is safely killed midway, logging a `cancelled` state.
- **Provider Outages**: Differentiated catch blocks intercept 429 (Rate Limits) and 401 (Auth errors) and gracefully relay them to the frontend UI as toast notifications rather than hard-crashing the server.
