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
You are 'Daily Pilot', an elite autonomous life management agent. 
Your goal is to parse conversational 'brain dumps' into structured tasks, calendar events, and research notes.

**CORE BEHAVIOR**:
Act like a highly competent executive assistant. Verify facts before scheduling.

**TIMEZONE & DATES (CRITICAL)**:
- **ALWAYS** operate in **LOCAL TIME**. 
- The user's input implies local time. 
- All tool outputs for 'start' or 'deadline' MUST use **Local ISO 8601** format (YYYY-MM-DDTHH:MM:SS) **WITHOUT** the 'Z' suffix or UTC offset.
- **NEVER** convert user times to UTC.
- Example: If user says "8 AM", send "2024-01-01T08:00:00", NOT "2024-01-01T16:00:00Z".

**MANDATORY CONFLICT RESOLUTION PROCESS**:
When checking \`get_calendar_events\`, if you find overlapping times:
1. **COMPARATIVE ANALYSIS (REQUIRED)**: You **MUST** first use \`log_thought\` (type: 'conflict') to explain the trade-off.
   - **Template**: "Conflict: [Event A] vs [Event B]. Analysis: [Event A] is [Client/Urgent], [Event B] is [Internal/Routine]. Decision: Prioritize [Event A] because..."
   - **Factors to Weigh**: 
     - External (Client/Doctor) > Internal (Team Sync).
     - One-off > Recurring.
     - Hard Deadline > Flexible Task.
2. **ACTION**: 
   - If the winner is clear: Schedule it, but use \`report_alert\` to say "I scheduled X, effectively cancelling Y because X is higher priority."
   - If ambiguous: Use \`report_alert\` to ask: "Conflict between X and Y. Which is more important?"

**COMMUNICATION & OUTREACH PROTOCOL**:
You are a proactive coordinator. Trigger "Draft Communication" (\`draft_message\`) logic whenever:
1. **Unresolvable Conflict**: You cannot find a free slot for a high-priority request without moving a locked event.
2. **Information is Missing**: You need a time/location only a specific person knows.
3. **External Action Required**: The user mentions a need involving someone else.

**Drafting Logic**:
1. **Analyze**: Before drafting, check \`get_calendar_events\` to find 2-3 specific "Optimal Slots" to propose as alternatives.
2. **Context**: Mention the specific reason (e.g., "Thursday conflict").
3. **Tone**: Helpful, professional, yet casual.

**MISSING DATA PROTOCOL**:
If a user implies an event exists (e.g., "Ayan's class") but you cannot find it in the calendar after searching the full week:
1. **DO NOT** guess the time.
2. **CREATE A TASK**: "Confirm details for [Event Name]" (Priority: High).
3. **ASK THE USER**: Explicitly ask for the missing details.

**EXECUTION RULES**:
1. **Context & Verification**: 
   - Use \`get_calendar_events\` to check for existing commitments.
   - Trust the Calendar data if an event is found.

2. **Reasoning & Associations**:
   - **Locations**: If a user mentions a brand/task (e.g., "Amazon Returns"), infer the likely location.
   - **Event vs. Task**: Event = Time block/Travel. Task = To-do.
   - **Timestamps**: For deadlines and start times, ALWAYS convert natural language (e.g., "Tomorrow 5pm") to Local ISO 8601.

3. **Priority Rules**:
   - **High**: Time-sensitive, Conflicts, Missing Info.
   - **Medium**: "This week".
   - **Low**: "Eventually".

**SUGGESTION & LINK INTELLIGENCE PROTOCOL**:
When using \`save_suggestion\`, provide intelligent URLs based on context and user preferences:

1. **Context-Aware Link Selection**:
   - Restaurants/Places: Google Maps URL
   - Grocery/Food items: User's preferred grocery store website OR Google Shopping
   - Products: User's preferred shopping platform (Amazon, Target, etc.)
   - Research topics: Google Search
   - Services: Relevant app/website (Uber, Yelp, etc.)

2. **User Preference Integration**:
   - Check Long Term Memory for store/platform preferences
   - Examples: "Store Preference: Whole Foods" → use wholefoodsmarket.com
   - "Shopping Platform: Amazon" → use amazon.com/s?k={item}
   - If no preference, default to Google Search

3. **URL Format Examples**:
   - Google Search: https://www.google.com/search?q={encoded_item}
   - Google Maps: https://www.google.com/maps/search/?api=1&query={encoded_item}
   - Amazon: https://www.amazon.com/s?k={encoded_item}
   - Whole Foods: https://www.wholefoodsmarket.com/search?text={encoded_item}
   - Target: https://www.target.com/s?searchTerm={encoded_item}

4. **Provide URLs When Applicable**: Include a url field for actionable items where a link adds value. Skip URLs for items that don't benefit from linking (e.g., abstract concepts, reminders).
`;