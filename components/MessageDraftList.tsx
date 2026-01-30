import React, { useState } from 'react';
import { MessageDraft } from '../types';
import { Mail, MessageSquare, Hash, Copy, Check, Pencil, Trash2, X } from 'lucide-react';

interface Props {
  drafts: MessageDraft[];
  onUpdateDraft?: (id: string, updates: Partial<MessageDraft>) => void;
  onDeleteDraft?: (id: string) => void;
}

export const MessageDraftList: React.FC<Props> = ({ drafts, onUpdateDraft, onDeleteDraft }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MessageDraft>>({});

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

  const startEdit = (draft: MessageDraft) => {
    setEditingId(draft.id);
    setEditForm({
      recipient: draft.recipient,
      platform: draft.platform,
      reason: draft.reason,
      content: draft.content,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingId && onUpdateDraft) {
      onUpdateDraft(editingId, editForm);
    }
    cancelEdit();
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
            {editingId === draft.id ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editForm.recipient || ''}
                    onChange={(e) => setEditForm({ ...editForm, recipient: e.target.value })}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                    placeholder="Recipient"
                  />
                  <select
                    value={editForm.platform || 'Text'}
                    onChange={(e) => setEditForm({ ...editForm, platform: e.target.value as MessageDraft['platform'] })}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                  >
                    <option value="Text">Text</option>
                    <option value="Email">Email</option>
                    <option value="Slack">Slack</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={editForm.reason || ''}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                  placeholder="Reason"
                />
                <textarea
                  value={editForm.content || ''}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary resize-none"
                  placeholder="Message content"
                  rows={4}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={cancelEdit} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                  <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-teal-primary text-white rounded-lg hover:bg-teal-600 transition-colors">
                    <Check size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {getIcon(draft.platform)}
                        <h3 className="text-sm font-bold text-teal-dark">{draft.recipient}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyToClipboard(draft.content, draft.id)}
                        className="p-1 text-gray-400 hover:text-teal-primary transition-all"
                        title="Copy to clipboard"
                      >
                        {copiedId === draft.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => startEdit(draft)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-teal-primary transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                      {onDeleteDraft && (
                        <button
                          onClick={() => onDeleteDraft(draft.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-2 italic border-b border-gray-200 pb-2">
                    Re: {draft.reason}
                </p>

                <div className="bg-white p-2 rounded-lg text-sm text-teal-dark leading-relaxed whitespace-pre-wrap border border-gray-100">
                    "{draft.content}"
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
