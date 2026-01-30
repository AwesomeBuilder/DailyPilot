import React, { useState } from 'react';
import { Task } from '../types';
import { CheckSquare, Circle, CheckCircle2, Clock, FileText, Pencil, Trash2, X, Check } from 'lucide-react';

interface Props {
  tasks: Task[];
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
  onDeleteTask?: (id: string) => void;
}

export const TaskList: React.FC<Props> = ({ tasks, onUpdateTask, onDeleteTask }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'High': return 'text-rose-600 border-rose-300 bg-rose-50';
      case 'Medium': return 'text-amber-600 border-amber-300 bg-amber-50';
      case 'Low': return 'text-blue-600 border-blue-300 bg-blue-50';
      default: return 'text-gray-600 border-gray-300 bg-gray-50';
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      deadline: task.deadline || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingId && onUpdateTask) {
      onUpdateTask(editingId, editForm);
    }
    cancelEdit();
  };

  const toggleComplete = (task: Task) => {
    if (onUpdateTask) {
      onUpdateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' });
    }
  };

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <CheckSquare size={16} className="text-emerald-500"/>
          Tasks
        </h2>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{pendingTasks.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {tasks.length === 0 && (
           <div className="text-gray-400 text-center italic mt-10 text-sm">
            No pending tasks.
          </div>
        )}

        {pendingTasks.map((task) => (
          <div key={task.id} className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3 transition-all">
            {editingId === task.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                  placeholder="Task title"
                />
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary resize-none"
                  placeholder="Description (optional)"
                  rows={2}
                />
                <div className="flex gap-2">
                  <select
                    value={editForm.priority || 'Medium'}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Task['priority'] })}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={editForm.deadline?.slice(0, 16) || ''}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value ? e.target.value + ':00' : '' })}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-primary"
                  />
                </div>
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
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleComplete(task)}
                  className="mt-1 text-gray-400 hover:text-emerald-500 transition-colors"
                >
                  <Circle size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-teal-dark truncate">{task.title}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <button
                        onClick={() => startEdit(task)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-teal-primary transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                      {onDeleteTask && (
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {task.description && (
                    <div className="flex items-start gap-1.5 text-xs text-gray-600 mb-2 bg-white p-2 rounded-lg border border-gray-100">
                      <FileText size={10} className="mt-0.5 opacity-50 flex-shrink-0" />
                      <p className="line-clamp-3">{task.description}</p>
                    </div>
                  )}

                  {task.deadline && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={10} />
                      <span>{task.deadline}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {completedTasks.length > 0 && (
          <>
            <div className="pt-4 pb-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Completed ({completedTasks.length})</p>
            </div>
            {completedTasks.map((task) => (
              <div key={task.id} className="group bg-gray-50/50 border border-gray-100 rounded-xl p-3 transition-all opacity-60">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleComplete(task)}
                    className="mt-1 text-emerald-500 hover:text-gray-400 transition-colors"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-400 truncate line-through">{task.title}</p>
                      {onDeleteTask && (
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
