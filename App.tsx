import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveManager } from './services/liveManager';
import { processTextPrompt } from './services/textAgent';
import { Task, CalendarEvent, ThoughtLog, Alert, Suggestion, MessageDraft } from './types';
import { ReasoningLog } from './components/ReasoningLog';
import { TaskList } from './components/TaskList';
import { CalendarView } from './components/CalendarView';
import { SuggestionList } from './components/SuggestionList';
import { MessageDraftList } from './components/MessageDraftList';
import { VoiceControl } from './components/VoiceControl';
import { AlertCircle, X, Power, UserCog } from 'lucide-react';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingText, setIsProcessingText] = useState(false);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  
  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [logs, setLogs] = useState<ThoughtLog[]>([]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [drafts, setDrafts] = useState<MessageDraft[]>([]);
  
  // Long Term Memory (User Profile)
  const [userProfile, setUserProfile] = useState<Record<string, string>>({});

  const liveManager = useRef<LiveManager | null>(null);

  // Load Profile from LocalStorage on Mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('daily_pilot_user_profile');
    if (savedProfile) {
        try {
            setUserProfile(JSON.parse(savedProfile));
        } catch (e) {
            console.error("Failed to load profile", e);
        }
    }
  }, []);

  // Save Profile when it changes
  useEffect(() => {
     if (Object.keys(userProfile).length > 0) {
        localStorage.setItem('daily_pilot_user_profile', JSON.stringify(userProfile));
     }
  }, [userProfile]);

  // Get Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation(`${position.coords.latitude}, ${position.coords.longitude}`);
            },
            (err) => {
                console.warn("Location access denied", err);
                setUserLocation("San Francisco, CA (Default)");
            }
        );
    } else {
        setUserLocation("San Francisco, CA (Default)");
    }
  }, []);

  // --- Tool Logic ---
  
  // Helper to get Local ISO string (YYYY-MM-DDTHH:mm:ss) without Z
  // This ensures the LLM sees "08:00:00" for 8 AM, not "16:00:00Z"
  const getLocalISOString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, -1);
  };

  // Mock Calendar Data Source (Dynamic based on Dummy Data)
  const searchCalendar = (query: string) => {
    const q = query.toLowerCase();
    const today = new Date();
    
    // Helper to generate events for a specific date based on the Dummy Schedule
    const generateEventsForDate = (baseDate: Date) => {
        const day = baseDate.getDay(); // 0=Sun, 1=Mon, etc.
        const dayEvents: CalendarEvent[] = [];
        
        const add = (title: string, h: number, m: number, dur: number, loc: string = "", desc: string = "") => {
            const start = new Date(baseDate);
            start.setHours(h, m, 0, 0);
            
            // Use Local ISO format so the model reads the correct wall-clock time
            const localIsoStart = getLocalISOString(start);
            
            // Use deterministic ID so we don't duplicate when searching same day multiple times
            const id = `evt-${day}-${h}-${m}-${title.replace(/\s+/g, '-').toLowerCase()}`;
            
            dayEvents.push({
                id,
                title,
                start: localIsoStart,
                duration: `${dur} mins`,
                location: loc,
                description: desc || "Recurring Event"
            });
        };

        // --- WEEKDAY ROUTINES (Mon-Fri) ---
        if (day >= 1 && day <= 5) {
            add("Drop-off Ayan", 8, 0, 30, "School", "Daily school run");
        }

        // --- MONDAY (1) & WEDNESDAY (3) ---
        if (day === 1 || day === 3) {
            add("Meeting 1: Team Sync", 9, 0, 60, "Conference Room A");
            add("Meeting 2: 1:1 with Sarah", 10, 30, 30, "Zoom");
            add("Meeting 3: Project Review", 13, 0, 60, "Zoom");
            add("Meeting 4: Dev Sync", 14, 30, 60, "Room 404");
            add("Ayan's Music Class", 16, 30, 45, "Mozart Academy", "Bring violin");
        }
        
        // --- TUESDAY (2) & THURSDAY (4) ---
        else if (day === 2 || day === 4) {
            // CONFLICT: 8 AM Meeting vs 8 AM Drop-off
            add("Meeting 1: Client Call", 8, 0, 30, "Zoom", "Urgent client sync"); 
            add("Meeting 2: Design Review", 10, 30, 30, "Figma");
            add("Meeting 3: Strategy", 13, 0, 60, "Boardroom");
            add("Meeting 4: Ops Sync", 14, 30, 60, "Zoom");
            add("Ayan's Taekwondo Class", 16, 30, 45, "Dojo Center", "Remember uniform");
        }

        // --- FRIDAY (5) ---
        else if (day === 5) {
            add("Weekly Wrap-up", 9, 0, 60, "All Hands");
            add("Deep Work Block", 13, 0, 120, "Home Office", "No interruptions");
            add("Early Finish", 16, 0, 0, "", "Start weekend");
        }

        // --- SATURDAY (6) ---
        else if (day === 6) {
            add("Grocery Run", 10, 0, 90, "Whole Foods", "Weekly groceries");
            add("Dinner Reservation", 19, 0, 120, "Downtown", "Date night");
        }

        // --- SUNDAY (0) ---
        else if (day === 0) {
            add("Family Hike", 9, 0, 90, "Trailhead", "Nature walk");
            add("Week Planning", 20, 0, 30, "Home", "Review schedule for next week");
        }

        return dayEvents;
    };

    // 1. "Week" Query: Return next 7 days
    if (q.includes('week')) {
        let allEvents: CalendarEvent[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            allEvents = [...allEvents, ...generateEventsForDate(d)];
        }
        return allEvents;
    }

    // 2. Specific Day Query (e.g., "Friday", "Monday")
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = days.findIndex(d => q.includes(d));
    
    if (targetDayIndex !== -1) {
        const targetDate = new Date(today);
        // Calculate days to add to reach the next occurrence of this day
        let daysToAdd = (targetDayIndex - today.getDay() + 7) % 7;
        if (daysToAdd === 0 && !q.includes('today')) daysToAdd = 7; 
        
        targetDate.setDate(today.getDate() + daysToAdd);
        return generateEventsForDate(targetDate);
    }

    // 3. Keyword Search
    if (!q.includes('today') && !q.includes('tomorrow') && !q.includes('schedule') && !q.includes('calendar')) {
        let weeklyEvents: CalendarEvent[] = [];
        for (let i = 0; i < 7; i++) {
             const d = new Date(today);
             d.setDate(today.getDate() + i);
             weeklyEvents = [...weeklyEvents, ...generateEventsForDate(d)];
        }
        const filtered = weeklyEvents.filter(e => e.title.toLowerCase().includes(q));
        if (filtered.length > 0) return filtered;
    }

    // 4. Default: Return Today + Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayEvents = generateEventsForDate(today);
    const tomorrowEvents = generateEventsForDate(tomorrow);
    let results = [...todayEvents, ...tomorrowEvents];

    if (!q.includes('today') && !q.includes('tomorrow') && !q.includes('schedule') && !q.includes('calendar')) {
        results = results.filter(e => e.title.toLowerCase().includes(q));
    }

    return results;
  };

  const handleToolCall = useCallback(async (name: string, args: any) => {
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
        // Auto-merge found events into the visible calendar state so the user sees what the agent sees
        setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newEvents = foundEvents.filter(e => !existingIds.has(e.id));
            return [...prev, ...newEvents];
        });
        
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-check',
            timestamp: new Date(),
            content: `Checked Calendar for "${args.query}". Found ${foundEvents.length} events.`,
            type: 'reasoning'
        }]);
        return { events: foundEvents };

      case 'add_task':
        const newTask: Task = {
          id: Date.now().toString() + Math.random(),
          title: args.title,
          description: args.description,
          priority: args.priority,
          deadline: args.deadline,
          status: 'pending',
        };
        setTasks(prev => [...prev, newTask]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Created Task: ${newTask.title} (${newTask.priority})`,
            type: 'action'
        }]);
        return { success: true, taskId: newTask.id };

      case 'add_event':
        const newEvent: CalendarEvent = {
          id: Date.now().toString() + Math.random(),
          title: args.title,
          description: args.description,
          start: args.start,
          duration: args.duration,
          location: args.location,
        };
        setEvents(prev => [...prev, newEvent]);
         setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Scheduled: ${newEvent.title} @ ${newEvent.location || 'No Location'}`,
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
      
      case 'draft_message':
        const newDraft: MessageDraft = {
            id: Date.now().toString() + Math.random(),
            recipient: args.recipient,
            platform: args.platform,
            reason: args.reason,
            content: args.content
        };
        setDrafts(prev => [...prev, newDraft]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-draft',
            timestamp: new Date(),
            content: `Drafted ${args.platform} to ${args.recipient}`,
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

      case 'update_user_preference':
         const { category, preference } = args;
         setUserProfile(prev => ({ ...prev, [category]: preference }));
         setLogs(prev => [...prev, {
            id: Date.now().toString() + '-learn',
            timestamp: new Date(),
            content: `LEARNED: User prefers ${preference} for ${category}`,
            type: 'action'
        }]);
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
        // Build History from Logs for Multi-turn context
        // We only use the last 6 entries for IMMEDIATE context
        const history = logs
            .filter(l => l.type === 'reasoning')
            .slice(-6) 
            .map(l => {
                if (l.content.startsWith('User Input: ')) return `User: ${l.content.replace('User Input: ', '')}`;
                return `Agent: ${l.content}`;
            })
            .join('\n');

        // Construct Context-Aware Prompt with Long Term Memory
        const now = new Date();
        const localTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const contextString = `
        [SYSTEM CONTEXT]
        Current Local Time: ${localTimeStr}
        Current Date: ${now.toDateString()}
        User Location (Lat/Long): ${userLocation || 'Unknown'}
        
        [LONG TERM MEMORY / USER PREFERENCES]
        ${Object.keys(userProfile).length > 0 ? JSON.stringify(userProfile, null, 2) : "No learned preferences yet."}

        [CONVERSATION HISTORY (Last few turns)]
        ${history}

        [CURRENT REQUEST]
        ${text}
        `;

        // Pass the handleToolCall to the agent so it can loop
        const response = await processTextPrompt(contextString, handleToolCall);
        
        // Handle Final Text Response Safely
        const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
        
        if (textPart && textPart.text) {
             setLogs(prev => [...prev, {
                id: Date.now().toString() + '-response',
                timestamp: new Date(),
                content: textPart.text,
                type: 'reasoning'
            }]);
        }
        
        // Handle Grounding
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
                <div className="flex items-center gap-2">
                     <button className="p-2 text-slate-500 hover:text-cyan-400 transition-colors" title="Memory Profile">
                        <UserCog size={18} />
                     </button>
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
            {/* Top Row: Tasks & Assistants (Drafts + Suggestions) */}
            <div className="md:col-span-1 h-full min-h-0">
                 <TaskList tasks={tasks} />
            </div>
            
            <div className="md:col-span-1 h-full min-h-0 flex flex-col gap-6">
                {/* Dynamically show Drafts if available, otherwise show Suggestions full height */}
                {drafts.length > 0 ? (
                    <>
                        <div className="flex-1 min-h-0">
                             <MessageDraftList drafts={drafts} />
                        </div>
                        <div className="flex-1 min-h-0">
                             <SuggestionList suggestions={suggestions} />
                        </div>
                    </>
                ) : (
                    <div className="h-full">
                         <SuggestionList suggestions={suggestions} />
                    </div>
                )}
            </div>

            {/* Bottom Row: Calendar */}
            <div className="md:col-span-2 h-full min-h-0">
                 <CalendarView events={events} tasks={tasks} />
            </div>
        </div>

      </div>
    </div>
  );
}

export default App;