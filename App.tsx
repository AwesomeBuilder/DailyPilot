import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveManager } from './services/liveManager';
import { processTextPrompt } from './services/textAgent';
import { Task, CalendarEvent, ThoughtLog, Alert, Suggestion, MessageDraft } from './types';
import { ReasoningLog } from './components/ReasoningLog';
import { TaskList } from './components/TaskList';
import { CalendarView } from './components/CalendarView';
import { SuggestionList } from './components/SuggestionList';
import { MessageDraftList } from './components/MessageDraftList';
import { FabricWave3D } from './components/FabricWave3D';
import { AlertCircle, X, Menu, Mic, CheckSquare, Calendar, BrainCircuit, MessageSquare, Lightbulb, Keyboard, Send, Loader2 } from 'lucide-react';

type ViewType = 'home' | 'tasks' | 'calendar' | 'notes' | 'drafts' | 'suggestions';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingText, setIsProcessingText] = useState(false);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [displayedView, setDisplayedView] = useState<ViewType>('home');
  const [isPanelExiting, setIsPanelExiting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [textInput, setTextInput] = useState('');

  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [logs, setLogs] = useState<ThoughtLog[]>([]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [drafts, setDrafts] = useState<MessageDraft[]>([]);

  // Badge tracking - store counts when panel was last viewed
  const [seenCounts, setSeenCounts] = useState<Record<ViewType, number>>({
    home: 0,
    tasks: 0,
    calendar: 0,
    notes: 0,
    drafts: 0,
    suggestions: 0,
  });

  // Track previous log count to detect new logs
  const prevLogCountRef = useRef(0);

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

  // Auto-show Chain of Thought panel when new logs arrive
  useEffect(() => {
    if (logs.length > prevLogCountRef.current) {
      // New logs have been added - auto-switch to notes panel from any view
      if (activeView !== 'notes') {
        setActiveView('notes');
      }
    }
    prevLogCountRef.current = logs.length;
  }, [logs.length, activeView]);

  // Handle panel exit animation and badge reset
  useEffect(() => {
    if (activeView === 'home' && displayedView !== 'home') {
      // Panel is closing - trigger exit animation
      setIsPanelExiting(true);
      const timer = setTimeout(() => {
        setDisplayedView('home');
        setIsPanelExiting(false);
      }, 500); // Match animation duration
      return () => clearTimeout(timer);
    } else if (activeView !== 'home') {
      // Panel is opening or switching - mark as seen after a brief delay (user scrolled/viewed)
      setDisplayedView(activeView);
      setIsPanelExiting(false);

      // Reset badge for this view by updating seen counts
      const currentCount =
        activeView === 'tasks' ? tasks.length :
        activeView === 'calendar' ? events.length :
        activeView === 'notes' ? logs.length :
        activeView === 'drafts' ? drafts.length :
        activeView === 'suggestions' ? suggestions.length : 0;

      setSeenCounts(prev => ({ ...prev, [activeView]: currentCount }));
    }
  }, [activeView, displayedView, tasks.length, events.length, logs.length, drafts.length, suggestions.length]);

  // --- Tool Logic ---

  // Helper to get Local ISO string (YYYY-MM-DDTHH:mm:ss) without Z
  const getLocalISOString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, -1);
  };

  // Mock Calendar Data Source (Dynamic based on Dummy Data)
  const searchCalendar = (query: string) => {
    const q = query.toLowerCase();
    const today = new Date();

    const generateEventsForDate = (baseDate: Date) => {
        const day = baseDate.getDay();
        const dayEvents: CalendarEvent[] = [];

        const add = (title: string, h: number, m: number, dur: number, loc: string = "", desc: string = "") => {
            const start = new Date(baseDate);
            start.setHours(h, m, 0, 0);
            const localIsoStart = getLocalISOString(start);
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

        if (day >= 1 && day <= 5) {
            add("Drop-off Ayan", 8, 0, 30, "School", "Daily school run");
        }

        if (day === 1 || day === 3) {
            add("Meeting 1: Team Sync", 9, 0, 60, "Conference Room A");
            add("Meeting 2: 1:1 with Sarah", 10, 30, 30, "Zoom");
            add("Meeting 3: Project Review", 13, 0, 60, "Zoom");
            add("Meeting 4: Dev Sync", 14, 30, 60, "Room 404");
            add("Ayan's Music Class", 16, 30, 45, "Mozart Academy", "Bring violin");
        }
        else if (day === 2 || day === 4) {
            add("Meeting 1: Client Call", 8, 0, 30, "Zoom", "Urgent client sync");
            add("Meeting 2: Design Review", 10, 30, 30, "Figma");
            add("Meeting 3: Strategy", 13, 0, 60, "Boardroom");
            add("Meeting 4: Ops Sync", 14, 30, 60, "Zoom");
            add("Ayan's Taekwondo Class", 16, 30, 45, "Dojo Center", "Remember uniform");
        }
        else if (day === 5) {
            add("Weekly Wrap-up", 9, 0, 60, "All Hands");
            add("Deep Work Block", 13, 0, 120, "Home Office", "No interruptions");
            add("Early Finish", 16, 0, 0, "", "Start weekend");
        }
        else if (day === 6) {
            add("Grocery Run", 10, 0, 90, "Whole Foods", "Weekly groceries");
            add("Dinner Reservation", 19, 0, 120, "Downtown", "Date night");
        }
        else if (day === 0) {
            add("Family Hike", 9, 0, 90, "Trailhead", "Nature walk");
            add("Week Planning", 20, 0, 30, "Home", "Review schedule for next week");
        }

        return dayEvents;
    };

    if (q.includes('week')) {
        let allEvents: CalendarEvent[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            allEvents = [...allEvents, ...generateEventsForDate(d)];
        }
        return allEvents;
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = days.findIndex(d => q.includes(d));

    if (targetDayIndex !== -1) {
        const targetDate = new Date(today);
        let daysToAdd = (targetDayIndex - today.getDay() + 7) % 7;
        if (daysToAdd === 0 && !q.includes('today')) daysToAdd = 7;

        targetDate.setDate(today.getDate() + daysToAdd);
        return generateEventsForDate(targetDate);
    }

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
        // Build history from reasoning logs (captures both voice actions and text inputs)
        const historyFromLogs = logs
            .slice(-10)
            .map(l => {
                if (l.content.startsWith('User Input:') || l.content.startsWith('Voice Input:')) {
                    return `User: ${l.content.replace(/^(User|Voice) Input: "?/, '').replace(/"$/, '')}`;
                }
                return `Agent: ${l.content}`;
            })
            .join('\n');

        const now = new Date();
        const localTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const contextString = `
        [SYSTEM CONTEXT]
        Current Local Time: ${localTimeStr}
        Current Date: ${now.toDateString()}
        User Location (Lat/Long): ${userLocation || 'Unknown'}

        [LONG TERM MEMORY / USER PREFERENCES]
        ${Object.keys(userProfile).length > 0 ? JSON.stringify(userProfile, null, 2) : "No learned preferences yet."}

        [CONVERSATION HISTORY (Last few turns - includes both voice and text inputs)]
        ${historyFromLogs}

        [CURRENT REQUEST]
        ${text}
        `;

        const response = await processTextPrompt(contextString, handleToolCall);

        const textPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.text);

        if (textPart && textPart.text) {
             setLogs(prev => [...prev, {
                id: Date.now().toString() + '-response',
                timestamp: new Date(),
                content: textPart.text,
                type: 'reasoning'
            }]);
        }

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

  // Calculate unseen counts for badges
  const getUnseenCount = (viewType: ViewType) => {
    const currentCount =
      viewType === 'tasks' ? tasks.length :
      viewType === 'calendar' ? events.length :
      viewType === 'notes' ? logs.length :
      viewType === 'drafts' ? drafts.length :
      viewType === 'suggestions' ? suggestions.length : 0;
    const seen = seenCounts[viewType] || 0;
    return Math.max(0, currentCount - seen);
  };

  // Navigation items - icons match the component card headers, show unseen counts
  const navItems = [
    { id: 'tasks' as ViewType, icon: CheckSquare, label: 'Tasks', count: getUnseenCount('tasks') },
    { id: 'calendar' as ViewType, icon: Calendar, label: 'Calendar', count: getUnseenCount('calendar') },
    { id: 'notes' as ViewType, icon: BrainCircuit, label: 'Notes', count: getUnseenCount('notes') },
    { id: 'drafts' as ViewType, icon: MessageSquare, label: 'Drafts', count: getUnseenCount('drafts') },
    { id: 'suggestions' as ViewType, icon: Lightbulb, label: 'Ideas', count: getUnseenCount('suggestions') },
  ];

  return (
    <div className="min-h-screen bg-cream text-teal-dark flex flex-col">

      {/* Alert Banner */}
      {alert && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border fade-in ${
            alert.severity === 'critical' ? 'bg-red-100 border-red-400 text-red-800' :
            alert.severity === 'warning' ? 'bg-amber-100 border-amber-400 text-amber-800' :
            'bg-teal-100 border-teal-400 text-teal-800'
        }`}>
            <AlertCircle />
            <div>
                <p className="font-bold text-sm uppercase">{alert.severity}</p>
                <p>{alert.message}</p>
            </div>
            <button onClick={() => setAlert(null)} className="ml-4 hover:opacity-70"><X size={18} /></button>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm fade-in">
          {error}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-4 md:px-8 md:py-6">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 hover:bg-teal-dark/10 rounded-lg transition-colors"
        >
          <Menu size={24} strokeWidth={2} />
        </button>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Daily Pilot</h1>
      </header>

      {/* Menu Dropdown */}
      {menuOpen && (
        <div className="absolute top-16 left-4 z-40 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[200px] fade-in">
          <button
            onClick={() => { setActiveView('home'); setMenuOpen(false); }}
            className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
          >
            <Mic size={18} /> Voice Home
          </button>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveView(item.id); setMenuOpen(false); }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <item.icon size={18} /> {item.label}
              {item.count > 0 && (
                <span className="ml-auto text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-4 pb-24 md:pb-28 overflow-hidden">
        <div className="relative flex items-center justify-center w-full max-w-6xl">

          {/* Voice Control Panel - Always Visible */}
          <div className={`voice-panel flex flex-col items-center w-full max-w-lg flex-shrink-0 z-20 ${isPanelExiting ? 'delayed-return' : ''} ${activeView !== 'home' ? 'md:-translate-x-[55%]' : 'translate-x-0'}`}>
            {/* Wave Container with Mic/Input */}
            <div className="relative w-full max-w-md md:max-w-lg aspect-square md:aspect-[4/3]">
              {/* Wave Background */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-xl bg-gradient-to-b from-white to-teal-50">
                <FabricWave3D isActive={isRecording || isProcessingText} />
              </div>

              {/* Mode Toggle - top right of wave container */}
              <div className="absolute top-4 right-4 z-20 flex gap-1 bg-white/80 backdrop-blur-sm rounded-lg p-1 shadow-md">
                <button
                  onClick={() => setInputMode('voice')}
                  className={`p-2 rounded-md transition-all ${inputMode === 'voice' ? 'bg-teal-primary text-white' : 'text-gray-500 hover:text-teal-dark'}`}
                  title="Voice Mode"
                >
                  <Mic size={16} />
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`p-2 rounded-md transition-all ${inputMode === 'text' ? 'bg-teal-primary text-white' : 'text-gray-500 hover:text-teal-dark'}`}
                  title="Text Mode"
                >
                  <Keyboard size={16} />
                </button>
              </div>

              {/* Mic Button - Voice Mode */}
              {inputMode === 'voice' && (
                <button
                  onClick={toggleRecording}
                  className={`mic-button absolute left-1/2 -translate-x-1/2 -bottom-8 z-20 w-20 h-20 md:w-24 md:h-24 rounded-full bg-cream border-4 border-gray-200 flex items-center justify-center shadow-lg hover:shadow-xl transition-all ${isRecording ? 'active border-teal-primary' : ''}`}
                >
                  <Mic
                    size={32}
                    strokeWidth={1.5}
                    className={`${isRecording ? 'text-teal-primary' : 'text-teal-dark'}`}
                  />
                </button>
              )}

              {/* Text Input - Text Mode */}
              {inputMode === 'text' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (textInput.trim() && !isProcessingText) {
                      handleTextSubmit(textInput);
                      setTextInput('');
                    }
                  }}
                  className="absolute left-1/2 -translate-x-1/2 -bottom-6 z-20 w-[90%] max-w-sm"
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type your request..."
                      className="w-full bg-white border-2 border-gray-200 text-teal-dark rounded-full py-3 pl-4 pr-12 shadow-lg focus:outline-none focus:border-teal-primary placeholder:text-gray-400"
                      disabled={isProcessingText}
                    />
                    <button
                      type="submit"
                      disabled={!textInput.trim() || isProcessingText}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-teal-primary text-white rounded-full hover:bg-teal-600 disabled:opacity-50 disabled:hover:bg-teal-primary transition-colors"
                    >
                      {isProcessingText ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} />}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Status Text */}
            <div className={`text-center ${inputMode === 'text' ? 'mt-16' : 'mt-14'}`}>
              <p className={`text-sm ${isRecording || isProcessingText ? 'text-teal-primary font-medium' : 'text-gray-400'}`}>
                {isProcessingText ? 'Processing...' : isRecording ? 'Listening...' : inputMode === 'voice' ? (isConnected ? 'Tap to speak' : 'Tap microphone to start') : 'Type and press enter'}
              </p>
            </div>
          </div>

          {/* Content Panel - Slides in from right */}
          {displayedView !== 'home' && (
            <div key={displayedView} className={`content-panel absolute top-0 right-4 w-[48%] max-w-xl h-[50vh] md:h-[60vh] hidden md:block ${isPanelExiting ? 'slide-out-right z-0' : 'slide-in-right z-10'}`}>
              {displayedView === 'tasks' && <TaskList tasks={tasks} />}
              {displayedView === 'calendar' && <CalendarView events={events} tasks={tasks} />}
              {displayedView === 'notes' && <ReasoningLog logs={logs} />}
              {displayedView === 'drafts' && <MessageDraftList drafts={drafts} />}
              {displayedView === 'suggestions' && <SuggestionList suggestions={suggestions} />}
            </div>
          )}
        </div>

      </main>

      {/* Mobile Content Panel - Slides up from bottom on small screens */}
      {activeView !== 'home' && (
        <div key={`mobile-${activeView}`} className="md:hidden fixed bottom-20 left-0 right-0 h-[50vh] bg-white rounded-t-3xl shadow-2xl slide-up z-20 overflow-hidden">
          {/* Drag handle indicator */}
          <button
            onClick={() => setActiveView('home')}
            className="w-full pt-3 pb-2 flex justify-center cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </button>
          <div className="h-[calc(100%-32px)] px-4 pb-4 overflow-auto">
            {activeView === 'tasks' && <TaskList tasks={tasks} />}
            {activeView === 'calendar' && <CalendarView events={events} tasks={tasks} />}
            {activeView === 'notes' && <ReasoningLog logs={logs} />}
            {activeView === 'drafts' && <MessageDraftList drafts={drafts} />}
            {activeView === 'suggestions' && <SuggestionList suggestions={suggestions} />}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-1 md:gap-2 bg-white/90 backdrop-blur-md rounded-2xl px-3 py-2 md:px-4 md:py-3 shadow-xl border border-gray-200">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(activeView === item.id ? 'home' : item.id)}
              className={`relative p-3 md:p-4 rounded-xl transition-all ${
                activeView === item.id
                  ? 'bg-teal-100 text-teal-primary'
                  : 'text-gray-500 hover:text-teal-dark hover:bg-gray-100'
              }`}
              title={item.label}
            >
              <item.icon size={24} strokeWidth={1.5} />
              {item.count > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-teal-primary text-white text-xs rounded-full flex items-center justify-center">
                  {item.count > 9 ? '9+' : item.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Click outside to close menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
