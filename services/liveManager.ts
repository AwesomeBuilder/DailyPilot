import { GoogleGenAI, LiveServerMessage, Modality, StartSensitivity, EndSensitivity } from "@google/genai";
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from "../types";

// Types for callbacks
type ToolHandler = (name: string, args: any) => Promise<any>;
type StatusHandler = (active: boolean) => void;
type ErrorHandler = (error: string) => void;
type AudioVolumeHandler = (volume: number) => void;

export class LiveManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private currentSession: any = null;
  private manuallyDisconnecting = false;

  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  
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
    
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        this.onError("API Key is missing.");
        throw new Error("API Key missing");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect() {
    if (this.isConnected) return;

    try {
      this.manuallyDisconnecting = false;

      // Initialize Contexts
      // We must strictly request 16000 sample rate for the input to match the API requirement.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{
            functionDeclarations: TOOLS_DECLARATION
          }],
          // VAD settings for longer sessions - less sensitive to end speech
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
            this.isConnected = true;
            this.onStatusChange(true);
            // Reset reconnect attempts on successful connection
            this.reconnectAttempts = 0;
            // Start audio immediately upon connect
            this.startAudio();
          },
          onmessage: this.handleMessage.bind(this),
          onclose: (e) => {
            this.isConnected = false;
            this.onStatusChange(false);
            if (!this.manuallyDisconnecting) {
                console.log("Session closed unexpectedly", e);
                this.onError("Session disconnected.");
            }
          },
          onerror: (err) => {
            if (this.manuallyDisconnecting) return;
            console.error("Session error:", err);
            this.onError("Connection error occurred.");
            // We do not auto-disconnect here to allow transient errors, 
            // unless it's fatal.
          }
        }
      });
      
      this.currentSession = await this.sessionPromise;

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

        const pcmBlob = this.createBlob(inputData);

        this.sessionPromise?.then((session) => {
          if (this.isMicActive && !this.manuallyDisconnecting) {
             try {
                session.sendRealtimeInput({ media: pcmBlob });
             } catch (e) {
                console.error("Error sending audio chunk", e);
             }
          }
        });
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

  private handleMessage = async (message: LiveServerMessage) => {
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
        
        // Send response back
        if (responses.length > 0 && this.sessionPromise) {
            this.sessionPromise.then(session => {
                if (!this.manuallyDisconnecting) {
                    session.sendToolResponse({ functionResponses: responses });
                }
            });
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
    
    if (this.currentSession) {
        try {
            this.currentSession.close();
        } catch (e) {
            console.log("Session close warning:", e);
        }
    }
    this.currentSession = null;
    this.sessionPromise = null;
    
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

  private createBlob(data: Float32Array) {
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
    const b64 = btoa(binary);

    return {
      data: b64,
      mimeType: 'audio/pcm;rate=16000',
    };
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