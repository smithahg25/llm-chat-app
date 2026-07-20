# Assignment Submission

## Project Summary

NexusAI is a full-stack LLM chat application featuring a custom SDK wrapper and an asynchronous telemetry ingestion pipeline. It provides a production-grade chat interface alongside a real-time observability dashboard that monitors latency, throughput, token usage, and error rates. The project successfully abstracts multiple AI providers while ensuring high-performance, non-blocking telemetry collection.

## Technologies

- React 18, Vite, TailwindCSS
- Node.js, Express, Pino
- Prisma ORM, SQLite
- JWT Authentication
- Docker

## Assignment Checklist

- [x] Chatbot Interface
- [x] Custom SDK Wrapper
- [x] Automatic Inference Instrumentation
- [x] Telemetry Ingestion Pipeline
- [x] Database Schema & Relational Modeling
- [x] Observability Dashboard
- [x] Real-time Streaming
- [x] Error Handling
- [x] Deployment Readiness
- [x] Technical Documentation

## Bonus Features Completed

- JWT Authentication and Protected API Routes
- SDK Telemetry Batching Queue (In-memory)
- Server-side Pagination and UI Controls
- Global Search Across Conversations and Logs
- Automatic PII Redaction Engine
- Abort/Cancellation Request Handling
- Multiple LLM Provider Support (Groq, OpenAI, Gemini, Anthropic)

## Links

- Deployment URL: https://llm-chat-app-nine.vercel.app/
- GitHub Repository: https://github.com/smithahg25/llm-chat-app

Note: The deployed application is currently configured to demonstrate Groq interactions.
Creditionals for demo: 
username: Admin
password: Admin@123

## Key Architectural Decisions

- Decoupled Observability: Telemetry (`InferenceLog`) is stored separately from user data (`Message`). This allows users to delete conversations without corrupting historical analytics data.
- Non-blocking Ingestion: The SDK utilizes an in-memory batching queue that flushes logs every 5 seconds. This drastically reduces HTTP overhead and prevents the primary Node.js event loop from blocking during high-volume chat traffic.
- Normalized SDK: All LLM providers are normalized to a strict interface, allowing instant hot-swapping between providers without requiring any frontend code changes.
