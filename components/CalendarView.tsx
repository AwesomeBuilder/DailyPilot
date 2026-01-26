import React from 'react';
import { CalendarEvent, Task } from '../types';
import { Calendar as CalendarIcon, MapPin, Clock, AlignLeft, CheckSquare } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  tasks?: Task[]; // Now accepts tasks to show on timeline
}

export const CalendarView: React.FC<Props> = ({ events, tasks = [] }) => {
  
  // Combine Events and Tasks into a single timeline
  const timelineItems = [
    ...events.map(e => ({
        type: 'event' as const,
        dateObj: new Date(e.start),
        id: e.id,
        title: e.title,
        subtitle: e.location,
        meta: e.duration,
        description: e.description,
        data: e
    })),
    ...tasks
        .filter(t => t.deadline && !isNaN(Date.parse(t.deadline))) // Only include tasks with parseable dates
        .map(t => ({
            type: 'task' as const,
            dateObj: new Date(t.deadline!),
            id: t.id,
            title: t.title,
            subtitle: t.priority + " Priority",
            meta: "Deadline",
            description: t.description,
            data: t
        }))
  ].sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    }).format(date);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <CalendarIcon size={16} className="text-indigo-400"/>
          Schedule
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {timelineItems.length === 0 && (
           <div className="text-slate-600 text-center italic mt-10 text-sm">
            Calendar is clear.
          </div>
        )}
        
        {timelineItems.map((item) => (
          <div key={item.id} className={`relative pl-4 border-l-2 ${item.type === 'event' ? 'border-indigo-500/30' : 'border-emerald-500/30'}`}>
            <div className={`absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full ring-4 ring-slate-900 ${item.type === 'event' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
            
            <div className={`p-3 rounded-lg border border-slate-700/50 hover:bg-slate-800/50 transition-colors ${item.type === 'event' ? 'bg-slate-800/30' : 'bg-emerald-900/10'}`}>
                <div className="flex justify-between items-start">
                    <h3 className={`text-sm font-medium ${item.type === 'event' ? 'text-indigo-100' : 'text-emerald-100'}`}>
                        {item.title}
                    </h3>
                    {item.type === 'task' && <CheckSquare size={14} className="text-emerald-500 opacity-50"/>}
                </div>
                
                <div className="mt-2 space-y-1">
                    <div className={`flex items-center gap-2 text-xs ${item.type === 'event' ? 'text-indigo-200/60' : 'text-emerald-200/60'}`}>
                        <Clock size={12} />
                        <span>{formatDate(item.dateObj)} ({item.meta})</span>
                    </div>
                    {item.subtitle && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            {item.type === 'event' && <MapPin size={12} className="text-indigo-400"/>}
                            <span>{item.subtitle}</span>
                        </div>
                    )}
                    {item.description && (
                        <div className="flex items-start gap-2 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
                            <AlignLeft size={12} className="mt-0.5" />
                            <p>{item.description}</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};