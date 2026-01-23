import { FunctionDeclaration, Type } from "@google/genai";

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

export interface Suggestion {
  id: string;
  title: string;
  category: 'Restaurant' | 'Research' | 'Shopping' | 'Other';
  items: string[];
}

// Tool Definitions for Gemini
export const TOOLS_DECLARATION: FunctionDeclaration[] = [
  {
    name: "log_thought",
    description: "Log your internal reasoning process. ALWAYS use this before taking action or when you need to explain your plan.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        thought: { type: Type.STRING, description: "The reasoning text." },
        type: { type: Type.STRING, enum: ["reasoning", "conflict"], description: "Type of thought." }
      },
      required: ["thought", "type"]
    }
  },
  {
    name: "get_calendar_events",
    description: "Search the user's existing calendar for events. Use this when the user is unsure of a time or to check for conflicts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query (e.g., 'Music Class', 'Today', 'Tomorrow')." },
      },
      required: ["query"]
    }
  },
  {
    name: "add_task",
    description: "Add a new task to the user's todo list.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The task description." },
        priority: { type: Type.STRING, enum: ["High", "Medium", "Low"], description: "Priority level." },
        deadline: { type: Type.STRING, description: "Optional deadline (e.g., 'Today 5pm', 'Friday')." }
      },
      required: ["title", "priority"]
    }
  },
  {
    name: "add_event",
    description: "Schedule an event on the user's calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Event title." },
        start: { type: Type.STRING, description: "Start time/date (ISO 8601 preferred or natural language)." },
        duration: { type: Type.STRING, description: "Duration (e.g., '30 mins')." },
        location: { type: Type.STRING, description: "Location or context." }
      },
      required: ["title", "start", "duration"]
    }
  },
  {
    name: "save_suggestion",
    description: "Save a list of suggestions or research findings (e.g., Recommended Restaurants, Shopping Lists).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Title of the suggestion list." },
        category: { type: Type.STRING, enum: ["Restaurant", "Research", "Shopping", "Other"] },
        items: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of items/findings." }
      },
      required: ["title", "category", "items"]
    }
  },
  {
    name: "report_alert",
    description: "Proactively alert the user about conflicts or suggestions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "The alert message." },
        severity: { type: Type.STRING, enum: ["info", "warning", "critical"] }
      },
      required: ["message", "severity"]
    }
  }
];

export const SYSTEM_INSTRUCTION = `
You are 'Daily Pilot', an elite autonomous life management agent. 
Your goal is to parse conversational 'brain dumps' into structured tasks, calendar events, and research notes.

**CRITICAL PROTOCOL**:
1. **Verify Information**: If a user mentions an event but is unsure of details (e.g., "I don't remember the time"), you MUST first use \`get_calendar_events\` to find the answer. Do not guess.
2. **Reasoning Loop**:
   - Step 1: Analyze the request.
   - Step 2: Log a thought (\`log_thought\`) about what information is missing or what needs to be done.
   - Step 3: Call tools to get info (Search or Calendar).
   - Step 4: Once you have the info, proceed to \`add_task\` or \`add_event\`.
3. **Research & Suggestions**: If the user asks for recommendations (e.g., "new restaurants"), use Google Search (if available) or your knowledge to generate a list, then use \`save_suggestion\` to present it.

**Tone**: Professional, crisp, efficient. Like a co-pilot in a cockpit.
`;