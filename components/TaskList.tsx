import React from 'react';
import { Task } from '../types';
import { CheckSquare, Circle, Clock, FileText } from 'lucide-react';

interface Props {
  tasks: Task[];
}

export const TaskList: React.FC<Props> = ({ tasks }) => {
  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'High': return 'text-rose-600 border-rose-300 bg-rose-50';
      case 'Medium': return 'text-amber-600 border-amber-300 bg-amber-50';
      case 'Low': return 'text-blue-600 border-blue-300 bg-blue-50';
      default: return 'text-gray-600 border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-teal-dark uppercase tracking-wider flex items-center gap-2">
          <CheckSquare size={16} className="text-emerald-500"/>
          Tasks
        </h2>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{tasks.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {tasks.length === 0 && (
           <div className="text-gray-400 text-center italic mt-10 text-sm">
            No pending tasks.
          </div>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3 transition-all flex items-start gap-3">
            <button className="mt-1 text-gray-400 hover:text-emerald-500 transition-colors">
              <Circle size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-teal-dark truncate">{task.title}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
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
        ))}
      </div>
    </div>
  );
};
