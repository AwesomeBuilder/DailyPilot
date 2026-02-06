import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import type { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } from '@google/genai';
import { google, calendar_v3, tasks_v1 } from 'googleapis';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from '../types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const FileStore = FileStoreFactory(session);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set up service account credentials
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '../service-account.json');

const PROJECT_ID = 'gen-lang-client-0616796979';
const LOCATION_REGIONAL = 'us-central1';  // For Live API (doesn't support global)
const LOCATION_GLOBAL = 'global';          // For Gemini 3 models (requires global)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LIVE_MODEL_VERTEX = process.env.GEMINI_LIVE_MODEL_VERTEX || 'gemini-live-2.5-flash-native-audio';
const LIVE_MODEL_PUBLIC = process.env.GEMINI_LIVE_MODEL_PUBLIC || 'gemini-2.5-flash-native-audio-preview-12-2025';

// Initialize Vertex AI client for Live API (regional endpoint)
const aiLive = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION_REGIONAL,
});
const aiLivePublic = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

// Initialize Vertex AI client for Text Generation (global endpoint for Gemini 3)
const aiText = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION_GLOBAL,
});

// OAuth2 Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_to_a_random_32_char_string';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// OAuth2 scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/tasks',
];

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Extend session data type
declare module 'express-session' {
  interface SessionData {
    tokens?: {
      access_token: string;
      refresh_token?: string;
      expiry_date?: number;
    };
  }
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Session middleware with file-based storage for persistence across server restarts
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, '../.sessions'),
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    retries: 0,
    logFn: () => {}, // Suppress verbose logs
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  }
}));

// CORS for development - updated to allow credentials
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper: Get authenticated OAuth2 client for a session
async function getAuthenticatedClient(req: express.Request): Promise<typeof oauth2Client | null> {
  const tokens = req.session.tokens;
  if (!tokens) return null;

  oauth2Client.setCredentials(tokens);

  // Check if token is expired and refresh if needed
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      req.session.tokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date || undefined,
      };
      oauth2Client.setCredentials(req.session.tokens);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return oauth2Client;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: PROJECT_ID,
    locationLive: LOCATION_REGIONAL,
    locationText: LOCATION_GLOBAL,
    liveModelVertex: LIVE_MODEL_VERTEX,
    liveModelPublic: LIVE_MODEL_PUBLIC,
    publicApiEnabled: Boolean(GEMINI_API_KEY),
  });
});

// ==================== OAuth Endpoints ====================

// GET /api/auth/url - Generate Google OAuth URL
app.get('/api/auth/url', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });
  res.json({ url: authUrl });
});

