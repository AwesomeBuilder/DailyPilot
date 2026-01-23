import { GoogleGenAI, Part } from "@google/genai";
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from "../types";

// We need to inject the function handler so the service can execute tools during the loop
type ToolExecutor = (name: string, args: any) => Promise<any>;

export async function processTextPrompt(prompt: string, executeTool: ToolExecutor) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  // Use a chat session to allow multi-turn reasoning (Model -> Tool Call -> Client Exec -> Model Result)
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [
        // Function declarations for our app logic
        { 
          functionDeclarations: TOOLS_DECLARATION
        },
        // Enable Google Search for "Find restaurants" queries
        { googleSearch: {} }
      ],
    }
  });

  // Initial message
  let response = await chat.sendMessage({ message: prompt });
  let maxTurns = 10; // Prevent infinite loops

  // Loop to handle tool calls
  while (response.functionCalls && response.functionCalls.length > 0 && maxTurns > 0) {
    maxTurns--;
    const functionResponses: Part[] = [];

    for (const call of response.functionCalls) {
      try {
        // Execute the tool in App.tsx context
        const result = await executeTool(call.name, call.args);
        
        functionResponses.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { result: result }
          }
        });
      } catch (e: any) {
        functionResponses.push({
            functionResponse: {
                id: call.id,
                name: call.name,
                response: { error: e.message }
            }
        });
      }
    }

    // Send tool results back to the model so it can continue reasoning
    if (functionResponses.length > 0) {
        response = await chat.sendMessage({ message: functionResponses });
    }
  }

  return response;
}