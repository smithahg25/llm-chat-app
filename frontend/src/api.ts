import axios from 'axios';
import type { Conversation, Message, InferenceLog, PaginatedResponse } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  login: async (username: string, password: string) => {
    const res = await axios.post(`${API_URL}/auth/login`, { username, password });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
    }
    return res.data;
  },
  
  logout: async () => {
    await axios.post(`${API_URL}/auth/logout`);
    localStorage.removeItem('token');
  },
  
  getMe: async () => {
    const res = await axios.get(`${API_URL}/auth/me`);
    return res.data;
  },
  getConversations: async (q?: string, page = 1, pageSize = 20): Promise<PaginatedResponse<Conversation>> => {
    const url = q && q.trim() 
      ? `${API_URL}/conversations/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}` 
      : `${API_URL}/conversations?page=${page}&pageSize=${pageSize}`;
    const res = await axios.get(url);
    return res.data;
  },

  getMessages: async (id: string, page = 1, pageSize = 50): Promise<PaginatedResponse<Message>> => {
    const res = await axios.get(`${API_URL}/conversations/${id}/messages?page=${page}&pageSize=${pageSize}`);
    return res.data;
  },

  deleteConversation: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/conversations/${id}`);
  },

  getLogs: async (conversationId?: string, page = 1, pageSize = 20): Promise<PaginatedResponse<InferenceLog>> => {
    const url = conversationId 
      ? `${API_URL}/logs?conversationId=${conversationId}&page=${page}&pageSize=${pageSize}` 
      : `${API_URL}/logs?page=${page}&pageSize=${pageSize}`;
    const res = await axios.get(url);
    return res.data;
  },

  getIngestMetrics: async () => {
    const res = await axios.get(`${API_URL}/ingest/metrics`);
    return res.data;
  },

  getThroughput: async (timeRange = '1h') => {
    const res = await axios.get(`${API_URL}/throughput?timeRange=${timeRange}`);
    return res.data;
  },

  sendMessage: async (content: string, conversationId: string | null, provider = 'gemini', model = ''): Promise<{ conversationId: string; message: Message }> => {
    const res = await axios.post(`${API_URL}/chat`, { content, conversationId, provider, model });
    return res.data;
  },
  
  streamMessage: async (
    content: string, 
    conversationId: string | null, 
    provider = 'gemini', 
    model = '', 
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ conversationId: string; message: Message }> => {
    return new Promise((resolve, reject) => {
      fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content, conversationId, provider, model }),
        signal
      }).then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
             localStorage.removeItem('token');
             window.location.reload();
          }
          return reject(new Error('Failed to stream'));
        }
        if (!response.body) return reject(new Error('No response body'));
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let cId = conversationId;
        
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunkValue = decoder.decode(value, { stream: true });
            const lines = chunkValue.split('\n\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.type === 'init') cId = data.conversationId;
                  if (data.type === 'chunk') onChunk(data.content);
                  if (data.type === 'error') reject(new Error(data.error));
                  if (data.type === 'done') resolve({ conversationId: cId as string, message: data.message });
                } catch (e) {}
              }
            }
          }
        }
      }).catch(reject);
    });
  }
};
