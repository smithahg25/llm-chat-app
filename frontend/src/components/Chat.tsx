import { useState, useEffect, useRef } from 'react';
import type { Message } from '../types';
import { Send, User, Bot, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../api';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface ChatProps {
  activeId: string | null;
  onConversationCreated: (id: string) => void;
  onNewLog: () => void;
  provider: string;
  model: string;
}

export default function Chat({ activeId, onConversationCreated, onNewLog, provider, model }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeId) {
      api.getMessages(activeId).then(setMessages).catch(() => toast.error('Failed to load messages'));
    } else {
      setMessages([]);
    }
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleRetry = () => {
    if (messages.length === 0) return;
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
       handleSubmit(new Event('submit') as any, lastUserMsg.content);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent, retryContent?: string) => {
    e.preventDefault();
    const textToSubmit = retryContent || input;
    if (!textToSubmit.trim() || isLoading) return;

    const userMsg = textToSubmit;
    setInput('');
    setIsLoading(true);

    if (!retryContent) {
       setMessages(prev => [...prev, { id: Date.now().toString(), conversationId: activeId || '', role: 'user', content: userMsg, timestamp: new Date().toISOString() }]);
    }

    try {
      setIsStreaming(true);
      setStreamingText('');
      abortControllerRef.current = new AbortController();

      const { conversationId, message } = await api.streamMessage(userMsg, activeId, provider, model, (chunk) => {
        setStreamingText(prev => prev + chunk);
      }, abortControllerRef.current.signal);
      
      if (!activeId) {
        onConversationCreated(conversationId);
      } else {
        setMessages(prev => [...prev, message]);
      }
      onNewLog();
      setStreamingText('');
      setIsStreaming(false);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        toast.info('Generation stopped');
        if (streamingText) {
           setMessages(prev => [...prev, { id: Date.now().toString(), conversationId: activeId || '', role: 'assistant', content: streamingText + ' *(stopped)*', timestamp: new Date().toISOString() }]);
        }
      } else if (error.message?.includes('429')) {
        toast.error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('401')) {
        toast.error('Provider authentication failed. Check your API keys.');
      } else if (error.message?.includes('timeout')) {
        toast.error('Request timed out.');
      } else {
        toast.error(error.message || 'Failed to send message');
      }
      onNewLog();
      setStreamingText('');
      setIsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-900 h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Bot size={48} className="mb-4 opacity-50" />
            <p className="text-xl">How can I help you today?</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <Bot size={18} className="text-white" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl p-4 overflow-hidden ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                  <User size={18} className="text-white" />
                </div>
              )}
            </div>
          ))
        )}
        
        {isStreaming && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="max-w-[80%] rounded-2xl p-4 bg-gray-800 text-gray-100 rounded-bl-none overflow-hidden">
               <div className="prose prose-invert max-w-none">
                 <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                   {streamingText}
                 </ReactMarkdown>
               </div>
            </div>
          </div>
        )}
        
        {isLoading && !isStreaming && (
           <div className="flex gap-4 justify-start">
             <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
               <Bot size={18} className="text-white" />
             </div>
             <div className="max-w-[80%] rounded-2xl p-4 bg-gray-800 text-gray-100 rounded-bl-none flex items-center gap-2">
               <Loader2 size={16} className="animate-spin text-blue-400" />
               <span className="text-sm text-gray-400">Thinking...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          {isStreaming ? (
            <button type="button" onClick={handleStop} className="p-3 rounded-xl bg-red-900/50 text-red-400 hover:text-red-300 hover:bg-red-900/80 transition-colors">
              <XCircle size={20} />
            </button>
          ) : (
            <button type="button" onClick={handleRetry} disabled={messages.length === 0 || isLoading} className="p-3 rounded-xl bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50">
              <RotateCcw size={20} />
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
