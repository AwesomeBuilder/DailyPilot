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

export interface SuggestionItem {
  text: string;           // Display name (e.g., "Feta Cheese")
  url?: string;           // Optional custom URL from agent
  linkType?: 'google_search' | 'google_maps' | 'store' | 'app' | 'website';
}

export interface Suggestion {
  id: string;
  title: string;
  category: 'Restaurant' | 'Research' | 'Shopping' | 'Other';
  items: (SuggestionItem | string)[];  // Support both structured and legacy string items
}

export interface MessageDraft {
  id: string;
  recipient: string;
  platform: 'Text' | 'Email' | 'Slack';
  reason: string;
  content: string;
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
        deadline: { type: Type.STRING, description: "Optional deadline. PREFER Local ISO 8601 format (e.g. '2023-10-27T17:00:00') if a specific time is mentioned, otherwise natural language (e.g. 'Friday')." }
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
        start: { type: Type.STRING, description: "Start time/date (Local ISO 8601 REQUIRED e.g. 2024-01-01T10:00:00). DO NOT use UTC (Z)." },
        duration: { type: Type.STRING, description: "Duration (e.g., '30 mins')." },
        location: { type: Type.STRING, description: "Location or context." }
      },
      required: ["title", "start", "duration"]
    }
  },
  {
    name: "delete_event",
    description: "Delete an event from the user's calendar. Use this to remove events you scheduled by mistake or that the user wants cancelled.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: { type: Type.STRING, description: "The ID of the event to delete (from get_calendar_events or add_event response)." },
        reason: { type: Type.STRING, description: "Brief reason for deletion (for logging)." }
      },
      required: ["eventId"]
    }
  },
  {
    name: "delete_task",
    description: "Delete a task from the user's todo list. Use this to remove tasks the user wants removed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskId: { type: Type.STRING, description: "The ID of the task to delete (from add_task response)." },
        reason: { type: Type.STRING, description: "Brief reason for deletion (for logging)." }
      },
      required: ["taskId"]
    }
  },
  {
    name: "save_suggestion",
    description: "Save a list of suggestions or research findings. Provide intelligent links based on item context and user preferences.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Title of the suggestion list." },
        category: { type: Type.STRING, enum: ["Restaurant", "Research", "Shopping", "Other"] },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: "Item name/display text" },
              url: { type: Type.STRING, description: "Full URL. Required for actionable items. Use user preferences to choose appropriate stores/platforms." },
              linkType: { type: Type.STRING, enum: ["google_search", "google_maps", "store", "app", "website"], description: "Type of link for UI hints" }
            },
            required: ["text"]
          },
          description: "List of items with optional intelligent URLs."
        }
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
  },
  {
    name: "draft_message",
    description: "Draft a communication (Text/Email/Slack) for the user to send when a conflict is found or external action is needed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient: { type: Type.STRING, description: "Name of the person to contact." },
        platform: { type: Type.STRING, enum: ["Text", "Email", "Slack"], description: "The best channel based on context." },
        reason: { type: Type.STRING, description: "Brief explanation of the conflict or need." },
        content: { type: Type.STRING, description: "The actual written draft of the message." }
      },
      required: ["recipient", "platform", "reason", "content"]
    }
  }
];

export const SYSTEM_INSTRUCTION = `
You are Daily Pilot, a friendly life management assistant. Help users organize tasks, events, and plans through natural conversation.

CORE BEHAVIOR:
- Listen to user requests and respond naturally with your voice
- Use tools to take actions (create tasks, check calendar, schedule events)
- After using tools, briefly confirm what you did in a conversational way
- Keep responses concise and friendly

TOOL USAGE:
- log_thought: Use briefly to note your reasoning before actions
- get_calendar_events: Check for existing events or conflicts
- add_task: Create todos (High = urgent, Medium = this week, Low = eventually)
- add_event: Schedule calendar events
- delete_task / delete_event: Remove items when asked
- save_suggestion: Save research lists with URLs (use Google Maps for places, Amazon for products)
- draft_message: Draft communications
- update_user_preference: Remember user preferences
- report_alert: Notify about conflicts

DATE FORMAT: Use local ISO format like 2026-02-04T17:00:00 (no Z suffix). Current year is 2026.

CONFLICT HANDLING: If scheduling conflicts exist, mention them and ask how to proceed.

Be helpful, be brief, be conversational.
`;