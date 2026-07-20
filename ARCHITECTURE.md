# Architecture Overview

## High-Level Architecture

The NexusAI application is built on a decoupled client-server architecture designed for high throughput and extensive observability.

1. Frontend Layer: A React 18 single-page application utilizing Vite. It maintains local state for the chat interface and uses Recharts to render real-time telemetry metrics.
2. API Layer: A Node.js Express server that acts as the central router, handling authentication, data retrieval, and LLM request forwarding.
3. Persistence Layer: An SQLite database managed by Prisma ORM.

## SDK Flow

The custom `InstrumentLLM` SDK is instantiated by the backend router. It intercepts all outbound requests to external AI providers (Groq, OpenAI, Gemini, Anthropic).

1. Initiation: The SDK accepts normalized user prompts.
2. Metadata Generation: It generates a `requestId`, `correlationId`, and extracts the `sessionId`.
3. Execution: A timer begins. The request is forwarded to the external provider.
4. Streaming: The SDK yields text chunks back to the Express router using asynchronous generators.
5. Completion: Upon stream completion, the timer stops, establishing the final latency. Total token counts are calculated or estimated.
6. Redaction: PII (emails and phone numbers) is stripped from the request and response strings.
7. Dispatch: The normalized log object is passed to the telemetry batching engine.

## Ingestion Flow

To prevent database write locks and event loop blocking, telemetry is not saved synchronously.

1. The SDK pushes completed logs into the `BatchingIngester` memory array.
2. The ingester maintains an internal timer and size counter.
3. Every 5 seconds, or when the queue reaches 50 items, the array is flushed.
4. The flush mechanism sends an internal authenticated HTTP request to the `/ingest/batch` API endpoint.
5. The endpoint executes a bulk database transaction.
6. If the insertion fails, the SDK catches the error and unshifts the failed logs back to the front of the queue for a retry on the next interval.

## Logging Strategy

The application uses Pino for high-performance, structured JSON logging.
Each incoming HTTP request is assigned an `x-correlation-id` header by a global middleware. This ID is passed down through the Express route, into the SDK, and saved within the database telemetry log. This ensures that every action is fully traceable across the stack.

## Scaling Considerations

The current application is largely stateless. Session state is managed via client-side JWTs, and the in-memory SDK queues act independently. 
Therefore, the Node.js containers can be scaled horizontally behind a load balancer (such as NGINX).

The primary scaling bottleneck is the SQLite database. SQLite locks the entire database file during write operations. To scale beyond a single instance or handle heavy concurrent telemetry ingestion, the database provider must be migrated to PostgreSQL.

## Failure Handling

- Provider Outages: The SDK catches 401 (Auth) and 429 (Rate Limit) errors from providers, safely terminating the stream and relaying a clean error message back to the frontend to display as a toast notification.
- Client Disconnects: The frontend utilizes `AbortController`. If a user stops a generation, or navigates away, the HTTP connection drops. The backend catches the `close` event, triggers an abort signal in the SDK, and halts the provider stream to save computational resources.
- Telemetry Failures: If the database is locked or the internal `/ingest` request fails, the batching engine automatically retries on the next cycle, ensuring observability data is not easily discarded.

## Design Decisions

- Separate Telemetry Table: `InferenceLog` is decoupled from `Message`. This ensures that user data deletions do not destroy historical billing or performance analytics.
- Server-Sent Events (SSE): Chosen over WebSockets for chat streaming due to lower overhead and native unidirectional browser support.
- Centralized SDK: Wrapping all official provider SDKs (OpenAI, Anthropic, etc.) behind a single class prevents provider-specific logic from leaking into the Express routing layer.
