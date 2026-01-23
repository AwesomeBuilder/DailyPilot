export interface Task {
  id: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  deadline?: string;
  status: 'pending' | 'completed';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO string
  duration: string; // e.g. "1 hour"
  location?: string;
}

export interface ThoughtLog {
  id: string;
  timestamp: Date;
  content: string;
  type: 'reasoning' | 'action' | 'conflict';
}

export interface Alert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

// Tool Definitions for Gemini
// We use simple string types ("STRING", "OBJECT") to ensure maximum compatibility with the schema parser.
export const TOOLS_DECLARATION = [
  {
    name: "log_thought",
    description: "Log your internal reasoning process or 'Thought Trace' before taking action. Explain why you are making specific decisions.",
    parameters: {
      type: "OBJECT",
      properties: {
        thought: { type: "STRING", description: "The reasoning text." },
        type: { type: "STRING", enum: ["reasoning", "conflict"], description: "Type of thought." }
      },
      required: ["thought", "type"]
    }
  },
  {
    name: "add_task",
    description: "Add a new task to the user's todo list.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "The task description." },
        priority: { type: "STRING", enum: ["High", "Medium", "Low"], description: "Priority level." },
        deadline: { type: "STRING", description: "Optional deadline (e.g., 'Today 5pm', 'Friday')." }
      },
      required: ["title", "priority"]
    }
  },
  {
    name: "add_event",
    description: "Schedule an event on the user's calendar.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Event title." },
        start: { type: "STRING", description: "Start time/date (ISO 8601 preferred or natural language)." },
        duration: { type: "STRING", description: "Duration (e.g., '30 mins')." },
        location: { type: "STRING", description: "Location or context." }
      },
      required: ["title", "start", "duration"]
    }
  },
  {
    name: "report_alert",
    description: "Proactively alert the user about conflicts or suggestions.",
    parameters: {
      type: "OBJECT",
      properties: {
        message: { type: "STRING", description: "The alert message." },
        severity: { type: "STRING", enum: ["info", "warning", "critical"] }
      },
      required: ["message", "severity"]
    }
  }
];

export const SYSTEM_INSTRUCTION = `
You are 'Daily Pilot', an elite autonomous life management agent. 
Your goal is to parse conversational 'brain dumps' into structured tasks and calendar events.
You do not just chat; you plan, organize, and verify.

OPERATIONAL RULES:
1. **Thought Trace**: Before or while performing actions, you MUST use the 'log_thought' tool to explain your internal reasoning. 
   - Example: "User mentioned 'gym', checking for conflicts with 'work meeting'..."
2. **Proactive**: Identify conflicts (e.g., overlapping events, unrealistic deadlines) and use 'report_alert' to notify the user.
3. **Execution**: Use 'add_task' and 'add_event' to update the dashboard immediately when you identify a distinct item.
4. **Clarification**: If details are vague (e.g., "reminder for later"), ask for clarification verbally, but still log your uncertainty in the thought trace.
5. **Tone**: Professional, crisp, efficient. Like a co-pilot in a cockpit.

When the user speaks, listen for:
- Tasks ("I need to finish the report")
- Events ("Meeting with John at 2pm tomorrow")
- Conflicts ("I have to pick up the kids but I also have a call")

When the user mentions an event but is unsure of the time (e.g., 'I think it's at 4'), do not ask for confirmation immediately. 
Instead, first call the get_calendar_events tool to see if the event already exists. Only prompt the user for confirmation if the tool returns no results or if there is a clear conflict.
`;