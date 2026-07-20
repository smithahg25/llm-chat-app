export interface Conversation {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface InferenceLog {
  id: string;
  conversationId: string;
  provider: string;
  model: string;
  latency: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  status: string;
  error?: string;
  requestPreview?: string;
  responsePreview?: string;
  timestamp: string;
  requestId?: string;
  sessionId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
