import { FunctionDeclaration, Type } from "@google/genai";

export interface Task {
  id: string;
  title: string;
  description?: string; // New field for lists/details
  priority: 'High' | 'Medium' | 'Low';
  deadline?: string;
  status: 'pending' | 'completed';
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string; // New field for context
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
        query: { type: Type.STRING, description: "Search query (e.g., 'Music Class', 'Today', 'Tomorrow', 'Week')." },
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
        description: { type: Type.STRING, description: "Detailed notes, checklists, or context (e.g., the specific grocery list)." },
        priority: { type: Type.STRING, enum: ["High", "Medium", "Low"], description: "Priority level." },
        deadline: { type: Type.STRING, description: "Optional deadline. PREFER ISO 8601 format (e.g. '2023-10-27T17:00:00') if a specific time is mentioned, otherwise natural language (e.g. 'Friday')." }
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
        description: { type: Type.STRING, description: "Context or details." },
        start: { type: Type.STRING, description: "Start time/date (ISO 8601 REQUIRED e.g. 2024-01-01T10:00:00)." },
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
  },
  {
    name: "update_user_preference",
    description: "Save a learned fact about the user's style, preferences, or constraints to Long Term Memory.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, description: "The category of preference (e.g., 'Furniture Style', 'Clothing Size', 'Dietary Restriction')." },
        preference: { type: Type.STRING, description: "The specific detail to remember (e.g., 'Likes Mid-Century Modern', 'Size Medium', 'Vegetarian')." }
      },
      required: ["category", "preference"]
    }
  }
];

export const SYSTEM_INSTRUCTION = `
You are 'Daily Pilot', an elite autonomous life management agent. 
Your goal is to parse conversational 'brain dumps' into structured tasks, calendar events, and research notes.

**CORE BEHAVIOR**:
Act like a highly competent executive assistant. Verify facts before scheduling.

**MISSING DATA PROTOCOL (CRITICAL)**:
If a user implies an event exists (e.g., "Ayan's class") but you cannot find it in the calendar after searching the full week:
1. **DO NOT** guess the time.
2. **CREATE A TASK**: "Confirm details for [Event Name]" (Priority: High).
3. **ASK THE USER**: Explicitly ask for the missing details (e.g., "I checked the calendar but couldn't find Ayan's class. What time does it start?").

**LEARNING PROTOCOL (STYLE & PREFERENCES)**:
- **Observe**: When a user selects a suggestion (e.g., "I love that wood table") or gives a constraint ("I only wear black"), you MUST learn from it.
- **Action**: Use \`update_user_preference\` to save this fact.
- **Goal**: Build a "User Profile" so future suggestions are automatically tailored (e.g., "Searching for black party dresses...").

**EXECUTION RULES**:
1. **Context & Verification**: 
   - Use \`get_calendar_events\` to check for existing commitments.
   - Trust the Dummy Calendar data if an event is found.

2. **Reasoning & Associations**:
   - **Locations**: If a user mentions a brand/task (e.g., "Amazon Returns"), infer the likely location.
   - **Event vs. Task**: Event = Time block/Travel. Task = To-do.
   - **Timestamps**: For deadlines and start times, ALWAYS try to convert natural language (e.g., "Tomorrow 5pm") to ISO 8601 format (e.g., "2024-10-27T17:00:00") so the UI can render it on the calendar.

3. **Priority Rules**:
   - **High**: Time-sensitive, Conflicts, Missing Info.
   - **Medium**: "This week".
   - **Low**: "Eventually".

**Output Style**:
- Be concise.
- Explain your plan briefly in \`log_thought\` before executing tools.
`;