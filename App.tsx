import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveManager } from './services/liveManager';
import { processTextPrompt } from './services/textAgent';
import { Task, CalendarEvent, ThoughtLog, Alert, Suggestion } from './types';
import { ReasoningLog } from './components/ReasoningLog';
import { TaskList } from './components/TaskList';
import { CalendarView } from './components/CalendarView';
import { SuggestionList } from './components/SuggestionList';
import { VoiceControl } from './components/VoiceControl';
import { AlertCircle, X, Power } from 'lucide-react';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingText, setIsProcessingText] = useState(false);
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [logs, setLogs] = useState<ThoughtLog[]>([]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const liveManager = useRef<LiveManager | null>(null);

  // --- Tool Logic ---
  
  // Mock Calendar Data Source
  const searchCalendar = (query: string) => {
    const q = query.toLowerCase();
    // Simulate finding Ayan's class
    if (q.includes('ayan') || q.includes('music') || q.includes('class')) {
        return [
            { title: "Ayan's Music Class", start: new Date(new Date().setHours(16, 30, 0, 0)).toISOString(), duration: "45 mins", location: "Mozart Academy" }
        ];
    }
    // Simulate checking "tomorrow"
    if (q.includes('tomorrow')) {
        const tmrw = new Date();
        tmrw.setDate(tmrw.getDate() + 1);
        return []; // Free day
    }
    return [];
  };

  const handleToolCall = useCallback(async (name: string, args: any) => {
    // 1. Log the attempt to use a tool (Internal thought visibility)
    if (name !== 'log_thought') {
        // Optional: you could log raw tool calls here if you wanted debug info
    }

    switch (name) {
      case 'log_thought':
        setLogs(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date(),
          content: args.thought,
          type: args.type || 'reasoning',
        }]);
        return { success: true };

      case 'get_calendar_events':
        const foundEvents = searchCalendar(args.query);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-check',
            timestamp: new Date(),
            content: `Checking Calendar for "${args.query}"... Found ${foundEvents.length} events.`,
            type: 'reasoning'
        }]);
        return { events: foundEvents };

      case 'add_task':
        const newTask: Task = {
          id: Date.now().toString() + Math.random(),
          title: args.title,
          priority: args.priority,
          deadline: args.deadline,
          status: 'pending',
        };
        setTasks(prev => [...prev, newTask]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Created Task: ${newTask.title}`,
            type: 'action'
        }]);
        return { success: true, taskId: newTask.id };

      case 'add_event':
        const newEvent: CalendarEvent = {
          id: Date.now().toString() + Math.random(),
          title: args.title,
          start: args.start,
          duration: args.duration,
          location: args.location,
        };
        setEvents(prev => [...prev, newEvent]);
         setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Scheduled: ${newEvent.title}`,
            type: 'action'
        }]);
        return { success: true, eventId: newEvent.id };

      case 'save_suggestion':
        const newSuggestion: Suggestion = {
            id: Date.now().toString() + Math.random(),
            title: args.title,
            category: args.category,
            items: args.items
        };
        setSuggestions(prev => [...prev, newSuggestion]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Saved List: ${newSuggestion.title}`,
            type: 'action'
        }]);
        return { success: true };

      case 'report_alert':
        const newAlert: Alert = {
          id: Date.now().toString() + Math.random(),
          message: args.message,
          severity: args.severity,
        };
        setAlert(newAlert);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-alert',
            timestamp: new Date(),
            content: `ALERT: ${args.message}`,
            type: 'conflict'
        }]);
        if (args.severity === 'info') {
            setTimeout(() => setAlert(null), 5000);
        }
        return { success: true };

      default:
        console.warn(`Unknown tool called: ${name}`);
        return { error: 'Unknown tool' };
    }
  }, []);

  // --- Lifecycle & Connectivity ---

  useEffect(() => {
    try {
        liveManager.current = new LiveManager(
            handleToolCall,
            (active) => {
                setIsConnected(active);
                if (!active) setIsRecording(false);
            },
            (err) => setError(err),
            (vol) => setVolume(vol)
        );
    } catch (e: any) {
        setError(e.message);
    }
    
    return () => {
        liveManager.current?.disconnect();
    };
  }, [handleToolCall]);

  const toggleRecording = async () => {
    if (!liveManager.current) return;
    if (isRecording) {
      liveManager.current.stopAudio();
      setIsRecording(false);
    } else {
      setError(null);
      if (!liveManager.current.isConnected) {
          await liveManager.current.connect();
          setIsRecording(true);
      } else {
          await liveManager.current.startAudio();
          setIsRecording(true);
      }
    }
  };

  const handleTextSubmit = async (text: string) => {
    setIsProcessingText(true);
    setError(null);
    setLogs(prev => [...prev, {
        id: Date.now().toString(),
        timestamp: new Date(),
        content: `User Input: "${text}"`,
        type: 'reasoning'
    }]);

    try {
        // Pass the handleToolCall to the agent so it can loop
        const response = await processTextPrompt(text, handleToolCall);
        
        // Handle Final Text Response
        if (response.text) {
             setLogs(prev => [...prev, {
                id: Date.now().toString() + '-response',
                timestamp: new Date(),
                content: response.text,
                type: 'reasoning'
            }]);
        }
        
        // Handle Grounding (Search Results that weren't tool calls but metadata)
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const chunks = response.candidates[0].groundingMetadata.groundingChunks;
            const sources = chunks
                .map((c: any) => c.web?.uri)
                .filter(Boolean);
            
            if (sources.length > 0) {
                 setSuggestions(prev => [...prev, {
                    id: Date.now().toString() + 'sources',
                    title: "Sources & References",
                    category: "Research",
                    items: sources
                 }]);
            }
        }

    } catch (e: any) {
        console.error(e);
        setError("Processing failed: " + e.message);
    } finally {
        setIsProcessingText(false);
    }
  };

  const handleFullDisconnect = () => {
      liveManager.current?.disconnect();
      setIsRecording(false);
      setLogs(prev => [...prev, {
          id: Date.now().toString(),
          timestamp: new Date(),
          content: "Session ended by user.",
          type: 'reasoning'
      }]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans selection:bg-cyan-500/30">
      
      {/* Alert Banner */}
      {alert && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border animate-bounce-in ${
            alert.severity === 'critical' ? 'bg-red-500/20 border-red-500 text-red-100' : 
            alert.severity === 'warning' ? 'bg-amber-500/20 border-amber-500 text-amber-100' :
            'bg-blue-500/20 border-blue-500 text-blue-100'
        }`}>
            <AlertCircle />
            <div>
                <p className="font-bold text-sm uppercase">{alert.severity}</p>
                <p>{alert.message}</p>
            </div>
            <button onClick={() => setAlert(null)} className="ml-4 hover:opacity-70"><X size={18} /></button>
        </div>
      )}

      <div className="max-w-7xl mx-auto h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Voice & Reasoning (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
            {/* Header / Brand */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center font-bold text-slate-900">
                        DP
                    </div>
                    <div>
                        <h1 className="font-bold text-xl tracking-tight text-white">Daily Pilot</h1>
                        <p className="text-xs text-slate-500">Autonomous Life Agent v1.0</p>
                    </div>
                </div>
                {isConnected && (
                    <button 
                        onClick={handleFullDisconnect}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Disconnect Session"
                    >
                        <Power size={18} />
                    </button>
                )}
            </div>

            {/* Input Control (Voice + Text) */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl">
                <VoiceControl 
                    isConnected={isConnected} 
                    isRecording={isRecording}
                    isProcessingText={isProcessingText}
                    volume={volume} 
                    onToggle={toggleRecording}
                    onTextSubmit={handleTextSubmit}
                    error={error}
                />
            </div>

            {/* Reasoning Log */}
            <div className="flex-1 min-h-0">
                <ReasoningLog logs={logs} />
            </div>
        </div>

        {/* Right Column: Dashboard (8 cols) */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 grid-rows-[3fr_2fr] gap-6 h-full min-h-0">
            {/* Top Row: Tasks & Suggestions */}
            <div className="md:col-span-1 h-full min-h-0">
                 <TaskList tasks={tasks} />
            </div>
            <div className="md:col-span-1 h-full min-h-0">
                 <SuggestionList suggestions={suggestions} />
            </div>

            {/* Bottom Row: Calendar */}
            <div className="md:col-span-2 h-full min-h-0">
                 <CalendarView events={events} />
            </div>
        </div>

      </div>
    </div>
  );
}

export default App;