import React, { useEffect, useRef } from 'react';
import { ThoughtLog } from '../types';
import { BrainCircuit, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';

interface Props {
  logs: ThoughtLog[];
}

export const ReasoningLog: React.FC<Props> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
          <BrainCircuit size={16} />
          Reasoning Log
        </h2>
        <div className="flex items-center gap-2">
           <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="text-xs text-slate-500 font-mono">LIVE_TRACE</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide font-mono text-sm">
        {logs.length === 0 && (
          <div className="text-slate-600 text-center italic mt-10">
            Waiting for input...
          </div>
        )}
        {logs.map((log) => (
          <div 
            key={log.id} 
            className={`p-3 rounded-lg border-l-2 ${
              log.type === 'conflict' 
                ? 'bg-orange-950/20 border-orange-500 text-orange-200' 
                : log.type === 'action'
                ? 'bg-emerald-950/20 border-emerald-500 text-emerald-200'
                : 'bg-slate-800/50 border-cyan-500 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
              {log.type === 'conflict' && <AlertTriangle size={12} />}
              {log.type === 'action' && <CheckCircle2 size={12} />}
              {log.type === 'reasoning' && <Activity size={12} />}
              <span>{log.timestamp.toLocaleTimeString()}</span>
              <span className="uppercase tracking-widest text-[10px] opacity-50">{log.type}</span>
            </div>
            <p className="leading-relaxed">{log.content}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};