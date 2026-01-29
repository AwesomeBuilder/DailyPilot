import React from 'react';
import { CalendarEvent, Task } from '../types';
import { Calendar as CalendarIcon, MapPin, Clock, AlignLeft, CheckSquare } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  tasks?: Task[];
}

export const CalendarView: React.FC<Props> = ({ events, tasks = [] }) => {

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
        .filter(t => t.deadline && !isNaN(Date.parse(t.deadline)))
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
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <CalendarIcon size={16} className="text-indigo-500"/>
          Schedule
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {timelineItems.length === 0 && (
           <div className="text-gray-400 text-center italic mt-10 text-sm">
            Calendar is clear.
          </div>
        )}

        {timelineItems.map((item) => (
          <div key={item.id} className={`relative pl-4 border-l-2 ${item.type === 'event' ? 'border-indigo-300' : 'border-emerald-300'}`}>
            <div className={`absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full ring-4 ring-white ${item.type === 'event' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>

            <div className={`p-3 rounded-xl border hover:shadow-md transition-shadow ${item.type === 'event' ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex justify-between items-start">
                    <h3 className={`text-sm font-medium ${item.type === 'event' ? 'text-indigo-900' : 'text-emerald-900'}`}>
                        {item.title}
                    </h3>
                    {item.type === 'task' && <CheckSquare size={14} className="text-emerald-500 opacity-50"/>}
                </div>

                <div className="mt-2 space-y-1">
                    <div className={`flex items-center gap-2 text-xs ${item.type === 'event' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                        <Clock size={12} />
                        <span>{formatDate(item.dateObj)} ({item.meta})</span>
                    </div>
                    {item.subtitle && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            {item.type === 'event' && <MapPin size={12} className="text-indigo-400"/>}
                            <span>{item.subtitle}</span>
                        </div>
                    )}
                    {item.description && (
                        <div className="flex items-start gap-2 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
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
