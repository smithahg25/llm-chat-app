import type { InferenceLog } from '../types';
import { Activity, Clock, Zap, Cpu, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { LineChart, Line, BarChart, Bar, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface MetadataPanelProps {
  logs: InferenceLog[];
}

export default function MetadataPanel({ logs }: MetadataPanelProps) {
  if (logs.length === 0) {
    return (
      <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col p-6 items-center justify-center text-center">
        <Activity size={48} className="text-gray-700 mb-4" />
        <h3 className="text-lg font-medium text-gray-400 mb-2">No Inference Data</h3>
        <p className="text-sm text-gray-500">
          Logs will appear here once you start generating responses.
        </p>
      </div>
    );
  }

  const avgLatency = Math.round(logs.reduce((acc, log) => acc + log.latency, 0) / logs.length);
  const totalTokens = logs.reduce((acc, log) => acc + (log.totalTokens || 0), 0);
  const successRate = Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100);

  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Provider', 'Model', 'Latency (ms)', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens', 'Status', 'Request ID', 'Session ID'];
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(',') + '\n'
      + logs.map(l => `${l.id},${l.timestamp},${l.provider},${l.model},${l.latency},${l.promptTokens},${l.completionTokens},${l.totalTokens},${l.status},${l.requestId || ''},${l.sessionId || ''}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "inference_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = "inference_logs.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = [...logs].reverse().map(l => ({
    time: format(parseISO(l.timestamp), 'HH:mm'),
    latency: l.latency,
    tokens: l.totalTokens || 0,
    status: l.status === 'success' ? 1 : 0,
  }));

  const pieData = [
    { name: 'Success', value: logs.filter(l => l.status === 'success').length, color: '#22c55e' },
    { name: 'Failed', value: logs.filter(l => l.status === 'failure').length, color: '#ef4444' },
    { name: 'Cancelled', value: logs.filter(l => l.status === 'cancelled').length, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-100">Observability</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm bg-gray-800 px-2 py-1 rounded">
             <Download size={14}/> CSV
          </button>
          <button onClick={exportJSON} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm bg-gray-800 px-2 py-1 rounded">
             <Download size={14}/> JSON
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50 hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
              <Clock size={14} className="text-blue-400" />
              Avg Latency
            </div>
            <div className="text-2xl font-bold text-gray-100">{avgLatency}ms</div>
          </div>
          
          <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50 hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
              <Zap size={14} className="text-purple-400" />
              Total Tokens
            </div>
            <div className="text-2xl font-bold text-gray-100">{totalTokens.toLocaleString()}</div>
          </div>
          
          <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50 hover:border-gray-600 transition-colors col-span-2">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
              <Cpu size={14} className="text-green-400" />
              Success Rate
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-gray-100">{successRate}%</div>
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Latency Over Time (ms)</h3>
            <div className="h-32 w-full bg-gray-800 rounded-lg p-2 border border-gray-700/50">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Token Usage</h3>
            <div className="h-32 w-full bg-gray-800 rounded-lg p-2 border border-gray-700/50">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <Bar dataKey="tokens" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} cursor={{fill: '#374151'}} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Error Breakdown</h3>
            <div className="h-32 w-full bg-gray-800 rounded-lg p-2 border border-gray-700/50">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6">Recent Requests</h3>
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700/50 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-300">{log.model}</span>
                  <div className="flex items-center gap-1.5">
                    {log.status === 'success' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                    <span className={`text-xs ${log.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {log.status}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Latency</span>
                    <span>{log.latency}ms</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Tokens</span>
                    <span>{log.totalTokens}</span>
                  </div>
                </div>

                <div className="flex flex-col text-[10px] text-gray-600 border-t border-gray-700 pt-2 pb-1 gap-1">
                  <span>Req ID: {log.requestId?.substring(0, 8)}...</span>
                  <span>Session: {log.sessionId?.substring(0, 8)}...</span>
                </div>

                {log.error && (
                  <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded">
                    {log.error}
                  </div>
                )}
                
                <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between text-[10px] text-gray-600">
                  <span>Provider: {log.provider}</span>
                  <span>{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
