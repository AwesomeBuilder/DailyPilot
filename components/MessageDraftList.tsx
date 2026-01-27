import React, { useState } from 'react';
import { MessageDraft } from '../types';
import { Mail, MessageSquare, Hash, Copy, Check } from 'lucide-react';

interface Props {
  drafts: MessageDraft[];
}

export const MessageDraftList: React.FC<Props> = ({ drafts }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIcon = (platform: string) => {
    switch (platform) {
      case 'Email': return <Mail size={14} className="text-blue-400"/>;
      case 'Slack': return <Hash size={14} className="text-purple-400"/>;
      default: return <MessageSquare size={14} className="text-green-400"/>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-xl mb-6">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <MessageSquare size={16} className="text-cyan-400"/>
          Outreach Drafts
        </h2>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-full">{drafts.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {drafts.length === 0 && (
           <div className="text-slate-600 text-center italic mt-4 text-sm">
            No active drafts.
          </div>
        )}
        
        {drafts.map((draft) => (
          <div key={draft.id} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50 relative group">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    {getIcon(draft.platform)}
                    <h3 className="text-sm font-bold text-slate-200">{draft.recipient}</h3>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-700 px-1.5 rounded">
                    {draft.platform}
                </span>
            </div>
            
            <p className="text-xs text-slate-500 mb-2 italic border-b border-slate-700/50 pb-2">
                Re: {draft.reason}
            </p>

            <div className="bg-slate-950/50 p-2 rounded text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                "{draft.content}"
            </div>

            <button 
                onClick={() => copyToClipboard(draft.content, draft.id)}
                className="absolute top-3 right-3 p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                title="Copy to clipboard"
            >
                {copiedId === draft.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};