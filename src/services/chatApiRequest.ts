import { GraphStep } from "@/enums/graphStep.enum";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { Message } from "@/models/message.model";
import { StepStreamData } from "@/models/stepStreamData.model";

export const sendChatMessageToRagApi = async (
  messages: Message[],
  models: LargeLanguageModel[],
  onStep: (data: StepStreamData) => void
) => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, models }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    if (!reader) {
      throw new Error('❌ No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process each SSE chunk
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Save incomplete chunk

      for (const chunk of lines) {
        if (chunk.startsWith('data: ')) {
          const jsonStr = chunk.replace(/^data: /, '');
          try {
            const parsed = JSON.parse(jsonStr);
            onStep(parsed);
          } catch (err) {
            console.error('❌ Failed to parse SSE chunk:', jsonStr, err);
          }
        }
      }
    }

    console.log("SSE stream closed");
  } catch (error) {
    console.error("❌ Error in SSE connection:", error);
    onStep({ type: GraphStep.Error, content: String(error) });
  }
};