import { GoogleGenAI, Part, Content, GenerateContentResponse } from "@google/genai";
import { TOOLS_DECLARATION, SYSTEM_INSTRUCTION } from "../types";

// We need to inject the function handler so the service can execute tools during the loop
type ToolExecutor = (name: string, args: any) => Promise<any>;

export async function processTextPrompt(prompt: string, executeTool: ToolExecutor) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  // We manually manage the conversation history to strictly control roles.
  // This prevents the "500 Internal Error" which occurs when function responses 
  // are implicitly sent as 'user' role by the Chat helper.
  const contents: Content[] = [
    { role: 'user', parts: [{ text: prompt }] }
  ];

  // NOTE: We cannot use { googleSearch: {} } combined with functionDeclarations.
  // The API documentation specifies that googleSearch must be the only tool if used.
  // We prioritize the agent's ability to execute app functions (tasks, calendar) over search grounding.
  const config = {
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: [
      { functionDeclarations: TOOLS_DECLARATION }
    ],
  };

  let maxTurns = 10;
  let finalResponse: GenerateContentResponse | null = null;

  while (maxTurns > 0) {
    maxTurns--;
    
    // 1. Generate content with current history
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      config: config,
      contents: contents
    });

    finalResponse = response;

    // 2. Append model's response to history
    // We assume the first candidate is the one we want.
    const modelContent = response.candidates?.[0]?.content;
    
    // If no content, we can't continue context
    if (!modelContent) break;

    contents.push(modelContent);

    // 3. Check for function calls
    // In the new SDK, response.functionCalls is a helper getter
    const functionCalls = response.functionCalls;
    
    if (functionCalls && functionCalls.length > 0) {
        const functionResponses: Part[] = [];

        for (const call of functionCalls) {
            try {
                // Execute the tool in App.tsx context
                const result = await executeTool(call.name, call.args);
                
                // CRITICAL: The 'response' field in FunctionResponse MUST be a JSON object (Map).
                // It cannot be a primitive or a top-level Array.
                let safeResponse = result;
                if (typeof result !== 'object' || result === null || Array.isArray(result)) {
                    safeResponse = { result };
                }

                functionResponses.push({
                    functionResponse: {
                        id: call.id, // ID is mandatory for matching
                        name: call.name,
                        response: safeResponse
                    }
                });
            } catch (e: any) {
                functionResponses.push({
                    functionResponse: {
                        id: call.id,
                        name: call.name,
                        response: { error: e.message || "Unknown error" }
                    }
                });
            }
        }

        // 4. Append function execution results to history with role: 'function'
        contents.push({
            role: 'function',
            parts: functionResponses
        });

        // Loop continues to send this new history back to model
    } else {
        // No function calls, the model is done reasoning
        break;
    }
  }

  return finalResponse || { candidates: [] } as any;
}