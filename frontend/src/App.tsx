import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import MetadataPanel from './components/MetadataPanel';
import type { Conversation, InferenceLog } from './types';
import { api } from './api';
import { Toaster, toast } from 'sonner';

const PROVIDER_MODELS = {
  gemini: ['gemini-2.0-flash', 'gemini-3.5-flash'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768']
};

function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.login(username, password);
      onLogin();
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-black w-full">
      <form onSubmit={handleLogin} className="bg-gray-900 p-8 rounded-lg shadow-xl w-96 border border-gray-800">
        <h2 className="text-2xl text-white font-semibold mb-6 text-center">NexusAI Login</h2>
        {error && <div className="bg-red-500/20 text-red-400 p-2 text-sm rounded mb-4 text-center">{error}</div>}
        <input 
          className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2 mb-4 focus:outline-none focus:border-blue-500" 
          type="text" 
          placeholder="Username" 
          value={username} 
          onChange={e => setUsername(e.target.value)} 
        />
        <input 
          className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2 mb-6 focus:outline-none focus:border-blue-500" 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
        />
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded transition-colors">
          Sign In
        </button>
      </form>
    </div>
  );
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convPage, setConvPage] = useState(1);
  const [convPageSize, setConvPageSize] = useState(20);
  const [convTotal, setConvTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newChatCounter, setNewChatCounter] = useState(0);
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(20);
  const [logsTotal, setLogsTotal] = useState(0);
  const [ingestMetrics, setIngestMetrics] = useState<any>(null);

  const [provider, setProvider] = useState<keyof typeof PROVIDER_MODELS>('groq');
  const [model, setModel] = useState(PROVIDER_MODELS.groq[0]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const loadConversations = async (q?: string) => {
    try {
      const data = await api.getConversations(q, convPage, convPageSize);
      setConversations(data.data);
      setConvTotal(data.total);
    } catch (error) {
      console.error('Failed to load conversations', error);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await api.getLogs(activeId || undefined, logsPage, logsPageSize);
      setLogs(data.data);
      setLogsTotal(data.total);
      const metrics = await api.getIngestMetrics();
      setIngestMetrics(metrics);
    } catch (error) {
      console.error('Failed to load logs', error);
    }
  };

  useEffect(() => {
    loadConversations(searchQuery);
  }, [convPage, convPageSize, searchQuery]);

  useEffect(() => {
    loadLogs();
  }, [activeId, logsPage, logsPageSize]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.getMe()
        .then(() => setIsAuthenticated(true))
        .catch(() => {
           localStorage.removeItem('token');
           setIsAuthenticated(false);
        })
        .finally(() => setIsCheckingAuth(false));
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  if (isCheckingAuth) return <div className="flex h-screen bg-black items-center justify-center text-white">Loading...</div>;
  if (!isAuthenticated) return <Login onLogin={() => { setIsAuthenticated(true); loadConversations(); }} />;

  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans">
      <Toaster theme="dark" position="top-right" />
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSearch={(q) => { setSearchQuery(q); setConvPage(1); }}
        onSelect={(id) => {
          if (id === null) setNewChatCounter(c => c + 1);
          setActiveId(id);
        }}
        onDelete={async (id) => {
          await api.deleteConversation(id);
          if (activeId === id) setActiveId(null);
          loadConversations(searchQuery);
        }}
        page={convPage}
        pageSize={convPageSize}
        total={convTotal}
        onPageChange={setConvPage}
        onPageSizeChange={setConvPageSize}
      />
      <div className="flex-1 flex flex-col bg-gray-950">
        <div className="flex justify-end items-center gap-2 p-3 bg-gray-900 border-b border-gray-800 shrink-0">
           <select 
             className="bg-gray-800 text-white px-3 py-1 rounded-md text-sm border border-gray-700 focus:outline-none" 
             value={provider} 
             onChange={(e) => {
               const newProvider = e.target.value as keyof typeof PROVIDER_MODELS;
               if (newProvider !== 'groq') {
                 toast.error("You don't have a paid API key for this provider. Please use Groq.");
                 return;
               }
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
           <button 
             onClick={() => { api.logout(); setIsAuthenticated(false); setConversations([]); setLogs([]); setActiveId(null); }}
             className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm transition-colors"
           >
             Logout
           </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Chat
            key={activeId || `new-${newChatCounter}`}
            activeId={activeId}
            onConversationCreated={(id) => {
              setActiveId(id);
              loadConversations(searchQuery);
            }}
            onNewLog={loadLogs}
            provider={provider}
            model={model}
          />
        </div>
      </div>
      <MetadataPanel 
        logs={logs} 
        page={logsPage}
        pageSize={logsPageSize}
        total={logsTotal}
        onPageChange={setLogsPage}
        onPageSizeChange={setLogsPageSize}
        ingestMetrics={ingestMetrics}
      />
    </div>
  );
}

export default App;
