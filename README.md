# NexusAI

## Project Overview

NexusAI is a production-oriented multi-provider LLM chat application built to demonstrate robust system design, asynchronous telemetry ingestion, and real-time observability. 

This project was developed as an engineering assignment to build a chat interface backed by an automatic inference instrumentation pipeline. It showcases core engineering concepts including SDK abstraction, non-blocking telemetry batching, database relational modeling, and real-time streaming.

## Features

### Core Features
- Multi-turn conversations
- Conversation history tracking
- Resume previous conversations
- Cancel response generation
- Real-time streaming responses via SSE
- Markdown rendering with syntax highlighting
- Global search across conversations and metadata
- Server-side cursor and page-based pagination
- Export telemetry logs (CSV/JSON generation)

### Observability
- Latency tracking and dashboarding
- Throughput monitoring (Requests Per Minute/Second)
- Error and cancellation analytics
- Token usage tracking (Prompt and Completion)
- Recent telemetry logs feed
- SDK telemetry batching metrics (Queue size, flush tracking)

### SDK Features
- Automatic instrumentation of LLM calls
- Distributed Request IDs
- Correlation IDs
- Session IDs
- Automatic token calculation
- Latency calculation
- Unified provider abstraction layer
- Background in-memory batching ingestion
- Retry logic for failed telemetry flushes
- Automatic PII redaction (Emails, Phone numbers)

### Security
- JWT-based authentication
- Protected API routes
- Configurable environment-based credentials
- Rate limiting on chat generation

### Deployment
- Docker and Docker Compose support
- Containerized frontend and backend environments
- Environment variable configuration

## Provider Support

The underlying SDK architecture fully supports multiple LLM providers:
- Groq
- OpenAI
- Gemini
- Anthropic

However, the hosted demo is currently configured to use Groq with the `llama-3.3-70b-versatile` model by default. Additional providers can be enabled locally by adding their respective API keys to the backend environment variables.

## Technology Stack

- Frontend: React 18, Vite, TailwindCSS, Recharts
- Backend: Node.js, Express, Pino (Logging)
- Database: SQLite, Prisma ORM
- Authentication: JSON Web Tokens (JWT)
- SDK: Axios, Official Provider SDKs
- Observability: Recharts, Custom Ingestion Pipeline
- Deployment: Docker, Docker Compose

## Project Structure

- `backend/` - Contains the Express server, SDK, database models, and API routes.
  - `prisma/` - Database schema and migration artifacts.
  - `src/` - API endpoints and middleware logic.
  - `src/sdk/` - Custom InstrumentLLM and Batching SDK wrapper.
- `frontend/` - Contains the React client application.
  - `src/components/` - UI elements including Chat, Sidebar, and MetadataPanel.
  - `src/api.ts` - Axios client configurations and interceptors.

## Architecture Overview

The system is decoupled into specific functional layers:

- Frontend: A React SPA that handles UI state, streaming LLM responses, and rendering observability metrics.
- Backend: An Express API that manages authentication, routes LLM requests, and processes database operations.
- SDK: A custom wrapper intercepting LLM requests to provide unified streaming and telemetry extraction.
- Telemetry: An in-memory batching queue that collects metadata without blocking the primary event loop.
- Database: SQLite managed by Prisma ORM for relational persistence.
- Streaming: Server-Sent Events (SSE) connecting the backend chunk generation directly to the frontend client.

## SDK Design

The SDK acts as a proxy between the backend route handlers and external LLM providers. When a request is initiated, the SDK:
1. Normalizes the request payload for the specified provider.
2. Generates unique Request, Correlation, and Session IDs.
3. Records a start timestamp.
4. Initiates a streaming connection with the provider.
5. Emits text chunks back to the client via an exposed callback.
6. Upon completion, calculates final latency and token usage.
7. Scrubs personally identifiable information (PII).
8. Pushes the telemetry payload into the `BatchingIngester` queue.

The in-memory queue flushes logs to the backend ingestion API every 5 seconds or upon reaching 50 items.

## Telemetry Pipeline

User Request
↓
SDK Execution
↓
Telemetry Collection (Latency, Tokens, IDs)
↓
In-Memory Batch Queue
↓
Ingestion API Endpoint (`/ingest/batch`)
↓
Database (InferenceLog table)
↓
Observability Dashboard

## Database Design

The database schema utilizes three core models:

- Conversation: The root entity tracking chat sessions.
- Message: Belongs to a Conversation. Stores the user and assistant text payloads. Uses Cascade deletion rules.
- InferenceLog: Belongs to a Conversation. Stores strict telemetry metadata (latency, tokens, status). Uses SetNull deletion rules.

