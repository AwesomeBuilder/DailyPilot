import React from 'react';
import { Task } from '../types';
import { CheckSquare, Circle, Clock } from 'lucide-react';

interface Props {
  tasks: Task[];
}

export const TaskList: React.FC<Props> = ({ tasks }) => {
  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'High': return 'text-rose-400 border-rose-400/30 bg-rose-400/10';
      case 'Medium': return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
      case 'Low': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      default: return 'text-slate-400 border-slate-400/30';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <CheckSquare size={16} className="text-emerald-400"/>
          Tasks
        </h2>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-full">{tasks.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {tasks.length === 0 && (
           <div className="text-slate-600 text-center italic mt-10 text-sm">
            No pending tasks.
          </div>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="group bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700 rounded-lg p-3 transition-all flex items-start gap-3">
            <button className="mt-1 text-slate-500 hover:text-emerald-400 transition-colors">
              <Circle size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-200 truncate">{task.title}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
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