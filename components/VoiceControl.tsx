import React, { useState } from 'react';
import { Mic, Keyboard, Send, Loader2 } from 'lucide-react';
import { FabricWave3D } from './FabricWave3D';

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
    <div className="flex flex-col items-center justify-center relative min-h-[340px] overflow-hidden rounded-2xl bg-cream">
      {/* 3D Fabric Wave Animation Background */}
      <FabricWave3D isActive={isRecording || isConnected} />

       {/* Error Message */}
       {error && (
        <div className="absolute top-2 bg-red-500/10 border border-red-500/50 text-red-700 text-xs px-3 py-1 rounded-full mb-4 z-20">
          {error}
        </div>
      )}

      {/* Mode Toggles */}
      <div className="absolute top-4 right-4 flex gap-2 bg-white/80 backdrop-blur-sm rounded-lg p-1 shadow-sm z-20">
        <button
            onClick={() => setMode('voice')}
            className={`p-2 rounded-md transition-all ${mode === 'voice' ? 'bg-teal-primary text-white' : 'text-teal-dark/60 hover:text-teal-dark'}`}
            title="Voice Mode"
        >
            <Mic size={16} />
        </button>
        <button
            onClick={() => setMode('text')}
            className={`p-2 rounded-md transition-all ${mode === 'text' ? 'bg-teal-primary text-white' : 'text-teal-dark/60 hover:text-teal-dark'}`}
            title="Text Mode"
        >
            <Keyboard size={16} />
        </button>
      </div>

      {/* VOICE MODE UI */}
      {mode === 'voice' && (
          <div className="flex flex-col items-center relative z-10">
            {/* Mic Button */}
            <button
                onClick={onToggle}
                className={`mic-button relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-lg ${
                isRecording
                    ? 'active bg-white border-2 border-teal-primary'
                    : 'bg-white/90 hover:bg-white border border-gray-200 hover:shadow-xl'
                }`}
            >
                <Mic className={`w-7 h-7 ${isRecording ? 'text-teal-primary' : 'text-teal-dark/70'}`} />
            </button>

            {/* Status Text */}
            <div className="mt-6 text-center">
                <h3 className={`text-base font-medium ${isRecording ? 'text-teal-primary' : 'text-teal-dark/60'}`}>
                  {isRecording ? 'Listening...' : 'Tap to speak'}
                </h3>
            </div>
          </div>
      )}

      {/* TEXT MODE UI */}
      {mode === 'text' && (
          <div className="w-full flex flex-col h-full relative z-10 px-6 py-4">
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-white/80 backdrop-blur-sm flex items-center justify-center border border-gray-200 shadow-sm">
                    <Keyboard className="text-teal-primary w-7 h-7" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-teal-dark">Text Input Mode</h3>
                    <p className="text-xs text-teal-dark/50 mt-1">Type your brain dump below</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="relative w-full">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="E.g., 'Remind me to call Mom at 5pm...'"
                    className="w-full bg-white/90 backdrop-blur-sm border border-gray-200 text-teal-dark rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-teal-primary/30 placeholder:text-teal-dark/30 shadow-sm"
                    disabled={isProcessingText}
                />
                <button
                    type="submit"
                    disabled={!inputText.trim() || isProcessingText}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-teal-primary text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:hover:bg-teal-primary transition-colors"
                >
                    {isProcessingText ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} />}
                </button>
              </form>
          </div>
      )}

    </div>
  );
};