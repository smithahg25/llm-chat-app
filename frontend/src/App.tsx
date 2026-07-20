import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import MetadataPanel from './components/MetadataPanel';
import type { Conversation, InferenceLog } from './types';
import { api } from './api';
import { Toaster } from 'sonner';

const PROVIDER_MODELS = {
  gemini: ['gemini-2.0-flash', 'gemini-3.5-flash'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768']
};

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newChatCounter, setNewChatCounter] = useState(0);
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [provider, setProvider] = useState<keyof typeof PROVIDER_MODELS>('gemini');
  const [model, setModel] = useState(PROVIDER_MODELS.gemini[0]);

  const loadConversations = async (q?: string) => {
    try {
      const data = await api.getConversations(q);
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations', error);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await api.getLogs(activeId || undefined);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs', error);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [activeId]);

  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans">
      <Toaster theme="dark" position="top-right" />
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSearch={(q) => loadConversations(q)}
        onSelect={(id) => {
          if (id === null) setNewChatCounter(c => c + 1);
          setActiveId(id);
        }}
        onDelete={async (id) => {
          await api.deleteConversation(id);
          if (activeId === id) setActiveId(null);
          loadConversations();
        }}
      />
      <div className="flex-1 flex flex-col relative">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
           <select 
             className="bg-gray-800 text-white px-3 py-1 rounded-md text-sm border border-gray-700 focus:outline-none" 
             value={provider} 
             onChange={(e) => {
               const newProvider = e.target.value as keyof typeof PROVIDER_MODELS;
               setProvider(newProvider);
               setModel(PROVIDER_MODELS[newProvider][0]);
             }}
           >
             <option value="gemini">Gemini</option>
             <option value="openai">OpenAI</option>
             <option value="anthropic">Anthropic</option>
             <option value="groq">Groq</option>
           </select>
           <select 
             className="bg-gray-800 text-white px-3 py-1 rounded-md text-sm border border-gray-700 w-48 focus:outline-none" 
             value={model} 
             onChange={(e) => setModel(e.target.value)}
           >
             {PROVIDER_MODELS[provider].map(m => (
               <option key={m} value={m}>{m}</option>
             ))}
           </select>
        </div>
        <Chat
          key={activeId || `new-${newChatCounter}`}
          activeId={activeId}
          onConversationCreated={(id) => {
            setActiveId(id);
            loadConversations();
          }}
          onNewLog={loadLogs}
          provider={provider}
          model={model}
        />
      </div>
      <MetadataPanel logs={logs} />
    </div>
  );
}

export default App;
