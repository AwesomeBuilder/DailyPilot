// Types for callbacks
type ToolHandler = (name: string, args: any) => Promise<any>;
type StatusHandler = (active: boolean) => void;
type ErrorHandler = (error: string) => void;
type AudioVolumeHandler = (volume: number) => void;
type ThoughtHandler = (thought: string) => void;
type ActivityHandler = (state: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
type FallbackTextHandler = (text: string) => void;

type LiveProvider = 'vertex' | 'public';

function buildWsUrl(provider: LiveProvider) {
  const base = import.meta.env.DEV
    ? 'ws://localhost:3001/api/live'
    : `wss://${window.location.host}/api/live`;
  return `${base}?provider=${provider}`;
}

export class LiveManager {
  private ws: WebSocket | null = null;
  private manuallyDisconnecting = false;
  private provider: LiveProvider = 'vertex';

  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  // Note: Deduplication is handled server-side

  private onToolCall: ToolHandler;
  private onStatusChange: StatusHandler;
  private onError: ErrorHandler;
  private onVolume: AudioVolumeHandler;
  private onThought: ThoughtHandler;
  private onActivity: ActivityHandler;
  private onFallbackText: FallbackTextHandler;

  public isConnected = false;
  public isMicActive = false;
  private static readonly TOOL_TIMEOUT_MS = 15000;

  constructor(
    onToolCall: ToolHandler,
    onStatusChange: StatusHandler,
    onError: ErrorHandler,
    onVolume: AudioVolumeHandler,
    onThought?: ThoughtHandler,
    onActivity?: ActivityHandler,
    onFallbackText?: FallbackTextHandler
  ) {
    this.onToolCall = onToolCall;
    this.onStatusChange = onStatusChange;
    this.onError = onError;
    this.onVolume = onVolume;
    this.onThought = onThought || (() => {});
    this.onActivity = onActivity || (() => {});
    this.onFallbackText = onFallbackText || (() => {});
  }

  setProvider(provider: LiveProvider) {
    this.provider = provider;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      this.manuallyDisconnecting = false;
      console.log(`[WS] Connecting Live API (provider=${this.provider})`);

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });

      // Connect to server WebSocket
      this.ws = new WebSocket(buildWsUrl(this.provider));

      this.ws.onopen = () => {
        console.log('Connected to Live API proxy');
      };

      this.ws.onmessage = async (event) => {
        if (this.manuallyDisconnecting) return;

        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected' || msg.type === 'reconnected') {
            this.isConnected = true;
            this.onStatusChange(true);
            this.onActivity('idle');
            // Start audio immediately upon connect
            this.startAudio();
            if (msg.type === 'reconnected') {
              console.log('Session reconnected after loop detection');
            }
          } else if (msg.type === 'message') {
            await this.handleGeminiMessage(msg.data);
          } else if (msg.type === 'thought') {
            // Server-side log_thought - just update UI, no response needed
            if (msg.data?.thought) {
              console.log(`[THOUGHT] ${msg.data.type}: ${msg.data.thought}`);
              // Call the tool handler to update UI (it returns immediately)
              this.onToolCall('log_thought', {
                thought: msg.data.thought,
                type: msg.data.type || 'reasoning'
              });
            }
          } else if (msg.type === 'loop_detected') {
            console.warn('Loop detected:', msg.message);
            this.onError(msg.message);
          } else if (msg.type === 'error') {
            console.error('Server error:', msg.error);
            this.onError(msg.error);
          } else if (msg.type === 'closed') {
            this.isConnected = false;
            this.onStatusChange(false);
            this.onActivity('idle');
          } else if (msg.type === 'activity') {
            if (msg.state) this.onActivity(msg.state);
          } else if (msg.type === 'fallback_text') {
            if (msg.text) {
              console.log('[WS] Received fallback_text');
              this.onFallbackText(msg.text);
            }
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onclose = (e) => {
        this.isConnected = false;
        this.onStatusChange(false);
        this.onActivity('idle');
        if (!this.manuallyDisconnecting) {
          console.log('WebSocket closed unexpectedly', e);
          this.onError('Session disconnected.');
        }
      };

      this.ws.onerror = (err) => {
        if (this.manuallyDisconnecting) return;
        console.error('WebSocket error:', err);
        this.onError('Connection error occurred.');
      };

    } catch (err: any) {
      this.isConnected = false;
      this.onStatusChange(false);
      this.onError(err.message || 'Failed to connect to Daily Pilot.');
      this.disconnect();
    }
  }

  async startAudio() {
    if (!this.inputAudioContext) return;
    if (this.isMicActive) return;

    // Ensure context is running (it might be suspended by browser policy)
    if (this.inputAudioContext.state === 'suspended') {
      await this.inputAudioContext.resume();
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true
        }
      });

      this.inputSource = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isMicActive || this.manuallyDisconnecting) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate volume for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.onVolume(rms);

        // Convert to PCM and send to server
        const b64 = this.float32ToBase64PCM(inputData);
        this.ws.send(JSON.stringify({
          type: 'audio',
          data: b64
        }));
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);
      this.isMicActive = true;
    } catch (e: any) {
      console.error('Microphone access error:', e);
      this.onError('Microphone access denied.');
    }
  }

  stopAudio() {
    if (!this.isMicActive) return;

    // Stop tracks to release mic light
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Disconnect nodes but keep context open
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    this.isMicActive = false;
    this.onVolume(0);
  }

  private async handleGeminiMessage(message: any) {
    if (this.manuallyDisconnecting) return;

    // 0. Handle Reasoning Thoughts (from thinkingConfig)
    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.thought && part.text) {
        console.log('--- MODEL REASONING ---', part.text);
        this.onThought(part.text);
      }
    }

    // 1. Handle Tool Calls (deduplication happens server-side)
    if (message.toolCall) {
      const responses = [];

      for (const fc of message.toolCall.functionCalls) {
        try {
          console.log(`[TOOL] Executing: ${fc.name}`, fc.args);
          const { result, durationMs } = await this.runToolWithTimeout(
            fc.name,
            fc.args,
            LiveManager.TOOL_TIMEOUT_MS
          );
          console.log(`[TOOL] Completed: ${fc.name} in ${durationMs}ms`);
          responses.push({
            id: fc.id,
            name: fc.name,
            response: { result: result || { success: true } }
          });
        } catch (e) {
          console.error(`Error executing tool ${fc.name}`, e);
          responses.push({
            id: fc.id,
            name: fc.name,
            response: { error: 'Failed to execute' }
          });
        }
      }

      // Send response back through WebSocket
      if (responses.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log(`[WS] Sending ${responses.length} tool responses`);
        this.ws.send(JSON.stringify({
          type: 'toolResponse',
          responses: responses
        }));
      }
    }

    // 2. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
      // Visual feedback
      this.onVolume(0.4);

      // Ensure output context is running
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

      const audioBuffer = await this.decodeAudioData(
        this.base64ToUint8(base64Audio),
        this.outputAudioContext,
        24000,
        1
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = this.outputAudioContext.createGain();
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(this.outputAudioContext.destination);

      source.addEventListener('ended', () => {
        this.sources.delete(source);
        if (this.sources.size === 0) this.onVolume(0);
      });

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
    }

    // 3. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(s => s.stop());
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  private async runToolWithTimeout(name: string, args: any, timeoutMs: number): Promise<{ result: any; durationMs: number }> {
    const start = performance.now();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      const result = await Promise.race([this.onToolCall(name, args), timeoutPromise]);
      return { result, durationMs: Math.round(performance.now() - start) };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  disconnect() {
    this.manuallyDisconnecting = true;
    this.stopAudio();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.log('WebSocket close warning:', e);
      }
    }
    this.ws = null;

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      this.inputAudioContext.close();
    }
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      this.outputAudioContext.close();
    }

    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.isConnected = false;
    this.onStatusChange(false);
    this.onActivity('idle');
  }

  private float32ToBase64PCM(data: Float32Array): string {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const uint8 = new Uint8Array(int16.buffer);
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}
