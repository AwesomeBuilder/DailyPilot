import React, { useState } from 'react';
import { Mic, MicOff, BrainCircuit, Keyboard, Send, Loader2 } from 'lucide-react';

interface Props {
  isConnected: boolean;
  isRecording: boolean;
  isProcessingText: boolean;
  volume: number;
  onToggle: () => void;
  onTextSubmit: (text: string) => void;
  error: string | null;
}

export const VoiceControl: React.FC<Props> = ({ 
    isConnected, 
    isRecording, 
    isProcessingText,
    volume, 
    onToggle, 
    onTextSubmit,
    error 
}) => {
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onTextSubmit(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 relative min-h-[300px]">
       {/* Error Message */}
       {error && (
        <div className="absolute top-2 bg-red-500/10 border border-red-500/50 text-red-200 text-xs px-3 py-1 rounded-full mb-4 z-20">
          {error}
        </div>
      )}

      {/* Mode Toggles */}
      <div className="absolute top-4 right-4 flex gap-2 bg-slate-800 rounded-lg p-1">
        <button 
            onClick={() => setMode('voice')}
            className={`p-2 rounded-md transition-all ${mode === 'voice' ? 'bg-cyan-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            title="Voice Mode"
        >
            <Mic size={16} />
        </button>
        <button 
            onClick={() => setMode('text')}
            className={`p-2 rounded-md transition-all ${mode === 'text' ? 'bg-cyan-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            title="Text Mode"
        >
            <Keyboard size={16} />
        </button>
      </div>

      {/* VOICE MODE UI */}
      {mode === 'voice' && (
          <div className="flex flex-col items-center mt-6">
            <button
                onClick={onToggle}
                className={`relative z-10 flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 shadow-2xl ${
                isRecording 
                    ? 'bg-gradient-to-br from-cyan-500 to-blue-600 hover:shadow-cyan-500/50' 
                    : isConnected 
                        ? 'bg-slate-700 border-2 border-cyan-500/50 animate-pulse'
                        : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                }`}
            >
                {isRecording ? (
                <Mic className="w-8 h-8 text-white" />
                ) : isConnected ? (
                <BrainCircuit className="w-8 h-8 text-cyan-400" />
                ) : (
                <MicOff className="w-8 h-8 text-slate-400" />
                )}
            </button>

            {/* Visualizer Rings */}
            {isRecording && (
                <>
                <div 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 rounded-full border border-cyan-500/30"
                    style={{
                    width: `${100 + volume * 150}px`,
                    height: `${100 + volume * 150}px`,
                    transition: 'all 0.1s ease-out'
                    }}
                />
                <div 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 rounded-full bg-cyan-500/10 animate-pulse-ring"
                    style={{
                    width: '100px',
                    height: '100px',
                    }}
                />
                </>
            )}

            <div className="mt-8 text-center">
                <h3 className={`text-lg font-medium ${isRecording ? 'text-cyan-400' : isConnected ? 'text-indigo-400' : 'text-slate-400'}`}>
                {isRecording ? 'Listening...' : isConnected ? 'Processing & Reasoning' : 'Voice Offline'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">
                {isRecording ? 'Tap to finish' : isConnected ? 'Tap to add more input' : 'Tap to start session'}
                </p>
            </div>
          </div>
      )}

      {/* TEXT MODE UI */}
      {mode === 'text' && (
          <div className="w-full flex flex-col h-full mt-4">
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700">
                    <Keyboard className="text-cyan-400 w-8 h-8" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-slate-200">Text Input Mode</h3>
                    <p className="text-xs text-slate-500 mt-1">Type your brain dump below to test the agent logic.</p>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="relative w-full">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="E.g., 'Remind me to call Mom at 5pm...'"
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder:text-slate-600"
                    disabled={isProcessingText}
                />
                <button 
                    type="submit" 
                    disabled={!inputText.trim() || isProcessingText}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 text-slate-900 rounded-lg hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 transition-colors"
                >
                    {isProcessingText ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} />}
                </button>
              </form>
          </div>
      )}

    </div>
  );
};