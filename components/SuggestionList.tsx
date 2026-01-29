import React from 'react';
import { Suggestion } from '../types';
import { Lightbulb, ShoppingBag, Utensils, Search, ExternalLink } from 'lucide-react';

interface Props {
  suggestions: Suggestion[];
}

export const SuggestionList: React.FC<Props> = ({ suggestions }) => {
  const getIcon = (cat: string) => {
    switch (cat) {
      case 'Restaurant': return <Utensils size={14} className="text-orange-500"/>;
      case 'Shopping': return <ShoppingBag size={14} className="text-pink-500"/>;
      case 'Research': return <Search size={14} className="text-blue-500"/>;
      default: return <Lightbulb size={14} className="text-yellow-500"/>;
    }
  };

  const getLink = (item: string, category: string) => {
    if (item.startsWith('http')) return item;

    if (['Restaurant', 'Shopping', 'Place'].includes(category)) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item)}`;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(item)}`;
  };

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <Lightbulb size={16} className="text-yellow-500"/>
          Suggestions & Ideas
        </h2>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{suggestions.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {suggestions.length === 0 && (
           <div className="text-gray-400 text-center italic mt-10 text-sm">
            No suggestions yet.
          </div>
        )}

        {suggestions.map((s) => (
          <div key={s.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
                {getIcon(s.category)}
                <h3 className="text-sm font-medium text-teal-dark">{s.title}</h3>
            </div>
            <ul className="space-y-1.5 pl-1">
                {s.items.map((item, idx) => {
                    const link = getLink(item, s.category);
                    const isUrl = item.startsWith('http');
                    const display = isUrl ? new URL(item).hostname : item;

                    return (
                        <li key={idx} className="text-xs text-gray-600 flex items-start gap-2 group">
                            <span className="block w-1 h-1 mt-1.5 rounded-full bg-gray-400 flex-shrink-0"></span>
                            <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 hover:text-teal-primary transition-colors break-all"
                            >
                                <span className={isUrl ? "text-teal-primary" : ""}>{display}</span>
                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                        </li>
                    );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
