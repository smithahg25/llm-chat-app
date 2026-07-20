import { useState, useEffect } from 'react';
import type { Conversation } from '../types';
import { PlusCircle, MessageSquare, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSearch: (q: string) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

export default function Sidebar({ conversations, activeId, onSearch, onSelect, onDelete, page, pageSize, total, onPageChange, onPageSizeChange }: SidebarProps) {
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      onSearch(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(conversations, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = "conversations.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full border-r border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">NexusAI</h1>
          <button onClick={handleExport} className="text-xs text-gray-400 hover:text-white" title="Export Conversations to JSON">Export</button>
        </div>
        <button
          onClick={() => onSelect(null)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors mb-4"
        >
          <PlusCircle size={18} />
          <span>New Chat</span>
        </button>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
          <input type="text" placeholder="Search chats..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-gray-800 text-sm text-white rounded-lg pl-9 pr-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
              activeId === conv.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <MessageSquare size={18} className="shrink-0" />
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">{conv.title}</span>
                <span className="text-xs text-gray-500">{format(new Date(conv.updatedAt), 'MMM d, h:mm a')}</span>
              </div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
              title="Delete conversation"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-10">No conversations found</div>
        )}
      </div>

      <div className="p-3 border-t border-gray-800 flex flex-col gap-2 text-xs text-gray-400 bg-gray-900">
        <div className="flex justify-between items-center">
          <span>Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total}</span>
          <select 
            value={pageSize} 
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
            className="bg-gray-800 text-white rounded px-1 py-0.5 border border-gray-700"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="flex justify-between">
          <button 
            disabled={page === 1} 
            onClick={() => onPageChange(page - 1)}
            className="hover:text-white disabled:opacity-50"
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button 
            disabled={page * pageSize >= total} 
            onClick={() => onPageChange(page + 1)}
            className="hover:text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