Telemetry is stored in a separate table from Messages to decouple analytical data from user data. If a user deletes a conversation, the messages are destroyed, but the InferenceLogs are retained (with a null relationship) to ensure throughput and latency metrics remain accurate over time.

## API Endpoints

| Method | Endpoint | Description | Authentication Required |
|---|---|---|---|
| POST | /auth/login | Authenticate user and receive JWT | No |
| POST | /auth/logout | Terminate session | No |
| GET | /auth/me | Validate current session | Yes |
| POST | /chat | Blocking chat completion | Yes |
| POST | /chat/stream | SSE streaming chat completion | Yes |
| GET | /conversations | Retrieve paginated conversations | Yes |
| GET | /conversations/search | Search conversations and logs | Yes |
| GET | /conversations/:id/messages | Retrieve paginated messages | Yes |
| DELETE | /conversations/:id | Delete a specific conversation | Yes |
| GET | /logs | Retrieve paginated inference telemetry | Yes |
| POST | /ingest | Legacy single-log ingestion | Yes |
| POST | /ingest/batch | Bulk telemetry insertion | Yes |
| GET | /ingest/metrics | Retrieve SDK queue batching metrics | Yes |
| GET | /throughput | Retrieve time-series graph metrics | Yes |
| GET | /health | System health check | No |

## Installation

Clone the repository:
```bash
git clone https://github.com/smithahg25/llm-chat-app.git
cd llm-chat-app
```

Install dependencies:
```bash
cd backend && npm install
cd ../frontend && npm install
```

Configure backend environment variables:
```bash
cp backend/.env.example backend/.env
```
Ensure to add your LLM API keys and configure the JWT secret in `.env`.

Initialize the database:
```bash
cd backend
npx prisma db push
npx prisma generate
```

Start the application:
```bash
# Terminal 1 (Backend)
cd backend && npm run dev

# Terminal 2 (Frontend)
cd frontend && npm run dev
```

## Environment Variables

The following variables are required in `backend/.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `GROQ_API_KEY` (or alternative provider keys)

## Docker

To run the application using Docker Compose:

1. Ensure your `.env` file is configured in the backend directory.
2. Run the following command from the project root:
```bash
docker compose up -d --build
```
This will containerize both the frontend and backend services and attach them to the same network.

## Assignment Requirement Mapping

| Requirement | Implementation | Status |
|---|---|---|
| Chatbot Application | React SPA with markdown support | Implemented |
| SDK Wrapper | Custom InstrumentLLM supporting multiple providers | Implemented |
| Automatic Instrumentation | SDK measures latency, tokens, and IDs | Implemented |
| Ingestion Pipeline | In-memory batching queue to `/ingest/batch` | Implemented |
| Database | Prisma schema with SQLite | Implemented |
| Observability Dashboard | Recharts UI for latency, throughput, and tokens | Implemented |
| Streaming | Server-Sent Events (SSE) implementation | Implemented |
| Error Handling | Try/catch blocks with UI toast notifications | Implemented |
| Documentation | Extensive README, ARCHITECTURE, and SUBMISSION | Implemented |
| Docker Support | Dockerfile and docker-compose.yml | Implemented |
| **Bonus**: Authentication | JWT middleware with environment credentials | Implemented |
| **Bonus**: Telemetry Batching | SDK queue flushing every 5s | Implemented |
| **Bonus**: Pagination | Cursor-based Prisma queries with UI controls | Implemented |
| **Bonus**: PII Redaction | Regex stripping of emails/phones from logs | Implemented |
| **Bonus**: Global Search | Multi-table query execution | Implemented |

## Tradeoffs

- SQLite vs PostgreSQL: SQLite was chosen for local development simplicity and portability. However, under extreme concurrent loads, SQLite will lock. A migration to PostgreSQL is required for true horizontal scaling.
- Batching Ingestion: In-memory batching reduces database write pressure but introduces volatility. If the Node.js process crashes before a flush, up to 5 seconds of telemetry data could be lost.
- Streaming Redaction: PII redaction currently occurs after the full string is assembled in memory, rather than being parsed natively on the stream chunks in transit, to simplify the regex logic.

## Demo

Live Application:
https://llm-chat-app-nine.vercel.app/

GitHub Repository:
https://github.com/smithahg25/llm-chat-app

The deployed application currently demonstrates Groq, while the underlying SDK architecture supports multiple providers.
Creditionals for demo: 
username: Admin
password: Admin@123
