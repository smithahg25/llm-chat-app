import axios from 'axios';
import type { Conversation, Message, InferenceLog } from './types';

const API_URL = 'http://localhost:3001';

export const api = {
  getConversations: async (q?: string): Promise<Conversation[]> => {
    const url = q && q.trim() ? `${API_URL}/conversations/search?q=${encodeURIComponent(q)}` : `${API_URL}/conversations`;
    const res = await axios.get(url);
    return res.data;
  },

  getMessages: async (id: string): Promise<Message[]> => {
    const res = await axios.get(`${API_URL}/conversations/${id}/messages`);
    return res.data;
  },

  deleteConversation: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/conversations/${id}`);
  },

  getLogs: async (conversationId?: string): Promise<InferenceLog[]> => {
    const url = conversationId ? `${API_URL}/logs?conversationId=${conversationId}` : `${API_URL}/logs`;
    const res = await axios.get(url);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, conversationId, provider, model }),
        signal
      }).then(async (response) => {
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
