// Types for callbacks
type ToolHandler = (name: string, args: any) => Promise<any>;
type StatusHandler = (active: boolean) => void;
type ErrorHandler = (error: string) => void;
type AudioVolumeHandler = (volume: number) => void;

export class LiveManager {
  private ws: WebSocket | null = null;

  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private manuallyDisconnecting = false;

  private onToolCall: ToolHandler;
  private onStatusChange: StatusHandler;
  private onError: ErrorHandler;
  private onVolume: AudioVolumeHandler;

  public isConnected = false;
  public isMicActive = false;

  constructor(
    onToolCall: ToolHandler,
    onStatusChange: StatusHandler,
    onError: ErrorHandler,
    onVolume: AudioVolumeHandler
  ) {
    this.onToolCall = onToolCall;
    this.onStatusChange = onStatusChange;
    this.onError = onError;
    this.onVolume = onVolume;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      this.manuallyDisconnecting = false;

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });

      // Connect to backend WebSocket proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsPort = import.meta.env.DEV ? '3001' : window.location.port;
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/api/live`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Connected to Live API proxy');
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'connected') {
            this.isConnected = true;
            this.onStatusChange(true);
            // Start audio immediately upon connect
            this.startAudio();
          } else if (message.type === 'message') {
            await this.handleGeminiMessage(message.data);
          } else if (message.type === 'closed') {
            this.isConnected = false;
            this.onStatusChange(false);
            if (!this.manuallyDisconnecting) {
              this.onError("Session disconnected.");
            }
          } else if (message.type === 'error') {
            if (!this.manuallyDisconnecting) {
              this.onError(message.error || "Connection error occurred.");
            }
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStatusChange(false);
        if (!this.manuallyDisconnecting) {
          this.onError("Connection closed.");
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!this.manuallyDisconnecting) {
          this.onError("Connection error occurred.");
        }
      };

    } catch (err: any) {
      this.isConnected = false;
      this.onStatusChange(false);
      this.onError(err.message || "Failed to connect to Daily Pilot.");
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

        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate volume for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.onVolume(rms);

        // Convert to base64 PCM
        const b64 = this.createBase64Audio(inputData);

        // Send to backend
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isMicActive) {
          this.ws.send(JSON.stringify({
            type: 'audio',
            data: b64
          }));
        }
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);
      this.isMicActive = true;
    } catch (e: any) {
      console.error("Microphone access error:", e);
      this.onError("Microphone access denied.");
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

    // 1. Handle Tool Calls
    if (message.toolCall) {
      const responses = [];
      for (const fc of message.toolCall.functionCalls) {
        try {
          const result = await this.onToolCall(fc.name, fc.args);
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
            response: { error: "Failed to execute" }
          });
        }
      }

      // Send response back through WebSocket
      if (responses.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'toolResponse',
          responses
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
        this.decode(base64Audio),
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

  disconnect() {
    this.manuallyDisconnecting = true;
    this.stopAudio();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.log("WebSocket close warning:", e);
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
  }

  private createBase64Audio(data: Float32Array): string {
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

  private decode(base64: string) {
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
