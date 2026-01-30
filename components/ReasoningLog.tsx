import React, { useEffect, useRef } from 'react';
import { ThoughtLog } from '../types';
import { BrainCircuit, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';

interface Props {
  logs: ThoughtLog[];
}

// Simple markdown renderer for chain of thought content
const renderMarkdown = (text: string): React.ReactNode[] => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    // Handle headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={lineIndex} className="font-semibold text-sm mt-2">{line.slice(4)}</h4>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={lineIndex} className="font-semibold text-base mt-2">{line.slice(3)}</h3>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={lineIndex} className="font-bold text-lg mt-2">{line.slice(2)}</h2>);
      return;
    }

    // Handle bullet points
    if (line.match(/^[-*]\s/)) {
      const content = line.slice(2);
      elements.push(
        <li key={lineIndex} className="ml-4 list-disc">{renderInline(content)}</li>
      );
      return;
    }

    // Handle numbered lists
    if (line.match(/^\d+\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <li key={lineIndex} className="ml-4 list-decimal">{renderInline(content)}</li>
      );
      return;
    }

    // Regular paragraph
    if (line.trim()) {
      elements.push(<p key={lineIndex} className="my-1">{renderInline(line)}</p>);
    } else {
      elements.push(<br key={lineIndex} />);
    }
  });

  return elements;
};

// Render inline markdown (bold, italic, code)
const renderInline = (text: string): React.ReactNode => {
  // Handle **bold**, *italic*, and `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic *text*
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    // Code `text`
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index! } : null,
      italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index! } : null,
      codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;

    // Add text before match
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    // Add styled element
    if (first.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold">{first.match[1]}</strong>);
    } else if (first.type === 'italic') {
      parts.push(<em key={key++} className="italic">{first.match[1]}</em>);
    } else if (first.type === 'code') {
      parts.push(<code key={key++} className="bg-gray-200 px-1 rounded text-xs font-mono">{first.match[1]}</code>);
    }

    remaining = remaining.slice(first.index + first.match[0].length);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

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
            Chain of thought...
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
            <div className="leading-relaxed text-sm">{renderMarkdown(log.content)}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