// GET /api/auth/callback - Handle OAuth redirect
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?auth_error=no_code`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    req.session.tokens = {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
    };

    res.redirect(`${FRONTEND_URL}?auth_success=true`);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/auth/status - Check if authenticated
app.get('/api/auth/status', async (req, res) => {
  const client = await getAuthenticatedClient(req);

  if (!client) {
    return res.json({ authenticated: false });
  }

  res.json({ authenticated: true });
});

// POST /api/auth/logout - Clear session
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ==================== Calendar API Endpoints ====================

// Helper: Parse temporal queries into date ranges
function parseTemporalQuery(query: string): { timeMin: Date; timeMax: Date; isTemporalQuery: boolean } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

  const lowerQuery = query.toLowerCase().trim();

  // Today
  if (lowerQuery === 'today' || lowerQuery === 'today\'s' || lowerQuery.includes('today')) {
    return { timeMin: today, timeMax: tomorrow, isTemporalQuery: true };
  }

  // Tomorrow
  if (lowerQuery === 'tomorrow' || lowerQuery === 'tomorrow\'s' || lowerQuery.includes('tomorrow')) {
    return { timeMin: tomorrow, timeMax: dayAfterTomorrow, isTemporalQuery: true };
  }

  // This week
  if (lowerQuery === 'this week' || lowerQuery.includes('this week')) {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay())); // Sunday
    return { timeMin: today, timeMax: endOfWeek, isTemporalQuery: true };
  }

  // Next week
  if (lowerQuery === 'next week' || lowerQuery.includes('next week')) {
    const startOfNextWeek = new Date(today);
    startOfNextWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfNextWeek = new Date(startOfNextWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { timeMin: startOfNextWeek, timeMax: endOfNextWeek, isTemporalQuery: true };
  }

  // Next N days (e.g., "next 3 days", "next 7 days")
  const nextDaysMatch = lowerQuery.match(/next\s+(\d+)\s+days?/);
  if (nextDaysMatch) {
    const days = parseInt(nextDaysMatch[1], 10);
    return { timeMin: today, timeMax: new Date(today.getTime() + days * 24 * 60 * 60 * 1000), isTemporalQuery: true };
  }

  // Specific day of week (e.g., "monday", "on tuesday")
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    if (lowerQuery === daysOfWeek[i] || lowerQuery === `on ${daysOfWeek[i]}`) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Next occurrence
      const targetDate = new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      const dayAfter = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
      return { timeMin: targetDate, timeMax: dayAfter, isTemporalQuery: true };
    }
  }

  // Not a temporal query
  return { timeMin: now, timeMax: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), isTemporalQuery: false };
}

// GET /api/calendar/events - List/search events
app.get('/api/calendar/events', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { query, timeMin: queryTimeMin, timeMax: queryTimeMax } = req.query;

    // Parse the query to detect temporal terms
    const queryStr = (query as string) || '';
    const { timeMin: parsedTimeMin, timeMax: parsedTimeMax, isTemporalQuery } = parseTemporalQuery(queryStr);

    // Use parsed temporal range if detected, otherwise use provided params or defaults
    const now = new Date();
    const defaultTimeMin = now.toISOString();
    const defaultTimeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const effectiveTimeMin = isTemporalQuery ? parsedTimeMin.toISOString() : ((queryTimeMin as string) || defaultTimeMin);
    const effectiveTimeMax = isTemporalQuery ? parsedTimeMax.toISOString() : ((queryTimeMax as string) || defaultTimeMax);

    // Only use q parameter for non-temporal content searches
    const textSearchQuery = isTemporalQuery ? undefined : (queryStr || undefined);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: effectiveTimeMin,
      timeMax: effectiveTimeMax,
      singleEvents: true,
      orderBy: 'startTime',
      q: textSearchQuery,
      maxResults: 50,
    });

    // Transform to Daily Pilot format
    const events = (response.data.items || []).map((event: calendar_v3.Schema$Event) => ({
      id: event.id,
      title: event.summary || 'Untitled',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date || '',
      duration: calculateDuration(event.start, event.end),
      location: event.location || '',
    }));

    res.json({ events });
  } catch (error: any) {
    console.error('Calendar list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/calendar/events - Create new event
app.post('/api/calendar/events', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { title, description, start, duration, location } = req.body;

    // Parse duration to calculate end time
    const startDate = new Date(start);
    const durationMins = parseDuration(duration);
    const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description: description || '',
        location: location || '',
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    });

    res.json({
      success: true,
      event: {
        id: response.data.id,
        title: response.data.summary,
        description: response.data.description,
        start: response.data.start?.dateTime,
        duration: duration,
        location: response.data.location,
      },
    });
  } catch (error: any) {
    console.error('Calendar create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Tasks API Endpoints ====================

// GET /api/tasks/lists - List task lists
app.get('/api/tasks/lists', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const tasksApi = google.tasks({ version: 'v1', auth: client });

    const response = await tasksApi.tasklists.list({
      maxResults: 20,
    });

    res.json({ lists: response.data.items || [] });
  } catch (error: any) {
    console.error('Task lists error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tasks/:listId - List tasks from a list
app.get('/api/tasks/:listId', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const { listId } = req.params;

    const response = await tasksApi.tasks.list({
      tasklist: listId,
      showCompleted: true,
      showHidden: false,
      maxResults: 100,
    });

    // Transform to Daily Pilot format
    const tasks = (response.data.items || []).map((task: tasks_v1.Schema$Task) => ({
      id: task.id,
      title: task.title || 'Untitled',
      description: task.notes || '',
      priority: 'Medium' as const, // Google Tasks doesn't have priority
      deadline: task.due || undefined,
      status: task.status === 'completed' ? 'completed' : 'pending',
    }));

    res.json({ tasks });
  } catch (error: any) {
    console.error('Tasks list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tasks/:listId - Create task
app.post('/api/tasks/:listId', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const { listId } = req.params;
    const { title, description, deadline } = req.body;

    // Normalize the date to prevent RangeError loops
    const normalizedDeadline = deadline ? normalizeDate(deadline) : undefined;

    const response = await tasksApi.tasks.insert({
      tasklist: listId,
      requestBody: {
        title,
        notes: description || '',
        due: normalizedDeadline,
      },
    });

    res.json({
      success: true,
      task: {
        id: response.data.id,
        title: response.data.title,
        description: response.data.notes,
        priority: 'Medium',
        deadline: response.data.due,
        status: 'pending',
      },
    });
  } catch (error: any) {
    console.error('Task create error:', error);
    // Return error to client so model gets feedback instead of looping
    res.status(500).json({
      error: error.message,
      suggestion: 'Invalid date format. Use YYYY-MM-DDTHH:mm:ss format.'
    });
  }
});

// PATCH /api/tasks/:listId/:taskId - Update task
app.patch('/api/tasks/:listId/:taskId', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const { listId, taskId } = req.params;
    const { title, description, deadline, status } = req.body;

    const response = await tasksApi.tasks.patch({
      tasklist: listId,
      task: taskId,
      requestBody: {
        title,
        notes: description,
        due: deadline ? new Date(deadline).toISOString() : undefined,
        status: status === 'completed' ? 'completed' : 'needsAction',
      },
    });

    res.json({
      success: true,
      task: {
        id: response.data.id,
        title: response.data.title,
        description: response.data.notes,
        priority: 'Medium',
        deadline: response.data.due,
        status: response.data.status === 'completed' ? 'completed' : 'pending',
      },
    });
  } catch (error: any) {
    console.error('Task update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tasks/:listId/:taskId - Delete task
app.delete('/api/tasks/:listId/:taskId', async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const { listId, taskId } = req.params;

    await tasksApi.tasks.delete({
      tasklist: listId,
      task: taskId,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Task delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Helper Functions ====================

/**
 * Normalizes dates from Gemini to prevent RangeErrors.
 * If parsing fails, it returns null instead of throwing.
 */
function normalizeDate(input: any): string | null {
  try {
    if (!input) return null;

    // 1. Try direct parsing
    let date = new Date(input);

    // 2. If Gemini sent a partial string like "2026-02-04" without time
    if (isNaN(date.getTime()) && typeof input === 'string') {
      // Append a default time if only a date was provided
      date = new Date(`${input}T12:00:00`);
    }

    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function calculateDuration(
  start: calendar_v3.Schema$EventDateTime | undefined,
  end: calendar_v3.Schema$EventDateTime | undefined
): string {
  if (!start || !end) return '0 mins';

  const startTime = new Date(start.dateTime || start.date || 0).getTime();
  const endTime = new Date(end.dateTime || end.date || 0).getTime();
  const diffMins = Math.round((endTime - startTime) / (1000 * 60));

  if (diffMins >= 60) {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours} hr ${mins} mins` : `${hours} hr`;
  }
  return `${diffMins} mins`;
}

