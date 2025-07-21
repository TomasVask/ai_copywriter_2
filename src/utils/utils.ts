import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { HumanMessage, AIMessage, BaseMessage, MessageContent } from "@langchain/core/messages";
import type { Message } from "@/models/message.model";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { CustomFunction } from "@/enums/customFunction.enum";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toLangChainMessagesForCreation(messages: Message[], model: LargeLanguageModel): BaseMessage[] {
  const content: BaseMessage[] = [];
  messages.forEach(msg => {
    if (msg.role === "user") {
      content.push(new HumanMessage(msg.content));
    }

    if (msg.role === "assistant") {
      const modelResponse = msg.responses?.find(response => response.model === model)
      if (modelResponse?.taskSummary) {
        const newMessage = new AIMessage(modelResponse.taskSummary);
        newMessage.additional_kwargs = {
          ...newMessage.additional_kwargs,
          custom_model_name: model,
          custom_function: CustomFunction.CreateTaskSummary,
          historical: true
        }
        content.push(newMessage)
      }

      if (modelResponse?.generatedContent) {
        const newMessage = new AIMessage(modelResponse.generatedContent);
        newMessage.additional_kwargs = {
          ...newMessage.additional_kwargs,
          custom_model_name: model,
          custom_function: CustomFunction.GenerateAdContent,
          historical: true
        }
        content.push(newMessage);
      }
    }
  })
  return content;
}

export function toLangChainMessagesForAugmentation(messages: Message[]): BaseMessage[] {
  const content: BaseMessage[] = [];
  messages.forEach(msg => {
    if (msg.role === "user") {
      content.push(new HumanMessage(msg.content));
    }

    if (msg.role === "assistant") {
      if (msg.retrievedContent) {
        content.push(new AIMessage(msg.retrievedContent));
      }

      if (msg.scrapedServices) {
        content.push(new AIMessage(msg.scrapedServices));
      }

      if (msg.scrapedServiceContent) {
        content.push(new AIMessage(msg.scrapedServiceContent));
      }
    }
  })
  return content;
}

export function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s{2,}/g, " "); // Remove extra spaces
}

export function extractStringContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
      .join("\n");
  } else {
    return JSON.stringify(content);
  }
}


export function handleModelError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  customFunction?: CustomFunction,
  modelName?: LargeLanguageModel
): AIMessage {
  let errorMessage = '';
  if (modelName === 'anthropic') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorMessage = (typeof error === 'object' && (error as { error: any }).error) ? (error as { error: any })?.error?.error?.message : String(error);
  }

  if (modelName === 'openai') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorMessage = (typeof error === 'object' && (error as { error: any }).error) ? (error as { error: any })?.error?.message : String(error);
  }

  if (modelName === 'gemini') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorMessage = (typeof error === 'object' && (error as { error: any }).error) ? (error as { error: any })?.error?.error?.message : String(error);
  }

  errorMessage = String(error);

  let customErrorMessage: AIMessage
  if (modelName && customFunction) {
    console.error(`❌ Error while ${CustomFunction.GenerateAdContent ? 'generating ad' : 'creating task summary'} with model ${modelName}:`, errorMessage);
    customErrorMessage = new AIMessage(`❌ Error while ${CustomFunction.GenerateAdContent ? 'generating ad' : 'creating task summary'}: ${errorMessage}`);
    customErrorMessage.additional_kwargs = {
      ...customErrorMessage.additional_kwargs,
      custom_model_name: modelName,
      custom_function: customFunction,
      error: true
    };
  } else {
    if (customFunction === CustomFunction.QueryOrRespond) {
      console.error(`❌ Failed to decide whether retrieval needed:`, errorMessage);
      customErrorMessage = new AIMessage(`❌ Failed to decide whether retrieval needed: ${errorMessage}`);
    } else {
      console.error(`❌ Error:`, errorMessage);
      customErrorMessage = new AIMessage(`❌ Error: ${errorMessage}`);
    }
    customErrorMessage.additional_kwargs = {
      ...customErrorMessage.additional_kwargs,
      error: true
    };
  }
  return customErrorMessage;
}