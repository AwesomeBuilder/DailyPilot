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
      case 'Email': return <Mail size={14} className="text-blue-500"/>;
      case 'Slack': return <Hash size={14} className="text-purple-500"/>;
      default: return <MessageSquare size={14} className="text-green-500"/>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <MessageSquare size={16} className="text-teal-primary"/>
          Message Drafts
        </h2>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{drafts.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {drafts.length === 0 && (
           <div className="text-gray-400 text-center italic mt-4 text-sm">
            No active drafts.
          </div>
        )}

        {drafts.map((draft) => (
          <div key={draft.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200 relative group">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    {getIcon(draft.platform)}
                    <h3 className="text-sm font-bold text-teal-dark">{draft.recipient}</h3>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 border border-gray-300 px-1.5 rounded bg-white">
                    {draft.platform}
                </span>
            </div>

            <p className="text-xs text-gray-500 mb-2 italic border-b border-gray-200 pb-2">
                Re: {draft.reason}
            </p>

            <div className="bg-white p-2 rounded-lg text-sm text-teal-dark leading-relaxed whitespace-pre-wrap border border-gray-100">
                "{draft.content}"
            </div>

            <button
                onClick={() => copyToClipboard(draft.content, draft.id)}
                className="absolute top-3 right-3 p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition-colors"
                title="Copy to clipboard"
            >
                {copiedId === draft.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
