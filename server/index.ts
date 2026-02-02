import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
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

// Initialize Vertex AI client for Live API (regional endpoint)
const aiLive = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION_REGIONAL,
});

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
  res.json({ status: 'ok', project: PROJECT_ID, locationLive: LOCATION_REGIONAL, locationText: LOCATION_GLOBAL });
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

    const response = await tasksApi.tasks.insert({
      tasklist: listId,
      requestBody: {
        title,
        notes: description || '',
        due: deadline ? new Date(deadline).toISOString() : undefined,
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
    res.status(500).json({ error: error.message });
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

// ==================== Helper Functions ====================

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

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Live API proxy');

  let geminiSession: any = null;
  let isReconnecting = false;

  // Server-side loop prevention
  const toolCallCounts = new Map<string, number>();
  const MAX_TOOL_CALLS = 3;  // Max times same tool+args can be called

  // Function to create/recreate Gemini session
  const createGeminiSession = async () => {
    return await aiLive.live.connect({
      model: 'gemini-live-2.5-flash-native-audio',
      config: {
        responseModalities: [Modality.AUDIO],
        // Temperature 1.0 is critical for Gemini 2.5 models to prevent infinite token loops
        temperature: 1.0,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOLS_DECLARATION }],
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 100,
            silenceDurationMs: 1500,
          }
        },
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini Live session opened');
          if (!isReconnecting) {
            clientWs.send(JSON.stringify({ type: 'connected' }));
          } else {
            console.log('Reconnected after loop detection');
            clientWs.send(JSON.stringify({ type: 'reconnected' }));
          }
          isReconnecting = false;
        },
        onmessage: (message: any) => {
          // Check for tool call loops
          if (message.toolCall) {
            const callKey = JSON.stringify(message.toolCall);
            const count = (toolCallCounts.get(callKey) || 0) + 1;
            toolCallCounts.set(callKey, count);

            if (count > MAX_TOOL_CALLS) {
              console.warn(`Loop detected on server: ${count} identical tool calls. Resetting session.`);
              toolCallCounts.clear();

              // Close current session and reconnect
              isReconnecting = true;
              try {
                geminiSession.close();
              } catch (e) {
                // Ignore
              }

              // Notify client and reconnect
              clientWs.send(JSON.stringify({
                type: 'loop_detected',
                message: 'Agent was stuck in a loop. Resetting session.'
              }));

              createGeminiSession().then(session => {
                geminiSession = session;
              }).catch(err => {
                console.error('Failed to reconnect:', err);
                clientWs.send(JSON.stringify({ type: 'error', error: 'Failed to reconnect after loop' }));
              });

              return; // Don't forward this message
            }

            console.log('Gemini requesting tool call:', JSON.stringify(message.toolCall, null, 2));
          }

          // Forward Gemini messages to client
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'message', data: message }));
          }
        },
        onclose: (event: any) => {
          console.log('Gemini session closed', event);
          if (clientWs.readyState === WebSocket.OPEN && !isReconnecting) {
            clientWs.send(JSON.stringify({ type: 'closed' }));
            clientWs.close();
          }
        },
        onerror: (error: any) => {
          console.error('Gemini session error:', error);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: error.message }));
          }
        }
      }
    });
  };

  try {
    // Connect to Gemini Live API via Vertex AI
    geminiSession = await createGeminiSession();
  } catch (error: any) {
    console.error('Failed to connect to Gemini Live:', error);
    clientWs.send(JSON.stringify({ type: 'error', error: error.message }));
    clientWs.close();
    return;
  }

  // Handle messages from client
  clientWs.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'audio') {
        // Send audio to Gemini
        await geminiSession.sendRealtimeInput({
          media: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000',
          }
        });
      } else if (message.type === 'toolResponse') {
        // Check for loops before sending
        const responses = message.responses || [];
        let shouldSend = true;

        for (const resp of responses) {
          const key = `${resp.name}:${JSON.stringify(resp.response?.result)}`;
          const count = (toolCallCounts.get(key) || 0) + 1;
          toolCallCounts.set(key, count);

          if (count > MAX_TOOL_CALLS) {
            console.warn(`Server loop prevention: ${resp.name} called ${count} times, NOT sending response to break loop`);
            shouldSend = false;
          }
        }

        if (shouldSend) {
          console.log('Sending tool response:', JSON.stringify(message.responses, null, 2));
          await geminiSession.sendToolResponse({
            functionResponses: message.responses
          });
        } else {
          console.log('Skipping tool response to break loop');
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
