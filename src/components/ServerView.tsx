import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {  Server, Play, Square, Activity, AlertTriangle  } from 'lucide-react';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useRef } from 'react';
import { Icon } from './ui/Icon';
import { useConfigStore } from '../store/configStore';
import { useServerStore } from '../store/serverStore';

export function ServerView() {
  const { config } = useConfigStore();
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<{time: string, text: string}[]>([]);
  const [apiKey, setApiKey] = useState(config?.network?.api_key_uuid || 'sk-forge-local');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const { requestCount, startTime, setStartTime, engineLogs, clearEngineLogs } = useServerStore();
  const [uptime, setUptime] = useState('0s');
  const engineLogsEndRef = useRef<HTMLDivElement>(null);

  useTauriEvent<string>('forge://server_log', (log) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, text: log }].slice(-100)); // Keep last 100 logs
  });

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (engineLogsEndRef.current) {
      engineLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [engineLogs]);

  useEffect(() => {
    let interval: any;
    if (running && startTime) {
      interval = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setUptime(`${m}m ${s}s`);
      }, 1000);
    } else {
      setUptime('0s');
    }
    return () => clearInterval(interval);
  }, [running, startTime]);

  useEffect(() => {
    // Component mount olduğunda backend'den durumu sorgula (mock veya gerçek)
    // Eğer get_server_status yoksa fail olur ama devam eder
    invoke<{running: boolean, port: number}>('get_server_status')
      .then(res => {
        setRunning(res.running);
        if (res.port) setPort(res.port);
      })
      .catch(() => {
        // Rust'ta henüz yoksa yoksay
      });
  }, []);

  const toggleServer = async () => {
    setError('');
    try {
      if (running) {
        await invoke('stop_local_server');
        setRunning(false);
        setPort(null);
        setTestResult(null);
        setStartTime(null);
      } else {
        const bindAddress = config?.network?.lan_server_enabled ? "0.0.0.0" : "127.0.0.1";
        const p = await invoke<number>('start_local_server', { apiKey, bindAddress });
        setPort(p);
        setRunning(true);
        setStartTime(Date.now());
      }
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const testConnection = async () => {
    if (!port) return;
    try {
      const res = await fetch(`http://localhost:${port}/v1/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (res.ok) setTestResult('success');
      else setTestResult('error');
    } catch {
      setTestResult('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-forge-bg text-forge-text overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Server Dashboard</h1>
            <p className="text-forge-text/70">Manage the local OpenAI-compatible REST API.</p>
          </div>
          <button 
            onClick={toggleServer}
            className={`px-6 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all skeuo-btn ${
              running 
                ? 'bg-forge-danger/10 text-rose-400 border border-rose-500/30 hover:bg-forge-danger/20' 
                : 'bg-forge-accent text-forge-text hover:bg-forge-accent'
            }`}
          >
            {running ? <><Icon icon={Square} size={16} fill="currentColor" /> Stop Server</> : <><Icon icon={Play} size={16} fill="currentColor" /> Start Server</>}
          </button>
        </div>

        {error && (
          <div className="bg-forge-danger/10 text-rose-400 border border-rose-500/20 p-4 rounded-lg text-sm flex items-center gap-2">
            <Icon icon={AlertTriangle} size={16} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="skeuo-panel p-6 flex flex-col gap-4 col-span-1">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-forge-text-muted">Status</h3>
            <div className="flex items-center gap-3">
              <div className="bg-forge-surface p-3 rounded-full border border-forge-border">
                <Icon icon={Server} size={24} className={running ? "text-emerald-400" : "text-forge-text-muted"} />
              </div>
              <div className="flex flex-col">
                <span className={`font-semibold flex items-center gap-2 ${running ? "text-emerald-400" : "text-forge-text-muted"}`}>
                  {running ? "Online" : "Offline"}
                  {running && <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Healthy</span>}
                </span>
                <span className="text-xs text-forge-text-muted">
                  {running ? `Port ${port}` : "Not listening"}
                </span>
              </div>
            </div>
            {running && port && (
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`http://localhost:${port}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="mt-4 flex items-center justify-center gap-2 text-xs py-2 bg-forge-surface-2 hover:bg-forge-surface-3 rounded border border-forge-border transition-colors text-forge-text"
              >
                {copied ? "Copied!" : `Copy http://localhost:${port}`}
              </button>
            )}
            {running && (
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-forge-border">
                <div className="flex flex-col">
                  <span className="text-[10px] text-forge-text-muted uppercase">Uptime</span>
                  <span className="text-sm font-mono text-forge-text">{uptime}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-forge-text-muted uppercase">Requests</span>
                  <span className="text-sm font-mono text-forge-text">{requestCount}</span>
                </div>
              </div>
            )}
          </div>

          <div className="skeuo-panel p-6 flex flex-col gap-4 col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-forge-text-muted flex items-center gap-2">
              <Icon icon={Activity} size={14} /> Active Endpoints
            </h3>
            {running ? (
              <div className="flex flex-col gap-3 font-mono text-xs">
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border p-3 rounded-md">
                  <span className="text-forge-accent">GET /v1/models</span>
                  <span className="text-forge-text-muted">List available models</span>
                </div>
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border p-3 rounded-md">
                  <span className="text-forge-accent">POST /v1/chat/completions</span>
                  <span className="text-forge-text-muted">Generate chat response</span>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-forge-text-muted">cURL Example:</span>
                  <div className="relative group">
                    <pre className="bg-forge-bg border border-forge-border p-3 rounded-md overflow-x-auto custom-scrollbar text-forge-text whitespace-pre">
{`curl http://localhost:${port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "local-model",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'`}
                    </pre>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`curl http://localhost:${port}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -d '{\n    "model": "local-model",\n    "messages": [\n      {\n        "role": "user",\n        "content": "Hello!"\n      }\n    ]\n  }'`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-forge-surface-2 hover:bg-forge-surface-3 rounded border border-forge-border text-forge-text-muted transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Icon icon={copied ? Square : Activity} size={14} /> 
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-forge-text-muted text-sm">
                Start the server to see endpoints.
              </div>
            )}
          </div>
        </div>

        {/* API Key Configuration */}
        <div className="skeuo-panel p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-forge-text-muted flex items-center gap-2">
              <Icon icon={Server} size={14} /> Security
            </h3>
            {running && (
              <button 
                onClick={testConnection}
                className="text-xs px-3 py-1.5 bg-forge-surface-2 hover:bg-forge-surface-3 border border-forge-border rounded text-forge-text transition-colors flex items-center gap-2"
              >
                Test Connection
                {testResult === 'success' && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
                {testResult === 'error' && <span className="w-2 h-2 rounded-full bg-red-400"></span>}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
                disabled={running}
                className="w-full bg-forge-surface border border-forge-border rounded-lg py-2 pl-3 pr-10 text-sm text-forge-text outline-none focus:border-forge-accent transition-colors disabled:opacity-50"
                placeholder="API Key (e.g. sk-forge-local)"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-text-muted hover:text-forge-text transition-colors"
              >
                <Icon icon={Square} size={14} />
              </button>
            </div>
            <span className="text-xs text-forge-text-muted">
              Changing the key requires server restart.
            </span>
          </div>
        </div>

        {/* Live Logs */}
        <div className="skeuo-panel p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-forge-text-muted flex items-center gap-2">
              <Icon icon={Activity} size={14} /> Server Logs
            </h3>
            <button 
              onClick={() => setLogs([])}
              className="text-xs text-forge-text-muted hover:text-forge-text transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-forge-bg border border-forge-border rounded-lg p-4 h-64 overflow-y-auto custom-scrollbar font-mono text-xs flex flex-col gap-1">
            {logs.length === 0 ? (
              <span className="text-forge-text-muted italic">No logs yet. Start the server to see activity.</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-forge-text-secondary whitespace-pre-wrap break-all">
                  <span className="text-forge-accent/50 mr-2">[{log.time}]</span>
                  {log.text}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Live Engine Console */}
        <div className="skeuo-panel p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-forge-text-muted flex items-center gap-2">
              <Icon icon={Activity} size={14} /> Engine Console
            </h3>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(engineLogs.join('\n'));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-xs px-2 py-1 bg-forge-surface hover:bg-forge-surface-3 rounded text-forge-text-muted hover:text-forge-text transition-colors border border-forge-border"
              >
                Copy
              </button>
              <button 
                onClick={clearEngineLogs}
                className="text-xs text-forge-text-muted hover:text-forge-danger transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="bg-black/40 border border-forge-border rounded-lg p-4 h-80 overflow-y-auto custom-scrollbar font-mono text-[11px] flex flex-col gap-1 shadow-inner">
            {engineLogs.length === 0 ? (
              <span className="text-forge-text-muted/50 italic select-none">Awaiting engine telemetry...</span>
            ) : (
              engineLogs.map((log, i) => (
                <div key={i} className="text-emerald-400/90 whitespace-pre-wrap break-all hover:bg-white/5 px-1 rounded transition-colors">
                  {log}
                </div>
              ))
            )}
            <div ref={engineLogsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
