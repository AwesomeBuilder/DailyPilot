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
import { GoogleSignIn } from './components/GoogleSignIn';
import { useAuth } from './hooks/useAuth';
import { AlertCircle, X, Mic, CheckSquare, Calendar, BrainCircuit, MessageSquare, Lightbulb, Keyboard, Send, Loader2, ArrowRight, Sparkles } from 'lucide-react';

type ViewType = 'home' | 'tasks' | 'calendar' | 'notes' | 'drafts' | 'suggestions';

const API_BASE = 'http://localhost:3001';

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
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [textInput, setTextInput] = useState('');
  const [signInBannerDismissed, setSignInBannerDismissed] = useState(() => {
    return localStorage.getItem('signInBannerDismissed') === 'true';
  });

  // Google OAuth authentication
  const { isAuthenticated, isLoading: authLoading, error: authError, login, logout, clearError } = useAuth();

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

  // Fetch calendar events and tasks when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCalendarData = async () => {
      try {
        // Fetch calendar events for next 7 days
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const params = new URLSearchParams({ timeMin, timeMax });
        const eventsResponse = await fetch(`${API_BASE}/api/calendar/events?${params}`, {
          credentials: 'include',
        });

        if (eventsResponse.ok) {
          const data = await eventsResponse.json();
          if (data.events && data.events.length > 0) {
            setEvents(prev => {
              const existingIds = new Set(prev.map(e => e.id));
              const newEvents = data.events.filter((e: CalendarEvent) => !existingIds.has(e.id));
              return [...prev, ...newEvents];
            });
          }
        }

        // Fetch tasks from default list
        const tasksResponse = await fetch(`${API_BASE}/api/tasks/@default`, {
          credentials: 'include',
        });

        if (tasksResponse.ok) {
          const data = await tasksResponse.json();
          if (data.tasks) {
            setTasks(data.tasks);
          }
        }
      } catch (error) {
        console.error('Failed to fetch calendar data:', error);
      }
    };

    fetchCalendarData();
  }, [isAuthenticated]);

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

  // Simple delay helper for throttling API calls
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Delete tasks sequentially to avoid triggering rate limits / quotas
  const deleteTasksSequential = async (ids: string[]) => {
    const results: { taskId: string; success: boolean; error?: string }[] = [];
    for (const taskId of ids) {
      const result = await deleteGoogleTask(taskId);
      results.push({ taskId, ...result });
      // If quota is exceeded, break early to avoid more failing calls
      if (!result.success && (result.error || '').toLowerCase().includes('quota')) break;
      // Small delay to stay under per-second quotas
      await delay(120);
    }
    return results;
  };

  // Fetch calendar events from Google Calendar API
  const fetchCalendarFromAPI = async (query: string): Promise<CalendarEvent[]> => {
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const params = new URLSearchParams({
        query,
        timeMin,
        timeMax,
      });

      const response = await fetch(`${API_BASE}/api/calendar/events?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Calendar API error:', error);
      return [];
    }
  };

  // Create event in Google Calendar
  const createCalendarEvent = async (event: {
    title: string;
    description?: string;
    start: string;
    duration: string;
    location?: string;
  }): Promise<{ success: boolean; event?: CalendarEvent; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create event');
      }

      const data = await response.json();
      return { success: true, event: data.event };
    } catch (error: any) {
      console.error('Calendar create error:', error);
      return { success: false, error: error.message };
    }
  };

  // Create task in Google Tasks
  const createGoogleTask = async (task: {
    title: string;
    description?: string;
    deadline?: string;
  }): Promise<{ success: boolean; task?: Task; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/@default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create task');
      }

      const data = await response.json();
      return { success: true, task: data.task };
    } catch (error: any) {
      console.error('Task create error:', error);
      return { success: false, error: error.message };
    }
  };

  // Update task in Google Tasks
  const updateGoogleTask = async (
    taskId: string,
    updates: { title?: string; description?: string; deadline?: string; status?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/@default/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update task');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Task update error:', error);
      return { success: false, error: error.message };
    }
  };

  // Delete task from Google Tasks
  const deleteGoogleTask = async (taskId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/@default/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete task');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Task delete error:', error);
      return { success: false, error: error.message };
    }
  };

  // Update event in Google Calendar
  const updateCalendarEvent = async (
    eventId: string,
    updates: { title?: string; description?: string; start?: string; duration?: string; location?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update event');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Calendar update error:', error);
      return { success: false, error: error.message };
    }
  };

  // Delete event from Google Calendar
  const deleteCalendarEvent = async (eventId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete event');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Calendar delete error:', error);
      return { success: false, error: error.message };
    }
  };

  // Mock Calendar Data Source (Dynamic based on Dummy Data) - fallback when not authenticated
  const searchCalendarMock = (query: string) => {
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

  // Combined search function - uses API if authenticated, mock otherwise
  const searchCalendar = async (query: string): Promise<CalendarEvent[]> => {
    if (isAuthenticated) {
      return await fetchCalendarFromAPI(query);
    }
    return searchCalendarMock(query);
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
        const foundEvents = await searchCalendar(args.query);
        setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newEvents = foundEvents.filter(e => !existingIds.has(e.id));
            return [...prev, ...newEvents];
        });

        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-check',
            timestamp: new Date(),
            content: `Checked Calendar for "${args.query}". Found ${foundEvents.length} events.${isAuthenticated ? ' (Google Calendar)' : ' (Demo Data)'}`,
            type: 'reasoning'
        }]);
        // Include explicit completion hint to help Gemini stop looping (known bug workaround)
        return {
          events: foundEvents,
          status: "complete",
          instruction: "Calendar data retrieved successfully. Now summarize these events for the user in a natural spoken response. Do NOT call any more tools."
        };

      case 'add_task':
        // Validate args - reject garbage (model sometimes sends result objects as args)
        if (!args.title || typeof args.title !== 'string' || args.title.length < 2) {
          console.warn('Invalid add_task args:', args);
          return { success: false, error: 'Invalid task: title is required' };
        }
        if (args.result || args.success || args.taskId) {
          console.warn('Rejected garbage add_task args:', args);
          return { success: false, error: 'Invalid task args - do not pass result objects' };
        }

        // If authenticated, also create in Google Tasks
        let taskId = Date.now().toString() + Math.random();

        if (isAuthenticated) {
          const result = await createGoogleTask({
            title: args.title,
            description: args.description,
            deadline: args.deadline,
          });
          if (result.success && result.task) {
            taskId = result.task.id;
          }
        }

        const newTask: Task = {
          id: taskId,
          title: args.title,
          description: args.description,
          priority: args.priority || 'Medium',
          deadline: args.deadline,
          status: 'pending',
        };
        setTasks(prev => [...prev, newTask]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Created Task: ${newTask.title} (${newTask.priority})${isAuthenticated ? ' - Synced to Google Tasks' : ''}`,
            type: 'action'
        }]);
        return { success: true, taskId: newTask.id };

      case 'add_event':
        let eventId = Date.now().toString() + Math.random();
        let eventData: CalendarEvent = {
          id: eventId,
          title: args.title,
          description: args.description,
          start: args.start,
          duration: args.duration,
          location: args.location,
        };

        // If authenticated, create in Google Calendar
        if (isAuthenticated) {
          const result = await createCalendarEvent({
            title: args.title,
            description: args.description,
            start: args.start,
            duration: args.duration,
            location: args.location,
          });
          if (result.success && result.event) {
            eventData = result.event;
          }
        }

        setEvents(prev => [...prev, eventData]);
        setLogs(prev => [...prev, {
            id: Date.now().toString() + '-action',
            timestamp: new Date(),
            content: `Scheduled: ${eventData.title} @ ${eventData.location || 'No Location'}${isAuthenticated ? ' - Added to Google Calendar' : ''}`,
            type: 'action'
        }]);
        return { success: true, eventId: eventData.id };

      case 'delete_event':
        let deletedEventTitle = args.eventId; // fallback to ID if title not found

        // If authenticated, delete from Google Calendar directly (don't rely on local state)
        if (isAuthenticated) {
          const deleteResult = await deleteCalendarEvent(args.eventId);
          if (!deleteResult.success) {
            console.error('Failed to delete from Google Calendar:', deleteResult.error);
            return { success: false, error: deleteResult.error || 'Failed to delete from Google Calendar' };
          }
        }

        // Update local state using functional update to avoid stale closure
        setEvents(prev => {
          const eventToDelete = prev.find(e => e.id === args.eventId);
          if (eventToDelete) {
            deletedEventTitle = eventToDelete.title;
          }
          return prev.filter(e => e.id !== args.eventId);
        });

        setLogs(prev => [...prev, {
          id: Date.now().toString() + '-action',
          timestamp: new Date(),
          content: `Deleted event: ${deletedEventTitle}${args.reason ? ` (${args.reason})` : ''}`,
          type: 'action'
        }]);
        return { success: true, deletedEvent: deletedEventTitle };

      case 'delete_task':
        let deletedTaskTitle = args.taskId; // fallback to ID if title not found

        // Update local state
        setTasks(prev => {
          const taskToDelete = prev.find(t => t.id === args.taskId);
          if (taskToDelete) {
            deletedTaskTitle = taskToDelete.title;
          }
          return prev.filter(t => t.id !== args.taskId);
        });

        setLogs(prev => [...prev, {
          id: Date.now().toString() + '-action',
          timestamp: new Date(),
          content: `Deleted task: ${deletedTaskTitle}${args.reason ? ` (${args.reason})` : ''}`,
          type: 'action'
        }]);
        return { success: true, deletedTask: deletedTaskTitle };

      case 'save_suggestion':
        // Helper to generate URL based on linkType if not provided
        const generateUrl = (text: string, linkType?: string): string | undefined => {
          const encoded = encodeURIComponent(text);
          switch (linkType) {
            case 'google_search':
              return `https://www.google.com/search?q=${encoded}`;
            case 'google_maps':
              return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
            case 'store':
              return `https://www.amazon.com/s?k=${encoded}`;
            default:
              return undefined;
          }
        };

        const newSuggestion: Suggestion = {
            id: Date.now().toString() + Math.random(),
            title: args.title,
            category: args.category,
            // Normalize items and auto-generate URLs if missing
            items: args.items.map((item: any) => {
                if (typeof item === 'string') {
                    return { text: item };
                }
                // Auto-generate URL if linkType provided but no URL
                if (item.linkType && !item.url) {
                    return { ...item, url: generateUrl(item.text, item.linkType) };
                }
                return item;
            })
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
  }, [isAuthenticated]);

  // --- CRUD Handlers for Tasks ---
  const handleUpdateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    // Update local state immediately for responsiveness
    setTasks(prev => prev.map(task =>
      task.id === id ? { ...task, ...updates } : task
    ));

    // Sync to Google Tasks if authenticated
    if (isAuthenticated) {
      const result = await updateGoogleTask(id, {
        title: updates.title,
        description: updates.description,
        deadline: updates.deadline,
        status: updates.status,
      });
      if (!result.success) {
        console.error('Failed to sync task update to Google:', result.error);
        // Optionally show error to user
      }
    }
  }, [isAuthenticated]);

  const handleDeleteTask = useCallback(async (id: string) => {
    const prevTasks = tasks;
    // Optimistic removal
    setTasks(prev => prev.filter(task => task.id !== id));

    if (isAuthenticated) {
      const result = await deleteGoogleTask(id);
      if (!result.success) {
        console.error('Failed to sync task deletion to Google:', result.error);
        // Roll back and notify
        setTasks(prevTasks);
        setAlert({
          id: Date.now().toString(),
          message: `Couldn't delete task (Google Tasks): ${result.error || 'Unknown error'}`,
          severity: 'warning'
        });
      } else {
        // Ensure local stays in sync
        setTasks(current => current.filter(task => task.id !== id));
      }
    }
  }, [isAuthenticated, tasks]);

  const handleDeleteTasks = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const prevTasks = tasks;

    // Optimistic removal
    setTasks(prev => prev.filter(task => !ids.includes(task.id)));

    if (isAuthenticated) {
      const results = await deleteTasksSequential(ids);
      const successIds = results.filter(r => r.success).map(r => r.taskId);
      const failed = results.filter(r => !r.success);

      if (failed.length > 0) {
        // Roll back failures (keep successes removed)
        setTasks(prevTasks.filter(task => !successIds.includes(task.id)));
        setAlert({
          id: Date.now().toString(),
          message: `Some tasks couldn't be deleted in Google (kept locally): ${failed[0].error || 'Unknown error'}.`,
          severity: 'warning'
        });
      }
    }
  }, [isAuthenticated, tasks]);

  const handleDeleteAllTasks = useCallback(async () => {
    if (!tasks.length) return;
    const prevTasks = tasks;
    const ids = tasks.map(t => t.id);

    // Optimistic clear
    setTasks([]);

    if (isAuthenticated) {
      const results = await deleteTasksSequential(ids);
      const successIds = results.filter(r => r.success).map(r => r.taskId);
      const failed = results.filter(r => !r.success);

      if (failed.length > 0) {
        // Restore only failed tasks
        setTasks(prevTasks.filter(task => failed.some(f => f.taskId === task.id)));
        setAlert({
          id: Date.now().toString(),
          message: `Couldn't delete all tasks in Google (restored ${failed.length} locally): ${failed[0].error || 'Unknown error'}.`,
          severity: 'warning'
        });
      }
    }
  }, [tasks, isAuthenticated]);

  // --- CRUD Handlers for Events ---
  const handleUpdateEvent = useCallback(async (id: string, updates: Partial<CalendarEvent>) => {
    // Update local state immediately for responsiveness
    setEvents(prev => prev.map(event =>
      event.id === id ? { ...event, ...updates } : event
    ));

    // Sync to Google Calendar if authenticated
    if (isAuthenticated) {
      const result = await updateCalendarEvent(id, {
        title: updates.title,
        description: updates.description,
        start: updates.start,
        duration: updates.duration,
        location: updates.location,
      });
      if (!result.success) {
        console.error('Failed to sync event update to Google:', result.error);
        // Optionally show error to user
      }
    }
  }, [isAuthenticated]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    // Update local state immediately
    setEvents(prev => prev.filter(event => event.id !== id));

    // Sync to Google Calendar if authenticated
    if (isAuthenticated) {
      const result = await deleteCalendarEvent(id);
      if (!result.success) {
        console.error('Failed to sync event deletion to Google:', result.error);
        // Optionally show error to user
      }
    }
  }, [isAuthenticated]);

  const handleAddEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>) => {
    let newEvent: CalendarEvent = {
      ...event,
      id: Date.now().toString() + Math.random(),
    };

    // Sync to Google Calendar if authenticated
    if (isAuthenticated) {
      const result = await createCalendarEvent({
        title: event.title,
        description: event.description,
        start: event.start,
        duration: event.duration,
        location: event.location,
      });
      if (result.success && result.event) {
        newEvent = result.event;
      }
    }

    setEvents(prev => [...prev, newEvent]);
  }, [isAuthenticated]);

  // --- CRUD Handlers for Drafts ---
  const handleUpdateDraft = useCallback((id: string, updates: Partial<MessageDraft>) => {
    setDrafts(prev => prev.map(draft =>
      draft.id === id ? { ...draft, ...updates } : draft
    ));
  }, []);

  const handleDeleteDraft = useCallback((id: string) => {
    setDrafts(prev => prev.filter(draft => draft.id !== id));
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
            (vol) => setVolume(vol),
            // Handle reasoning thoughts from Gemini's thinkingConfig
            (thought) => {
                setLogs(prev => [...prev, {
                    id: Date.now().toString() + '-thought',
                    timestamp: new Date(),
                    content: thought,
                    type: 'reasoning' as const
                }]);
            }
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

  // Smoothly scroll to marketing sections so judges see context fast
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Account for header + spacing; ensure fully visible
    const headerOffset = 140;
    const y = el.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' });
  };

  const anchorLinks = [
    { id: 'live-demo', label: 'Live Demo' },
    { id: 'how-it-works', label: 'How it works' },
    { id: 'future', label: 'Future' },
    { id: 'about', label: 'About' },
    { id: 'credits', label: 'Credits' },
  ];

  // Keep scroll position stable when toggling panels (especially notes)
  const handleViewSelect = (id: ViewType) => {
    const y = window.scrollY;
    setActiveView(prev => (prev === id ? 'home' : id));
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'auto' });
    });
  };

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
          onClick={() => setActiveView('home')}
          className="group flex items-center gap-3 px-2 py-1 rounded-lg hover:bg-teal-dark/10 transition-colors"
          aria-label="Go to Voice Home"
        >
          <img
            src="/logo.png"
            alt="Daily Pilot"
            className="h-12 md:h-16 w-auto drop-shadow-md"
          />
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Daily Pilot</h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-teal-primary group-hover:text-teal-dark">
                <Mic size={14} /> Voice
              </span>
            </div>
            <p className="text-xs md:text-sm text-gray-500 leading-snug">
              Voice-first control for tasks, calendar, and notes — the live demo is front and center.
            </p>
          </div>
        </button>
        <div className="ml-auto">
          <GoogleSignIn
            isAuthenticated={isAuthenticated}
            isLoading={authLoading}
            error={authError}
            onLogin={login}
            onLogout={logout}
            onClearError={clearError}
          />
        </div>
      </header>

      {/* Sign-in Banner for unauthenticated users */}
      {!isAuthenticated && !authLoading && !signInBannerDismissed && (
        <div className="mx-4 md:mx-8 mb-4 bg-gradient-to-r from-teal-50 via-white to-coral-soft border border-teal-100 rounded-xl p-4 flex items-center gap-4 fade-in">
          <div className="flex-shrink-0 w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
            <Calendar size={20} className="text-teal-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 text-sm md:text-base">
              Connect your Google Calendar for the full experience
            </p>
            <p className="text-gray-500 text-xs md:text-sm mt-0.5">
              Daily Pilot can sync your events, check for conflicts, and add tasks directly to your calendar.
            </p>
          </div>
          <button
            onClick={login}
            className="flex-shrink-0 flex items-center gap-2 bg-teal-primary hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Connect <ArrowRight size={16} />
          </button>
          <button
            onClick={() => {
              setSignInBannerDismissed(true);
              localStorage.setItem('signInBannerDismissed', 'true');
            }}
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Sticky anchor nav - streamlined links */}
      <nav className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-t border-b border-teal-dark/5">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-2 flex gap-4 overflow-x-auto scrollbar-hide text-sm md:text-base font-semibold text-teal-dark">
          {anchorLinks.map(link => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="pb-1 border-b-2 border-transparent hover:border-teal-primary transition-colors whitespace-nowrap"
            >
              {link.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Area with sections for judges */}
      <main className="flex-1 px-4 pb-28 md:pb-32 overflow-visible">
        {/* Live Demo Hero - focused on cards only */}
        <section id="live-demo" className="pt-6 md:pt-10">
          <div className="relative w-full max-w-6xl mx-auto flex justify-center">
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

                {/* Example prompts for authenticated users */}
                {isAuthenticated && !isRecording && !isProcessingText && logs.length === 0 && (
                  <div className="mt-6 text-center fade-in">
                    <p className="text-xs text-gray-400 mb-3 flex items-center justify-center gap-1.5">
                      <Sparkles size={12} />
                      Try saying or typing
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                      {[
                        "What's on my schedule today?",
                        "Add a task to call mom",
                        "Schedule lunch with Sarah tomorrow",
                        "Do I have any conflicts this week?",
                      ].map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            if (inputMode === 'text') {
                              setTextInput(prompt);
                            } else {
                              setInputMode('text');
                              setTextInput(prompt);
                            }
                          }}
                          className="text-xs bg-white/80 hover:bg-white border border-gray-200 hover:border-teal-300 text-gray-600 hover:text-teal-700 px-3 py-1.5 rounded-full transition-all shadow-sm hover:shadow"
                        >
                          "{prompt}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Content Panel - Slides in from right (restored width) */}
              {displayedView !== 'home' && (
                <div
                  key={displayedView}
                  className={`content-panel absolute top-0 right-4 w-[48%] max-w-xl h-[50vh] md:h-[60vh] hidden md:block ${isPanelExiting ? 'slide-out-right z-0' : 'slide-in-right z-10'}`}
                >
                  {displayedView === 'tasks' && (
                    <TaskList
                      tasks={tasks}
                      onUpdateTask={handleUpdateTask}
                      onDeleteTask={handleDeleteTask}
                      onDeleteTasks={handleDeleteTasks}
                      onDeleteAllTasks={handleDeleteAllTasks}
                    />
                  )}
                  {displayedView === 'calendar' && <CalendarView events={events} tasks={tasks} onUpdateEvent={handleUpdateEvent} onDeleteEvent={handleDeleteEvent} onAddEvent={handleAddEvent} />}
                  {displayedView === 'notes' && <ReasoningLog logs={logs} />}
                  {displayedView === 'drafts' && <MessageDraftList drafts={drafts} onUpdateDraft={handleUpdateDraft} onDeleteDraft={handleDeleteDraft} />}
                  {displayedView === 'suggestions' && <SuggestionList suggestions={suggestions} />}
                </div>
              )}
            </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="max-w-6xl mx-auto mt-12 md:mt-16">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs uppercase font-semibold text-teal-primary tracking-wide">How it works</p>
                <h3 className="text-2xl md:text-3xl font-bold">3-step flow</h3>
              </div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-4 py-2 rounded-full bg-teal-50 text-teal-dark border border-teal-100 hover:bg-teal-100 transition-colors text-sm font-semibold"
              >
                Back to demo
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  title: '1) Capture',
                  copy: 'Tap mic or type. Audio streams to LiveManager; text falls back to Gemini.',
                  icon: Mic,
                },
                {
                  title: '2) Orchestrate',
                  copy: 'Tool calls manage Calendar, Tasks, Suggestions, and Drafts with visible reasoning.',
                  icon: BrainCircuit,
                },
                {
                  title: '3) Show receipts',
                  copy: 'Reasoning log and panels update in real time so results stay transparent.',
                  icon: CheckSquare,
                },
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-sand shadow-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-teal-primary font-semibold">
                    <item.icon size={18} />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Future possibilities */}
        <section id="future" className="max-w-6xl mx-auto mt-12 md:mt-16">
          <div className="bg-gradient-to-r from-teal-900 via-teal-dark to-teal-primary text-white rounded-2xl p-6 md:p-8 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs uppercase font-semibold tracking-wide text-teal-100">Future possibilities</p>
                <h3 className="text-2xl md:text-3xl font-bold">Where we take this next</h3>
              </div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-4 py-2 rounded-full bg-white/10 border border-white/30 text-white hover:bg-white/15 transition-colors text-sm font-semibold"
              >
                Try now
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              {[
                'Cross-channel sync with Slack/Teams and email triage.',
                'Multi-user “crew” mode to negotiate shared schedules.',
                'Offline-first mobile with voice diarization.',
              ].map((item, idx) => (
                <div key={idx} className="bg-white/10 border border-white/20 rounded-xl p-4 text-sm leading-relaxed">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="max-w-6xl mx-auto mt-12 md:mt-16">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-3">
            <p className="text-xs uppercase font-semibold text-teal-primary tracking-wide">About</p>
            <h3 className="text-2xl font-bold">Purpose-built productivity copilot</h3>
            <p className="text-gray-600 leading-relaxed">
              Daily Pilot is a voice-first copilot that keeps tasks, calendar, and reasoning in one pane. The landing flow keeps the live demo up front while still giving space for context and roadmap below.
            </p>
          </div>
        </section>

        {/* Credits / Copyright */}
        <section id="credits" className="max-w-6xl mx-auto mt-10 md:mt-12 mb-8">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-xs uppercase font-semibold text-teal-primary tracking-wide">Credits & Copyright</p>
              <p className="text-gray-600 text-sm md:text-base">
                © 2024–2026 Daily Pilot team. Uses Google Calendar/Tasks APIs and Gemini for reasoning. Assets: fabric-wave by team.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-4 py-2 rounded-full bg-teal-primary text-white font-semibold shadow-sm hover:bg-teal-600 transition-colors"
              >
                Back to top
              </button>
            </div>
          </div>
        </section>
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
            {activeView === 'tasks' && (
              <TaskList
                tasks={tasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onDeleteTasks={handleDeleteTasks}
                onDeleteAllTasks={handleDeleteAllTasks}
              />
            )}
            {activeView === 'calendar' && <CalendarView events={events} tasks={tasks} onUpdateEvent={handleUpdateEvent} onDeleteEvent={handleDeleteEvent} onAddEvent={handleAddEvent} />}
            {activeView === 'notes' && <ReasoningLog logs={logs} />}
            {activeView === 'drafts' && <MessageDraftList drafts={drafts} onUpdateDraft={handleUpdateDraft} onDeleteDraft={handleDeleteDraft} />}
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
              onClick={() => handleViewSelect(item.id)}
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

    </div>
  );
}

export default App;
