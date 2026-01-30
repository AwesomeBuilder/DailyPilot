import React, { useState } from 'react';
import { CalendarEvent, Task } from '../types';
import { Calendar as CalendarIcon, MapPin, Clock, AlignLeft, CheckSquare, Pencil, Trash2, Plus, X, Check } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  tasks?: Task[];
  onUpdateEvent?: (id: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (id: string) => void;
  onAddEvent?: (event: Omit<CalendarEvent, 'id'>) => void;
}

export const CalendarView: React.FC<Props> = ({ events, tasks = [], onUpdateEvent, onDeleteEvent, onAddEvent }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CalendarEvent>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newEventForm, setNewEventForm] = useState<Partial<CalendarEvent>>({
    title: '',
    start: '',
    duration: '30 mins',
    location: '',
    description: '',
  });

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
        .filter(t => t.deadline && !isNaN(Date.parse(t.deadline)) && t.status !== 'completed')
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

  const startEdit = (event: CalendarEvent) => {
    setEditingId(event.id);
    setEditForm({
      title: event.title,
      start: event.start,
      duration: event.duration,
      location: event.location || '',
      description: event.description || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingId && onUpdateEvent) {
      onUpdateEvent(editingId, editForm);
    }
    cancelEdit();
  };

  const handleAddEvent = () => {
    if (onAddEvent && newEventForm.title && newEventForm.start) {
      onAddEvent({
        title: newEventForm.title,
        start: newEventForm.start + ':00',
        duration: newEventForm.duration || '30 mins',
        location: newEventForm.location,
        description: newEventForm.description,
      });
      setNewEventForm({ title: '', start: '', duration: '30 mins', location: '', description: '' });
      setIsAdding(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <CalendarIcon size={16} className="text-indigo-500"/>
          Schedule
        </h2>
        {onAddEvent && (
          <button
            onClick={() => setIsAdding(true)}
            className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-colors"
            title="Add Event"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {/* Add Event Form */}
        {isAdding && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-indigo-900">New Event</p>
            <input
              type="text"
              value={newEventForm.title || ''}
              onChange={(e) => setNewEventForm({ ...newEventForm, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
              placeholder="Event title"
            />
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={newEventForm.start?.slice(0, 16) || ''}
                onChange={(e) => setNewEventForm({ ...newEventForm, start: e.target.value })}
                className="flex-1 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
              />
              <select
                value={newEventForm.duration || '30 mins'}
                onChange={(e) => setNewEventForm({ ...newEventForm, duration: e.target.value })}
                className="w-28 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
              >
                <option value="15 mins">15 mins</option>
                <option value="30 mins">30 mins</option>
                <option value="45 mins">45 mins</option>
                <option value="1 hour">1 hour</option>
                <option value="90 mins">90 mins</option>
                <option value="2 hours">2 hours</option>
              </select>
            </div>
            <input
              type="text"
              value={newEventForm.location || ''}
              onChange={(e) => setNewEventForm({ ...newEventForm, location: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
              placeholder="Location (optional)"
            />
            <textarea
              value={newEventForm.description || ''}
              onChange={(e) => setNewEventForm({ ...newEventForm, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white resize-none"
              placeholder="Description (optional)"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddEvent}
                disabled={!newEventForm.title || !newEventForm.start}
                className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                Add Event
              </button>
            </div>
          </div>
        )}

        {timelineItems.length === 0 && !isAdding && (
           <div className="text-gray-400 text-center italic mt-10 text-sm">
            Calendar is clear.
          </div>
        )}

        {timelineItems.map((item) => (
          <div key={item.id} className={`group relative pl-4 border-l-2 ${item.type === 'event' ? 'border-indigo-300' : 'border-emerald-300'}`}>
            <div className={`absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full ring-4 ring-white ${item.type === 'event' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>

            {editingId === item.id && item.type === 'event' ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  placeholder="Event title"
                />
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={editForm.start?.slice(0, 16) || ''}
                    onChange={(e) => setEditForm({ ...editForm, start: e.target.value ? e.target.value + ':00' : '' })}
                    className="flex-1 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  />
                  <select
                    value={editForm.duration || '30 mins'}
                    onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    className="w-28 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="15 mins">15 mins</option>
                    <option value="30 mins">30 mins</option>
                    <option value="45 mins">45 mins</option>
                    <option value="1 hour">1 hour</option>
                    <option value="90 mins">90 mins</option>
                    <option value="2 hours">2 hours</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={editForm.location || ''}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  placeholder="Location (optional)"
                />
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white resize-none"
                  placeholder="Description (optional)"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={cancelEdit} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                  <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
                    <Check size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className={`p-3 rounded-xl border hover:shadow-md transition-shadow ${item.type === 'event' ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex justify-between items-start">
                    <h3 className={`text-sm font-medium ${item.type === 'event' ? 'text-indigo-900' : 'text-emerald-900'}`}>
                        {item.title}
                    </h3>
                    <div className="flex items-center gap-1">
                      {item.type === 'task' && <CheckSquare size={14} className="text-emerald-500 opacity-50"/>}
                      {item.type === 'event' && (
                        <>
                          <button
                            onClick={() => startEdit(item.data as CalendarEvent)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-indigo-400 hover:text-indigo-600 transition-all"
                          >
                            <Pencil size={14} />
                          </button>
                          {onDeleteEvent && (
                            <button
                              onClick={() => onDeleteEvent(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-indigo-400 hover:text-rose-500 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
