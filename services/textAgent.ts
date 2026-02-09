import { Part, Content } from "@google/genai";

// We need to inject the function handler so the service can execute tools during the loop
type ToolExecutor = (name: string, args: any) => Promise<any>;

export async function processTextPrompt(
  prompt: string,
  executeTool: ToolExecutor,
  provider: 'vertex' | 'public'
) {
  // Build the API URL for the backend
  const providerParam = provider === 'public' ? 'public' : 'vertex';
  const apiBase = import.meta.env.VITE_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:3001' : '');
  const apiUrl = `${apiBase}/api/generate?provider=${providerParam}`;

  // We manually manage the conversation history to strictly control roles.
  const contents: Content[] = [
    { role: 'user', parts: [{ text: prompt }] }
  ];

  let maxTurns = 10;
  let finalResponse: any = null;

  while (maxTurns > 0) {
    maxTurns--;

    // 1. Send request to backend
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        config: {}, // Backend adds system instruction and tools
        provider: providerParam
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    finalResponse = data;

    // 2. Append model's response to history
    const modelContent = data.candidates?.[0]?.content;

    // If no content, we can't continue context
    if (!modelContent) break;

    contents.push(modelContent);

    // 3. Check for function calls
    const functionCalls = data.functionCalls;

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
