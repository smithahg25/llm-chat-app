import { useState, useEffect } from 'react';
import type { InferenceLog } from '../types';
import { Activity, Clock, Zap, Cpu, AlertCircle, CheckCircle2, Download, BarChart2, Maximize2, Minimize2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { LineChart, Line, BarChart, Bar, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, XAxis } from 'recharts';
import { api } from '../api';

interface MetadataPanelProps {
  logs: InferenceLog[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  ingestMetrics?: any;
}

export default function MetadataPanel({ logs, page, pageSize, total, onPageChange, onPageSizeChange, ingestMetrics }: MetadataPanelProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'throughput' | 'batching'>('logs');
  const [timeRange, setTimeRange] = useState('1h');
  const [throughputData, setThroughputData] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (activeTab === 'throughput') {
      api.getThroughput(timeRange).then(setThroughputData).catch(console.error);
    }
  }, [activeTab, timeRange, logs]); 

  if (logs.length === 0 && activeTab === 'logs') {
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

  const avgLatency = logs.length > 0 ? Math.round(logs.reduce((acc, log) => acc + log.latency, 0) / logs.length) : 0;
  const totalTokens = logs.reduce((acc, log) => acc + (log.totalTokens || 0), 0);
  const successRate = logs.length > 0 ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) : 0;

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
    <div className={`${isExpanded ? 'w-[450px]' : 'w-80'} transition-all duration-300 ease-in-out bg-gray-900 border-l border-gray-800 flex flex-col h-full overflow-hidden shrink-0 relative`}>
      <div className="p-4 border-b border-gray-800 flex flex-col gap-3 bg-gray-900/50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors mr-1">
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <Activity size={20} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-100">Observability</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs bg-gray-800 px-2 py-1 rounded">
               <Download size={12}/> CSV
            </button>
            <button onClick={exportJSON} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs bg-gray-800 px-2 py-1 rounded">
               <Download size={12}/> JSON
            </button>
          </div>
        </div>
        
        <div className="flex bg-gray-800 p-1 rounded-lg">
          <button 
            className={`flex-1 text-sm py-1 rounded-md text-center transition-colors ${activeTab === 'logs' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('logs')}
          >
            Recent Logs
          </button>
          <button 
            className={`flex-1 text-sm py-1 rounded-md text-center flex items-center justify-center gap-1 transition-colors ${activeTab === 'throughput' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('throughput')}
          >
            <BarChart2 size={14} /> Throughput
          </button>
          <button 
            className={`flex-1 text-sm py-1 rounded-md text-center transition-colors ${activeTab === 'batching' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('batching')}
          >
            Batching
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'logs' && (
          <>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
                  <Clock size={14} className="text-blue-400" /> Avg Latency
                </div>
                <div className="text-2xl font-bold text-gray-100">{avgLatency}ms</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
                  <Zap size={14} className="text-purple-400" /> Total Tokens
                </div>
                <div className="text-2xl font-bold text-gray-100">{totalTokens.toLocaleString()}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50 col-span-2">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
                  <Cpu size={14} className="text-green-400" /> Success Rate
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-gray-100">{successRate}%</div>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: `${successRate}%` }} />
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
                      <div className="flex flex-col"><span className="text-gray-400">Latency</span><span>{log.latency}ms</span></div>
                      <div className="flex flex-col"><span className="text-gray-400">Tokens</span><span>{log.totalTokens}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 text-xs text-gray-400 bg-gray-800 rounded-lg p-3 border border-gray-700/50 mt-4">
                <div className="flex justify-between items-center">
                  <span>Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total}</span>
                  <select 
                    value={pageSize} 
                    onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
                    className="bg-gray-700 text-white rounded px-1 py-0.5 border border-gray-600 focus:outline-none"
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
          </>
        )}

        {activeTab === 'throughput' && throughputData && (
          <div className="p-4 space-y-6">
            <div className="flex bg-gray-800 rounded-md p-1">
              {['1h', '24h', '7d'].map(tr => (
                <button
                  key={tr}
                  onClick={() => setTimeRange(tr)}
                  className={`flex-1 text-xs py-1 rounded-sm text-center uppercase tracking-wider font-medium transition-colors ${timeRange === tr ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {tr}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Req</div>
                <div className="text-xl font-bold text-gray-100">{throughputData.total}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Req / Min</div>
                <div className="text-xl font-bold text-gray-100">{throughputData.rpm}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Success</div>
                <div className="text-xl font-bold text-green-400">{throughputData.successRate}%</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Fail / Cancel</div>
                <div className="text-lg font-bold text-red-400">{throughputData.failureRate}% / {throughputData.cancellationRate}%</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Requests / Min</h3>
              <div className="h-40 w-full bg-gray-800 rounded-lg p-2 border border-gray-700/50">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={throughputData.chartData}>
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={10} tickMargin={10} />
                    <Line type="monotone" dataKey="count" stroke="#f43f5e" strokeWidth={2} dot={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Distribution</h3>
              <div className="h-40 w-full bg-gray-800 rounded-lg p-2 border border-gray-700/50">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Success', count: throughputData.success, fill: '#22c55e' },
                    { name: 'Failed', count: throughputData.failure, fill: '#ef4444' },
                    { name: 'Cancel', count: throughputData.cancelled, fill: '#f59e0b' }
                  ]}>
                    <XAxis dataKey="name" stroke="#4b5563" fontSize={10} tickMargin={10} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} />
                    <Tooltip cursor={{fill: '#374151'}} contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
          </div>
        )}

        {activeTab === 'batching' && ingestMetrics && (
          <div className="p-4 space-y-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">SDK Batching Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Queue Size</div>
                <div className="text-xl font-bold text-gray-100">{ingestMetrics.queueSize}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Avg Batch Size</div>
                <div className="text-xl font-bold text-gray-100">{ingestMetrics.averageBatchSize}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Failed Batches</div>
                <div className="text-xl font-bold text-red-400">{ingestMetrics.failedBatchCount}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700/50">
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">Last Flush</div>
                <div className="text-xs font-medium text-gray-300 mt-1">
                  {ingestMetrics.lastFlush ? format(new Date(ingestMetrics.lastFlush), 'HH:mm:ss') : 'Never'}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
              <p>The LLM SDK batches telemetry logs in memory to reduce network overhead. It flushes every 5 seconds or when the queue reaches 50 items.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
