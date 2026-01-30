import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } from '@google/genai';
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from '../types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set up service account credentials
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '../service-account.json');

const PROJECT_ID = 'gen-lang-client-0616796979';
const LOCATION = 'us-central1';

// Initialize Vertex AI client
const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION,
});

const app = express();
app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: PROJECT_ID, location: LOCATION });
});

// Text generation endpoint (for textAgent)
app.post('/api/generate', async (req, res) => {
  try {
    const { contents, config } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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

  try {
    // Connect to Gemini Live API via Vertex AI
    geminiSession = await ai.live.connect({
      model: 'gemini-2.0-flash-live-preview-04-09',
      config: {
        responseModalities: [Modality.AUDIO],
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
          clientWs.send(JSON.stringify({ type: 'connected' }));
        },
        onmessage: (message: any) => {
          // Forward Gemini messages to client
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'message', data: message }));
          }
        },
        onclose: (event: any) => {
          console.log('Gemini session closed', event);
          if (clientWs.readyState === WebSocket.OPEN) {
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
        // Send tool response to Gemini
        await geminiSession.sendToolResponse({
          functionResponses: message.responses
        });
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
  console.log(`Location: ${LOCATION}`);
});
