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
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <BrainCircuit size={16} className="text-teal-primary" />
          Chain of Thought
        </h2>
        <div className="flex items-center gap-2">
           <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-primary"></span>
          </span>
          <span className="text-xs text-gray-500 font-mono">LIVE</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {logs.length === 0 && (
          <div className="text-gray-400 text-center italic mt-10">
            Waiting for input...
          </div>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className={`p-3 rounded-xl border-l-4 ${
              log.type === 'conflict'
                ? 'bg-orange-50 border-orange-400 text-orange-800'
                : log.type === 'action'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : 'bg-gray-50 border-teal-primary text-teal-dark'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
              {log.type === 'conflict' && <AlertTriangle size={12} />}
              {log.type === 'action' && <CheckCircle2 size={12} />}
              {log.type === 'reasoning' && <Activity size={12} />}
              <span>{log.timestamp.toLocaleTimeString()}</span>
              <span className="uppercase tracking-widest text-[10px] opacity-60">{log.type}</span>
            </div>
            <p className="leading-relaxed text-sm">{log.content}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
