import React from 'react';
import { CalendarEvent } from '../types';
import { Calendar as CalendarIcon, MapPin, Clock } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
}

export const CalendarView: React.FC<Props> = ({ events }) => {
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      }).format(date);
    } catch (e) {
      return isoString;
    }
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
        {sortedEvents.length === 0 && (
           <div className="text-slate-600 text-center italic mt-10 text-sm">
            Calendar is clear.
          </div>
        )}
        
        {sortedEvents.map((event) => (
          <div key={event.id} className="relative pl-4 border-l-2 border-indigo-500/30">
            <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-slate-900"></div>
            <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                <h3 className="text-sm font-medium text-indigo-100">{event.title}</h3>
                <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-indigo-200/60">
                        <Clock size={12} />
                        <span>{formatDate(event.start)} ({event.duration})</span>
                    </div>
                    {event.location && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <MapPin size={12} />
                            <span>{event.location}</span>
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