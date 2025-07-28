import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { HumanMessage, AIMessage, BaseMessage, MessageContent, ToolMessage } from "@langchain/core/messages";
import type { Message } from "@/models/message.model";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { CustomFunction } from "@/enums/customFunction.enum";
import { StateAnnotation } from "@/services/graph/graph";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toBaseMessagesForAdGeneration(messages: Message[], model: LargeLanguageModel): BaseMessage[] {
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

export function toBaseMessageForAugmentation(messages: Message[]): BaseMessage[] {
  const content: BaseMessage[] = [];
  messages.forEach(msg => {
    if (msg.role === "user") {
      content.push(new HumanMessage(msg.content));
    }

    if (msg.role === "assistant") {
      if (msg.retrievedContent) {
        const newMessage = new AIMessage({
          content: msg.retrievedContent,
          additional_kwargs: {
            custom_function: CustomFunction.RetrievalContent,
          }
        });
        content.push(newMessage);
      }

      if (msg.scrapedServices) {
        const newMessage = new AIMessage({
          content: msg.scrapedServices,
          additional_kwargs: {
            custom_function: CustomFunction.ScrapedServices,
          }
        })
        content.push(newMessage);
      }

      if (msg.scrapedServiceContent) {
        const newMessage = new AIMessage({
          content: msg.scrapedServiceContent,
          additional_kwargs: {
            custom_function: CustomFunction.ScrapedServiceContent,
          }
        });
        content.push(newMessage);
      }
    }
  })
  return content;
}

export function toBaseMessagesForSummary(state: typeof StateAnnotation.State): BaseMessage[] {
  const content: BaseMessage[] = [];
  const retrieve = state.messages.find(message => message instanceof ToolMessage && message.name === 'retrieve')
  if (retrieve) content.push(retrieve)
  if (state.scrapedServiceContent) {
    content.push(new AIMessage({
      content: state.scrapedServiceContent,
      additional_kwargs: {
        custom_function: CustomFunction.ScrapedServiceContent,
      }
    }));
  }

  if (state.scrapedServices) {
    content.push(new AIMessage({
      content: state.scrapedServices,
      additional_kwargs: {
        custom_function: CustomFunction.ScrapedServices,
      }
    }));
  }

  return content
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