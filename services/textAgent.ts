import { GoogleGenAI } from "@google/genai";
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from "../types";

export async function sendTextPrompt(prompt: string) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  // We use gemini-3-flash-preview for fast, reasoning-capable text processing
  // This mirrors the logic of the Live API but via the standard REST/HTTP endpoint
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ 
        functionDeclarations: TOOLS_DECLARATION.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as any
        })) 
      }],
      // We don't enforce a schema because we want the model to be able to use tools freely
    }
  });

  return response;
}