import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import MetadataPanel from './components/MetadataPanel';
import type { Conversation, InferenceLog } from './types';
import { api } from './api';
import { Toaster, toast } from 'sonner';
import { Menu, Info, X, LogOut } from 'lucide-react';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
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
    <div className="flex h-screen bg-black overflow-hidden font-sans relative">
      <Toaster theme="dark" position="top-right" />
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
      
      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSearch={(q) => { setSearchQuery(q); setConvPage(1); }}
          onSelect={(id) => {
            if (id === null) setNewChatCounter(c => c + 1);
            setActiveId(id);
            setIsSidebarOpen(false);
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
        {isSidebarOpen && (
          <button className="absolute top-3 -right-12 text-gray-300 hover:text-white md:hidden bg-gray-800 rounded-full p-1.5 border border-gray-700" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-gray-950 min-w-0">
        <div className="flex justify-between md:justify-end items-center gap-2 p-3 bg-gray-900 border-b border-gray-800 shrink-0">
           <button className="md:hidden text-gray-300 hover:text-white" onClick={() => setIsSidebarOpen(true)}>
             <Menu size={24} />
           </button>
           
           <div className="flex items-center gap-2 flex-1 md:flex-none justify-end">
             <select 
               className="bg-gray-800 text-white px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm border border-gray-700 focus:outline-none w-24 md:w-auto truncate" 
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
               className="bg-gray-800 text-white px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm border border-gray-700 w-32 md:w-48 focus:outline-none truncate" 
               value={model} 
               onChange={(e) => setModel(e.target.value)}
             >
               {PROVIDER_MODELS[provider].map(m => (
                 <option key={m} value={m}>{m}</option>
               ))}
             </select>
             <button 
               onClick={() => { api.logout(); setIsAuthenticated(false); setConversations([]); setLogs([]); setActiveId(null); }}
               className="bg-red-600 hover:bg-red-700 text-white p-1.5 md:px-3 md:py-1.5 rounded-md text-sm transition-colors flex items-center justify-center"
               title="Logout"
             >
               <LogOut size={16} className="md:hidden" />
               <span className="hidden md:inline">Logout</span>
             </button>
           </div>
           
           <button className="xl:hidden text-gray-300 hover:text-white ml-2" onClick={() => setIsMetadataOpen(true)}>
             <Info size={24} />
           </button>
        </div>
        <div className="flex-1 overflow-hidden relative">
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
      
      {/* Mobile Metadata Overlay */}
      {isMetadataOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 xl:hidden" onClick={() => setIsMetadataOpen(false)} />
      )}

      {/* Metadata Container */}
      <div className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 xl:relative xl:translate-x-0 ${isMetadataOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {isMetadataOpen && (
          <button className="absolute top-3 -left-12 text-gray-300 hover:text-white xl:hidden bg-gray-800 rounded-full p-1.5 border border-gray-700" onClick={() => setIsMetadataOpen(false)}>
            <X size={20} />
          </button>
        )}
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
    </div>
  );
}

export default App;