function parseDuration(duration: string): number {
  // Parse duration strings like "30 mins", "1 hour", "1.5 hours", "90 minutes"
  const lowerDuration = duration.toLowerCase();

  // Try hours first
  const hourMatch = lowerDuration.match(/(\d+\.?\d*)\s*(?:hour|hr|h)/);
  if (hourMatch) {
    return parseFloat(hourMatch[1]) * 60;
  }

  // Try minutes
  const minMatch = lowerDuration.match(/(\d+)\s*(?:min|m)/);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  // Default to 30 minutes
  return 30;
}

// ==================== Text Generation Endpoint ====================

// Text generation endpoint (for textAgent)
app.post('/api/generate', async (req, res) => {
  try {
    const { contents, config } = req.body;

    const response = await aiText.models.generateContent({
      model: 'gemini-3-flash-preview',
      config: {
        ...config,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOLS_DECLARATION }],
      },
      contents,
    });

    res.json({
      candidates: response.candidates,
      functionCalls: response.functionCalls,
    });
  } catch (error: any) {
    console.error('Generate error:', error);
    res.status(500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for Live API
const wss = new WebSocketServer({ server, path: '/api/live' });

wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '', `http://${host}`);
  const providerParam = url.searchParams.get('provider');
  const provider: 'vertex' | 'public' = providerParam === 'public' ? 'public' : 'vertex';
  const liveModel = provider === 'public' ? LIVE_MODEL_PUBLIC : LIVE_MODEL_VERTEX;
  const liveClient = provider === 'public' ? aiLivePublic : aiLive;

  console.log(`Client connected to Live API proxy (provider=${provider}, model=${liveModel})`);

  if (provider === 'public' && !liveClient) {
    const errorMessage = 'Public Gemini API is not configured (missing GEMINI_API_KEY).';
    console.error(errorMessage);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', error: errorMessage }));
    }
    clientWs.close();
    return;
  }

  let geminiSession: any = null;

  // === LOOP PREVENTION STATE ===
  const DEDUP_WINDOW_MS = 10000; // 10 second dedup window (increased)
  const MAX_PENDING_TOOL_MS = 30000; // 30s max wait for tool responses

  // Track pending tool calls by args hash to deduplicate Gemini's duplicate requests
  const pendingToolCalls = new Map<string, {
    originalId: string;           // Internal tracking ID (generated)
    geminiId: string | undefined; // Original ID from Gemini (preserve for response)
    duplicateIds: string[];       // Internal IDs of duplicates
    duplicateGeminiIds: (string | undefined)[]; // Original Gemini IDs of duplicates
    name: string;                 // Tool name
    timestamp: number;
    result?: any;
    responded: boolean;           // Whether we've already sent a response
  }>();

  // Track recent action tool calls for semantic dedup (prevents "add task X" twice)
  const recentActions = new Map<string, number>(); // actionKey -> timestamp
  const ACTION_DEDUP_WINDOW_MS = 15000; // 15 seconds for action dedup

  // Track recent audio transcriptions to deduplicate similar responses
  const recentTranscriptions: { text: string; timestamp: number }[] = [];
  const TRANSCRIPTION_DEDUP_WINDOW_MS = 5000; // 5 second window
  const TRANSCRIPTION_SIMILARITY_THRESHOLD = 0.7; // 70% similar = duplicate

  // Simple similarity check for transcriptions
  function isSimilarTranscription(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words1.length === 0 || words2.length === 0) return false;

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = [...set1].filter(w => set2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return intersection / union > TRANSCRIPTION_SIMILARITY_THRESHOLD;
  }

  // Track current transcription being built
  let currentTranscription = '';
  let lastTranscriptionTime = 0;
  let skipCurrentAudio = false; // Flag to skip audio for duplicate responses
  let lastCompletedTranscription = '';
  let lastTurnCompleteTime = 0;
  let lastActivityState: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';
  let currentInputTranscript = '';
  let lastFinalInputTranscript = '';

  // Aggressive audio cooldown - skip ALL audio for X ms after a completed response
  const AUDIO_COOLDOWN_MS = 1500; // 1.5 second cooldown after each response
  let audioCooldownUntil = 0;

  // Generate unique IDs for tool calls with undefined IDs (internal tracking only)
  let toolIdCounter = 0;
  let missingToolIdCount = 0;

  function emitActivity(state: 'idle' | 'listening' | 'thinking' | 'speaking') {
    if (state === lastActivityState) return;
    lastActivityState = state;
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'activity', state }));
    }
  }

  // Create a stable hash for tool args (handles property order and case differences)
  function stableArgsHash(name: string, args: any): string {
    if (!args || typeof args !== 'object') {
      return `${name}:${String(args)}`;
    }
    // Sort keys and lowercase string values for stable comparison
    const sortedKeys = Object.keys(args).sort();
    const normalized: Record<string, any> = {};
    for (const key of sortedKeys) {
      const val = args[key];
      normalized[key] = typeof val === 'string' ? val.toLowerCase().trim() : val;
    }
    return `${name}:${JSON.stringify(normalized)}`;
  }

  // Create a simplified key for action tools (for semantic dedup)
  // This catches "add_task: Grocery Run" even if other args differ
  function actionKey(name: string, args: any): string | null {
    const actionTools = ['add_task', 'add_event', 'draft_message', 'delete_task', 'delete_event', 'save_suggestion', 'report_alert'];
    if (!actionTools.includes(name)) return null;

    // Use the most identifying field for each tool
    if (name === 'add_task' || name === 'add_event') {
      return `${name}:${(args?.title || '').toLowerCase().substring(0, 30)}`;
    }
    if (name === 'draft_message') {
      return `${name}:${(args?.recipient || '').toLowerCase()}:${(args?.platform || '').toLowerCase()}`;
    }
    if (name === 'delete_task') {
      return `${name}:${args?.taskId || ''}`;
    }
    if (name === 'delete_event') {
      return `${name}:${args?.eventId || ''}`;
    }
    if (name === 'save_suggestion') {
      return `${name}:${(args?.title || '').toLowerCase().substring(0, 30)}`;
    }
    if (name === 'report_alert') {
      return `${name}:${(args?.message || '').toLowerCase().substring(0, 50)}`;
    }
    return null;
  }

  try {
    // Connect to Gemini Live API via Vertex AI
    geminiSession = await liveClient!.live.connect({
      model: liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        // Temperature 1.0 is CRITICAL - values below cause loops in Gemini 2.5
        temperature: 1.0,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOLS_DECLARATION }],
        // Enable transcription to debug what model hears and says
        inputAudioTranscription: {},  // What the model hears from user
        outputAudioTranscription: {}, // What the model says
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            // MEDIUM sensitivity for better speech detection (LOW was causing missed responses)
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_MEDIUM,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_MEDIUM,
            prefixPaddingMs: 200,  // More padding to capture speech start
            silenceDurationMs: 1000,  // Shorter silence threshold for faster response
          }
        },
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini Live session opened');
          clientWs.send(JSON.stringify({ type: 'connected' }));
        },
        onmessage: (message: any) => {
          const now = Date.now();

          // Clean up old pending entries
          for (const [key, entry] of pendingToolCalls) {
            if (entry.responded && now - entry.timestamp > DEDUP_WINDOW_MS) {
              pendingToolCalls.delete(key);
            }
            if (!entry.responded && now - entry.timestamp > MAX_PENDING_TOOL_MS) {
              console.warn(`[TOOL-TIMEOUT] No response for ${entry.name} after ${MAX_PENDING_TOOL_MS}ms (geminiId: ${entry.geminiId})`);
              const timeoutResponse = {
                functionResponses: [{
                  id: entry.geminiId,
                  name: entry.name,
                  response: { error: `Tool "${entry.name}" timed out after ${MAX_PENDING_TOOL_MS}ms` }
                }]
              };
              if (entry.geminiId !== undefined) {
                geminiSession.sendToolResponse(timeoutResponse)
                  .catch((e: any) => console.error('[TOOL-TIMEOUT] Failed sending timeout response:', e));
              }
              // Also respond to any duplicates still waiting
              for (const dupGeminiId of entry.duplicateGeminiIds) {
                if (dupGeminiId === undefined) continue;
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    id: dupGeminiId,
                    name: entry.name,
                    response: { error: `Tool "${entry.name}" timed out after ${MAX_PENDING_TOOL_MS}ms` }
                  }]
                }).catch((e: any) => console.error('[TOOL-TIMEOUT] Failed sending timeout response to duplicate:', e));
              }
              pendingToolCalls.delete(key);
            }
          }

          // Handle tool calls from Gemini - DEDUPLICATE before forwarding
          if (message.toolCall) {
            emitActivity('thinking');
            const calls = message.toolCall.functionCalls || [];
            // Debug: log full structure to understand ID field
            console.log(`[GEMINI→] Raw toolCall:`, JSON.stringify(message.toolCall, null, 2));
            console.log(`[GEMINI→] Tool calls received: ${calls.map((c: any) => `${c.name}(id:${c.id})`).join(', ')}`);
            console.log(`[DEBUG] Current pending keys: [${Array.from(pendingToolCalls.keys()).join(', ')}]`);

            // Clean up old action dedup entries
            for (const [key, timestamp] of recentActions) {
              if (now - timestamp > ACTION_DEDUP_WINDOW_MS) {
                recentActions.delete(key);
              }
            }

            const uniqueCalls: any[] = [];

            for (const fc of calls) {
              // SPECIAL HANDLING: log_thought is handled server-side only (no client roundtrip)
              // This prevents multiple response cycles from log_thought calls
              if (fc.name === 'log_thought') {
                const thought = fc.args?.thought || '';
                const thoughtType = fc.args?.type || 'reasoning';
                console.log(`[LOG_THOUGHT] ${thoughtType}: ${thought.substring(0, 100)}...`);

                // Forward thought to client for UI display (but don't wait for response)
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'thought',
                    data: { thought, type: thoughtType }
                  }));
                }

                // Immediately respond to Gemini (no client roundtrip needed)
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    id: fc.id,
                    name: fc.name,
                    response: { result: { success: true } }
                  }]
                });
                continue;
              }

              if (fc.id === undefined || fc.id === null) {
                missingToolIdCount += 1;
                console.error(`[TOOL-ID] Missing tool call id for ${fc.name}. Count=${missingToolIdCount} (provider=${provider})`);
                if (clientWs.readyState === WebSocket.OPEN) {
                  const fallbackText = (lastFinalInputTranscript || currentInputTranscript).trim();
                  clientWs.send(JSON.stringify({
                    type: 'error',
                    error: `Gemini tool call missing id for ${fc.name} (provider=${provider}). Resetting session to prevent loop. Please try again or switch providers.`
                  }));
                  if (fallbackText) {
                    clientWs.send(JSON.stringify({
                      type: 'fallback_text',
                      text: fallbackText
                    }));
                    lastFinalInputTranscript = '';
                    currentInputTranscript = '';
                  }
                }
                return;
              }
              // Preserve original Gemini ID (may be undefined)
              const geminiId = fc.id;
              // Generate internal tracking ID
              const internalId = `server-${++toolIdCounter}-${now}`;

              // Create stable dedup key (handles property order and case differences)
              const dedupKey = stableArgsHash(fc.name, fc.args || {});
              console.log(`[DEBUG] Checking dedupKey: ${dedupKey.substring(0, 100)}...`);

              // Check for exact duplicate (same args)
              const existingEntry = pendingToolCalls.get(dedupKey);
              if (existingEntry) {
                // This is an exact duplicate - track it and send immediate response
                existingEntry.duplicateIds.push(internalId);
                existingEntry.duplicateGeminiIds.push(geminiId);
                console.log(`[SERVER-DEDUP] Exact duplicate detected: ${fc.name} (geminiId: ${geminiId})`);

                // If we have a cached result, respond immediately so Gemini doesn't hang
                if (existingEntry.result !== undefined) {
                  console.log(`[SERVER-DEDUP] Sending cached response for duplicate: ${fc.name} (geminiId: ${geminiId})`);
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      id: geminiId,
                      name: fc.name,
                      response: { result: existingEntry.result }
                    }]
                  });
                }
                continue;
              }

              // Check for semantic duplicate (same action, different args)
              const aKey = actionKey(fc.name, fc.args);
              if (aKey && recentActions.has(aKey)) {
                console.log(`[SERVER-DEDUP] Semantic duplicate detected: ${fc.name} - "${aKey}" was recently executed`);
                // Send success response but don't execute
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    id: geminiId,
                    name: fc.name,
                    response: { result: { success: true, note: 'Already processed similar request' } }
                  }]
                });
                continue;
              }

              // New unique call - track it and forward to client
              fc.id = internalId;  // Client uses internal ID
              pendingToolCalls.set(dedupKey, {
                originalId: internalId,
                geminiId: geminiId,
                duplicateIds: [],
                duplicateGeminiIds: [],
                name: fc.name,
                timestamp: now,
                responded: false,
              });

              // Track action for semantic dedup
              if (aKey) {
                recentActions.set(aKey, now);
              }

              uniqueCalls.push(fc);
              console.log(`[DEBUG] Added new pending: ${fc.name} (geminiId: ${geminiId}, internalId: ${internalId})`);
            }

            // Only forward unique calls to client
            if (uniqueCalls.length > 0) {
              const dedupedMessage = {
                ...message,
                toolCall: { functionCalls: uniqueCalls }
              };
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'message', data: dedupedMessage }));
              }
            }
            return; // Don't forward the original message
          }

          // Log when model generates audio
          if (message.serverContent?.modelTurn?.parts?.some((p: any) => p.inlineData)) {
            emitActivity('speaking');
            // Check audio cooldown first (aggressive duplicate prevention)
            if (now < audioCooldownUntil) {
              if (!skipCurrentAudio) {
                console.log('[AUDIO-COOLDOWN] Skipping audio - in cooldown period');
                skipCurrentAudio = true;
              }
              return;
            }

            // Check if this is the start of a new turn after a recent turn complete
            // If the transcription starts similar to the last one, skip this audio
            if (now - lastTurnCompleteTime < 2000 && lastCompletedTranscription.length > 20) {
              // Quick check: are we likely seeing a duplicate response?
              const currentStart = currentTranscription.toLowerCase().substring(0, 30);
              const lastStart = lastCompletedTranscription.toLowerCase().substring(0, 30);
              if (currentStart.length > 10 && isSimilarTranscription(currentStart, lastStart)) {
                if (!skipCurrentAudio) {
                  console.log('[AUDIO-DEDUP] Detected duplicate response starting, will skip audio');
                  skipCurrentAudio = true;
                }
              }
            }

            if (skipCurrentAudio) {
              // Don't forward audio for duplicate responses
              return;
            }
            console.log('[GEMINI→] Audio chunk received');
            // DON'T clear dedup state here - model sometimes calls tools AFTER audio
            // Dedup state is cleared by time-based cleanup at start of onmessage
          }

          // Log output transcription and track for dedup
          if (message.serverContent?.outputTranscription?.text) {
            const transcriptText = message.serverContent.outputTranscription.text;
            console.log('[GEMINI→] Output transcription:', transcriptText);

            // Accumulate transcription
            currentTranscription += transcriptText;
            lastTranscriptionTime = now;
          }

          // Log input transcription (helps debug what model heard from user)
          if (message.serverContent?.inputTranscription?.text) {
            const inputText = message.serverContent.inputTranscription.text as string;
            console.log('[GEMINI→] Input transcription (user said):', inputText);
            emitActivity('listening');
            currentInputTranscript += inputText;
            if (message.serverContent.inputTranscription.finished) {
              lastFinalInputTranscript = currentInputTranscript.trim();
              currentInputTranscript = '';
              console.log('[TRANSCRIPT] Final input transcript cached');
            }
            // Reset ALL audio tracking on new user input - they asked something new
            currentTranscription = '';
            lastCompletedTranscription = '';
            skipCurrentAudio = false;
            audioCooldownUntil = 0; // Clear cooldown for new input
          }

          // Log turn completion signals and check for duplicate responses
          if (message.serverContent?.turnComplete) {
            console.log('[GEMINI→] Turn complete' + (skipCurrentAudio ? ' (audio was skipped - duplicate)' : ''));
            emitActivity('idle');

            if (skipCurrentAudio) {
              // This turn was a duplicate, reset and skip forwarding
              skipCurrentAudio = false;
              currentTranscription = '';
              return; // Don't forward turn complete for skipped audio
            }

            // Save this transcription for future duplicate detection
            if (currentTranscription.length > 20) {
              lastCompletedTranscription = currentTranscription;
              lastTurnCompleteTime = now;
              // Set audio cooldown to prevent immediate duplicate responses
              audioCooldownUntil = now + AUDIO_COOLDOWN_MS;
              console.log(`[AUDIO-COOLDOWN] Set cooldown for ${AUDIO_COOLDOWN_MS}ms`);
            }
            currentTranscription = '';

            if (currentInputTranscript.trim().length > 0 && !lastFinalInputTranscript) {
              lastFinalInputTranscript = currentInputTranscript.trim();
              currentInputTranscript = '';
              console.log('[TRANSCRIPT] Cached input transcript on turnComplete');
            }
          }

          // Log if generation was interrupted
          if (message.serverContent?.interrupted) {
            console.log('[GEMINI→] Generation interrupted by user');
          }

          // Extract and log reasoning thoughts for transparency
          const parts = message.serverContent?.modelTurn?.parts || [];
          for (const part of parts) {
            if (part.thought) {
              console.log('--- REASONING ---', part.text);
            }
          }

          // Forward Gemini messages to client (non-tool-call messages)
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'message', data: message }));
          }
        },
        onclose: (event: any) => {
          console.log('Gemini session closed', event);
          emitActivity('idle');
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'closed' }));
            clientWs.close();
          }
        },
        onerror: (error: any) => {
          console.error('Gemini session error:', error);
          emitActivity('idle');
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: error.message }));
          }
        }
      }
    });

  } catch (error: any) {
    console.error('Failed to connect to Gemini Live:', error);
    emitActivity('idle');
    clientWs.send(JSON.stringify({ type: 'error', error: error.message }));
    clientWs.close();
    return;
  }

  // Handle messages from client
  clientWs.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'audio') {
        // Send audio to Gemini (log periodically to avoid spam)
        const audioSize = message.data?.length || 0;
        if (Math.random() < 0.05) { // Log ~5% of audio chunks
          console.log(`[→GEMINI] Audio chunk (${audioSize} bytes)`);
        }
        await geminiSession.sendRealtimeInput({
          media: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000',
          }
        });
      } else if (message.type === 'toolResponse') {
        const responses = message.responses || [];

        // Cache results and respond to any pending duplicates
        // Also rewrite responses to use original Gemini IDs
        const geminiResponses: any[] = [];

        for (const r of responses) {
          // Find and update the pending entry with result
          for (const [key, entry] of pendingToolCalls) {
            if (entry.originalId === r.id) {
              // Skip if already responded (prevents duplicate responses)
              if (entry.responded) {
                console.log(`[SERVER] Skipping already-responded entry: ${entry.name}`);
                break;
              }

              entry.result = r.response?.result;
              entry.responded = true;

              // Respond to any duplicates that arrived before we had the result
              for (let i = 0; i < entry.duplicateGeminiIds.length; i++) {
                const dupGeminiId = entry.duplicateGeminiIds[i];
                console.log(`[SERVER] Sending response for duplicate: ${entry.name} (geminiId: ${dupGeminiId})`);
                await geminiSession.sendToolResponse({
                  functionResponses: [{
                    id: dupGeminiId,
                    name: entry.name,
                    response: r.response
                  }]
                });
              }
              // Clear duplicates after responding
              entry.duplicateIds = [];
              entry.duplicateGeminiIds = [];

              // Build response with original Gemini ID
              geminiResponses.push({
                id: entry.geminiId,
                name: entry.name,
                response: r.response
              });
              break;
            }
          }
        }

        // DON'T delete entries - keep them for dedup window
        // They'll be cleaned up by the time-based cleanup in onmessage

        // Send the original responses with Gemini IDs
        if (geminiResponses.length > 0) {
          console.log(`[→GEMINI] Sending ${geminiResponses.length} tool response(s): ${geminiResponses.map((r: any) => `${r.name}(geminiId:${r.id})`).join(', ')}`);
          try {
            await geminiSession.sendToolResponse({
              functionResponses: geminiResponses
            });
            console.log(`[→GEMINI] Tool response sent successfully`);
          } catch (sendError) {
            console.error('[→GEMINI] Error sending tool response:', sendError);
          }
        } else {
          console.log(`[DEBUG] No matching pending entries found for tool responses`);
        }
      }
    } catch (error) {
      console.error('Error processing client message:', error);
    }
  });

  clientWs.on('close', () => {
    console.log('Client disconnected');
    if (geminiSession) {
      try {
        geminiSession.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  });

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Vertex AI proxy server running on port ${PORT}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Location (Live API): ${LOCATION_REGIONAL}`);
  console.log(`Location (Text/Gemini 3): ${LOCATION_GLOBAL}`);
  console.log(`OAuth configured: ${GOOGLE_CLIENT_ID ? 'Yes' : 'No (set GOOGLE_CLIENT_ID)'}`);
});
