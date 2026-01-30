import React from 'react';
import { Suggestion, SuggestionItem } from '../types';
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

  // Normalize item to SuggestionItem format (handles both string and object)
  const normalizeItem = (item: SuggestionItem | string): SuggestionItem => {
    if (typeof item === 'string') {
      // Legacy string item - check if it's a URL
      if (item.startsWith('http')) {
        return { text: item, url: item, linkType: 'website' };
      }
      return { text: item };
    }
    return item;
  };

  // Get display URL - use agent-provided URL or fall back to Google Search
  const getUrl = (item: SuggestionItem): string => {
    if (item.url) return item.url;
    return `https://www.google.com/search?q=${encodeURIComponent(item.text)}`;
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
            <ul className="space-y-1">
                {s.items.map((item, idx) => {
                    const itemData = normalizeItem(item);
                    const url = getUrl(itemData);
                    const isRawUrl = itemData.text.startsWith('http');
                    const display = isRawUrl ? new URL(itemData.text).hostname : itemData.text;

                    return (
                        <li key={idx} className="group">
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2 -mx-1 rounded-lg hover:bg-teal-50 active:bg-teal-100 transition-colors cursor-pointer"
                            >
                                <span className="block w-1.5 h-1.5 rounded-full bg-teal-primary flex-shrink-0"></span>
                                <span className={`text-sm flex-1 ${isRawUrl ? "text-teal-primary" : "text-gray-700"}`}>{display}</span>
                                <ExternalLink size={14} className="text-gray-400 group-hover:text-teal-primary transition-colors flex-shrink-0" />
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
