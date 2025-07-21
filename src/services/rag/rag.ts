import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { retrieveTool, webSearchTool, augmentToolNode, scrapeContentFromLinks, extractLinksFromHomePage } from "./ragTools";
import { augmentationSystemPrompt, createTaskSummaryPrompt, extractServicesFromScrappedContentPrompt, filterLinksFromHomePrompt, filterLinksFromSearchPrompt, generateAdPrompt } from "@/system_prompts/system_prompts";
import { toolsCondition } from "@langchain/langgraph/prebuilt";
import { extractStringContent, handleModelError, toLangChainMessagesForAugmentation, toLangChainMessagesForCreation } from "@/utils/utils";
import { Message } from "@/models/message.model";
import type { BaseMessage, MessageContent } from "@langchain/core/messages";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GraphStep } from "@/enums/graphStep.enum";
import { StepStreamData } from "@/models/stepStreamData.model";
import { CustomFunction } from "@/enums/customFunction.enum";

const retrievalOrchestrator = new ChatOpenAI({
  model: "gpt-4.1",
  temperature: 0.0,
  topP: 1.0,
  maxTokens: 200
})

const searchSupporter = new ChatOpenAI({
  model: "gpt-4.1",
  temperature: 0.0,
  topP: 1.0,
  maxTokens: 400
})

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  filteredLinkAfterSearch: Annotation<string[]>(),
  extractedLinksFromHomePage: Annotation<string[]>(),
  filteredLinkAfterHomePage: Annotation<string[]>(),
  linksUsedForScraping: Annotation<string[]>(),
  scrapedServiceContent: Annotation<string>(),
  scrapedServices: Annotation<string[]>(),
  branch: Annotation<string>(),
});

async function queryOrRespond(
  state: typeof StateAnnotation.State
): Promise<{ messages: AIMessage[] }> {
  try {
    console.log('queryOrRespond started');
    const retrievalWithTools = retrievalOrchestrator.bindTools([retrieveTool, webSearchTool]);
    const retrievalPrompt = [
      new SystemMessage(augmentationSystemPrompt),
      ...state.messages,
    ];
    const response = await retrievalWithTools.invoke(retrievalPrompt);
    console.log('queryOrRespond completed');
    return { messages: [response] };
  } catch (error) {
    const errorMessage = handleModelError(error, CustomFunction.QueryOrRespond);
    return { messages: [errorMessage] };
  }
}

async function filterLinksWithPicker(
  links: string[] | MessageContent,
  promptFn: (links: string) => string,
  resultKey: "filteredLinkAfterSearch" | "filteredLinkAfterHomePage"
): Promise<{ [key: string]: string[] }> {
  if (!links || (Array.isArray(links) && links.length === 0)) {
    return { [resultKey]: [] };
  }

  try {
    const stringifiedLinks = Array.isArray(links) ? links.join("\n") : links;
    const response = await searchSupporter.invoke([{ type: "system", content: promptFn(stringifiedLinks) }]);

    let contentStr: string;
    if (typeof response.content === "string") {
      contentStr = response.content;
    } else if (Array.isArray(response.content)) {
      contentStr = response.content
        .map(c => (typeof c === "string" ? c : JSON.stringify(c)))
        .join(" ");
    } else {
      contentStr = JSON.stringify(response.content);
    }
    console.log('filterLinksWithPicker finished')
    return { [resultKey]: contentStr ? JSON.parse(contentStr) : [] };
  } catch (error) {
    const errorMessage = String(error);
    return { [resultKey]: [errorMessage] };
  }
}

async function filterServiceLinksFromSearch(state: typeof StateAnnotation.State) {
  console.log('filterServiceLinksFromSearch started')
  const lastResultOfSearch = state.messages[state.messages.length - 1];
  const linksFromSearch = lastResultOfSearch.content;
  return filterLinksWithPicker(linksFromSearch, filterLinksFromSearchPrompt, "filteredLinkAfterSearch");
}

async function filterServiceLinksFromHome(state: typeof StateAnnotation.State) {
  console.log('filterServiceLinksFromHome started')
  const linksFromHomePage = state.extractedLinksFromHomePage || [];
  return filterLinksWithPicker(linksFromHomePage, filterLinksFromHomePrompt, "filteredLinkAfterHomePage");
}


async function extractServicesFromScrappedContent(state: typeof StateAnnotation.State): Promise<{ scrapedServices: string[] }> {
  console.log('extractServicesFromScrappedContent started')
  const { scrapedServiceContent: scrapedContent } = state;
  const response = await searchSupporter.invoke([{ type: "system", content: extractServicesFromScrappedContentPrompt(scrapedContent) }]);
  const contentStr = extractStringContent(response.content);

  console.log('extractServicesFromScrappedContent completed')
  return { scrapedServices: contentStr ? JSON.parse(contentStr) : [] };
}


async function filterServiceLinksCondition(state: typeof StateAnnotation.State) {
  const { filteredLinkAfterSearch } = state;
  if (filteredLinkAfterSearch.some(isHomeLink)) {
    return "extractLinksFromHomePage";
  }
  return "scrapeContentFromLinks";
}

function isHomeLink(link: string): boolean {
  try {
    const url = new URL(link);
    const path = url.pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);

    if (segments.length === 0) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function getModelInstance(
  modelName: LargeLanguageModel,
  temperature: number,
  topP: number
): ChatAnthropic | ChatGoogleGenerativeAI | ChatOpenAI<ChatOpenAICallOptions> {
  const modelMap = {
    openai: new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature,
      topP,
      maxTokens: 1500,
    }),
    gemini: new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash",
      temperature,
      topP,
      maxOutputTokens: 1500,
    }),
    anthropic: new ChatAnthropic({
      model: "claude-3-5-sonnet-20240620",
      temperature,
      topP,
      maxTokens: 1500,
    }),
  };

  const llmInstance = modelMap[modelName];
  if (!llmInstance) {
    throw new Error(`Unknown model: ${modelName}`);
  }
  return llmInstance;
}

async function createTaskSummary(state: typeof StateAnnotation.State, modelName: LargeLanguageModel): Promise<{ messages: AIMessage[] }> {
  console.log(`---createTaskSummary started for model ${modelName}`);
  try {
    const llmInstance = getModelInstance(modelName, 0.7, 0.2);
    const retrievalToolMessage = state.messages?.find((message) => message.name === "retrieve");
    const initialUserMessage = state.messages?.find((message) => message instanceof HumanMessage);

    const retrievedContext = retrievalToolMessage ? extractStringContent(retrievalToolMessage.content) : '';
    const initialUserPrompt = initialUserMessage ? extractStringContent(initialUserMessage.content) : '';
    const { scrapedServiceContent, scrapedServices } = state;

    const prompt = [
      new SystemMessage(createTaskSummaryPrompt(initialUserPrompt, scrapedServiceContent, scrapedServices, retrievedContext)),
      new HumanMessage("Prašau sukurti apibendrinamąjį straipsnį pagal pateiktą informaciją."),
    ];
    const response = await llmInstance.invoke(prompt);
    response.additional_kwargs = {
      ...response.additional_kwargs,
      custom_model_name: modelName,
      custom_function: CustomFunction.CreateTaskSummary,
    }
    return { messages: [response] };
  } catch (error) {
    const errorMessage = handleModelError(error, CustomFunction.CreateTaskSummary, modelName);
    return { messages: [errorMessage] };
  }
}

async function generateAd(state: typeof StateAnnotation.State, modelName: LargeLanguageModel): Promise<{ messages: AIMessage[] }> {
  console.log(`---generateAd started for model ${modelName}`);
  try {
    const llmInstance = getModelInstance(modelName, 0.7, 0.2);
    const aiMessages = state.messages.filter(message => message instanceof AIMessage);
    const filteredModelMessage = aiMessages.find(message => {
      return message.additional_kwargs?.custom_model_name === modelName && message.additional_kwargs?.custom_function === CustomFunction.CreateTaskSummary;
    });
    const taskSummary = filteredModelMessage ? extractStringContent(filteredModelMessage.content) : '';

    const conversationMessages = state.messages.filter(
      (message) =>
        message instanceof HumanMessage ||
        message instanceof SystemMessage ||
        (message instanceof AIMessage &&
          message.tool_calls?.length === 0 &&
          message.additional_kwargs?.custom_function !== CustomFunction.CreateTaskSummary &&
          !extractStringContent(message.content).includes("Failed to generate"))
    );
    const prompt = [
      new SystemMessage(generateAdPrompt(taskSummary)),
      ...conversationMessages
    ];
    const response = await llmInstance.invoke(prompt);
    response.additional_kwargs = {
      ...response.additional_kwargs,
      custom_model_name: modelName,
      custom_function: CustomFunction.GenerateAdContent,
    }

    return { messages: [response] };
  } catch (error) {
    const errorMessage = handleModelError(error, CustomFunction.GenerateAdContent, modelName);
    return { messages: [errorMessage] };
  }
}

function buildAugmentationGraph() {
  const graph = new StateGraph(StateAnnotation)
    .addNode("queryOrRespond", (state) => queryOrRespond(state))
    .addNode("tools", augmentToolNode)
    .addNode("filterServiceLinksFromSearch", (state) => filterServiceLinksFromSearch(state))
    .addNode("filterServiceLinksFromHome", (state) => filterServiceLinksFromHome(state))
    .addNode("scrapeContentFromLinks", (state) => scrapeContentFromLinks(state))
    .addNode("extractLinksFromHomePage", (state) => extractLinksFromHomePage(state))
    .addNode("extractServicesFromScrappedContent", (state) => extractServicesFromScrappedContent(state))

  graph
    .addEdge("__start__", "queryOrRespond")
    .addConditionalEdges('queryOrRespond', toolsCondition, {
      __end__: "__end__", // Exit if no tools needed
      tools: "tools"
    })
    .addEdge("tools", "filterServiceLinksFromSearch")
    .addConditionalEdges("filterServiceLinksFromSearch", async (state) => {
      const branch = await filterServiceLinksCondition(state);
      state.branch = branch === "scrapeContentFromLinks" ? "direct" : "home";
      return branch;
    }, {
      extractLinksFromHomePage: "extractLinksFromHomePage",
      scrapeContentFromLinks: "scrapeContentFromLinks"
    })
    .addEdge("extractLinksFromHomePage", "filterServiceLinksFromHome")
    .addEdge("filterServiceLinksFromHome", "scrapeContentFromLinks")
    .addConditionalEdges("scrapeContentFromLinks",
      (state) => (state.branch === "home" ? "extractServicesFromScrappedContent" : "__end__"),
      {
        extractServicesFromScrappedContent: "extractServicesFromScrappedContent",
        __end__: "__end__"
      })
    .addEdge("extractServicesFromScrappedContent", "__end__");

  return graph.compile();
}

function buildCreationGraph(model: LargeLanguageModel, requiresAugmentation: boolean) {
  const graph = new StateGraph(StateAnnotation);

  const modelId = model.toString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskSummaryNodeName: any = `createTaskSummary_${modelId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateAdNodeName: any = `generateAd_${modelId}`;
  if (requiresAugmentation) {
    graph
      .addNode(taskSummaryNodeName, (state) => createTaskSummary(state, model))
      .addNode(generateAdNodeName, (state) => generateAd(state, model))
      .addEdge("__start__", taskSummaryNodeName)
      .addEdge(taskSummaryNodeName, generateAdNodeName)
      .addEdge(generateAdNodeName, "__end__");
  } else {
    graph
      .addNode(generateAdNodeName, (state) => generateAd(state, model))
      .addEdge("__start__", generateAdNodeName)
      .addEdge(generateAdNodeName, "__end__");
  }

  return graph.compile();
}

async function runAugmentationWorkflow(
  messages: Message[],
  onStep: (step: StepStreamData) => void,
  initialAugmentationRequired: boolean = false
): Promise<boolean> {
  let augmentationRequired = initialAugmentationRequired;

  const augmentationGraph = buildAugmentationGraph();
  const langchainMessagesForAugmentation = toLangChainMessagesForAugmentation(messages);

  let retrievalContent: string = '';
  let scrapedServiceContent: string = ''
  let scrapedServices: string = ''
  let linksUsedForScraping: string = ''

  try {
    for await (const step of await augmentationGraph.stream({ messages: langchainMessagesForAugmentation }, { streamMode: "values" })) {
      const retrieveMessage = step.messages?.find((message) => message.name === "retrieve");

      const errorMessage = step.messages?.find(message => message.additional_kwargs?.error === true);

      if (errorMessage) {
        onStep({
          type: GraphStep.Error,
          content: extractStringContent(errorMessage.content),
        });
        return false;
      }


      if (!retrievalContent && retrieveMessage) {
        retrievalContent = extractStringContent(retrieveMessage.content);
        onStep({ type: GraphStep.RetrievalContent, content: retrievalContent });
        augmentationRequired = true;
      }

      if (!linksUsedForScraping && step.linksUsedForScraping?.length) {
        linksUsedForScraping = step.linksUsedForScraping[0];
        onStep({ type: GraphStep.LinksUsedForScraping, content: linksUsedForScraping });
      }

      if (!scrapedServiceContent && step.scrapedServiceContent) {
        scrapedServiceContent = step.scrapedServiceContent;
        onStep({ type: GraphStep.ScrapedServiceContent, content: scrapedServiceContent });
      }

      if (!scrapedServices && step.scrapedServices?.length) {
        scrapedServices = JSON.stringify(step.scrapedServices);
        onStep({ type: GraphStep.ScrapedServices, content: scrapedServices });
      }
    }
    return augmentationRequired;
  } catch (error) {
    console.error("❌ Error in runAugmentationWorkflow:", error);
    onStep({ type: GraphStep.Error, content: `❌ Augmentation error: ${String(error)}\n\n` });
    return false;
  }
}


function processStepMessages(
  step: typeof StateAnnotation.State,
  modelName: LargeLanguageModel,
  summaries: Record<string, string>,
  generatedAds: Record<string, string>,
  onStep: (step: StepStreamData) => void
): void {
  const errorMessage = step.messages?.find(message =>
    message.additional_kwargs?.custom_model_name === modelName &&
    message.additional_kwargs?.error === true
  );

  if (errorMessage) {
    onStep({
      type: GraphStep.Error,
      content: extractStringContent(errorMessage.content),
      model: modelName
    });
    return;
  }

  const summaryMessage = step.messages?.find(message =>
    message.additional_kwargs?.custom_model_name === modelName &&
    message.additional_kwargs?.custom_function === CustomFunction.CreateTaskSummary &&
    !message.additional_kwargs?.historical
  );

  if (!summaries[modelName] && summaryMessage) {
    summaries[modelName] = extractStringContent(summaryMessage.content);
    onStep({
      type: GraphStep.TaskSummary,
      content: summaries[modelName],
      model: modelName
    });
  }

  const generatedAdMessages = step.messages?.filter(message =>
    message.additional_kwargs?.custom_model_name === modelName &&
    message.additional_kwargs?.custom_function === CustomFunction.GenerateAdContent &&
    !message.additional_kwargs?.historical
  );

  const lastGeneratedAdMessage = generatedAdMessages?.length > 0 ?
    generatedAdMessages[generatedAdMessages.length - 1] :
    undefined;

  if (!generatedAds[modelName] && lastGeneratedAdMessage) {
    generatedAds[modelName] = extractStringContent(lastGeneratedAdMessage.content);
    onStep({
      type: GraphStep.GenerateAd,
      content: generatedAds[modelName],
      model: modelName
    });
  }
}

async function runCreationWorkflow(
  messages: Message[],
  models: LargeLanguageModel[],
  onStep: (step: StepStreamData) => void,
  initialAugmentationRequired: boolean = false
): Promise<void> {
  const summaries: Record<string, string> = {};
  const generatedAds: Record<string, string> = {};

  await Promise.allSettled(
    models.map(async (model) => {
      const creationGraph = buildCreationGraph(model, initialAugmentationRequired);
      const langchainMessagesForCreation = toLangChainMessagesForCreation(messages, model);
      try {
        for await (const step of await creationGraph.stream(
          { messages: langchainMessagesForCreation },
          { streamMode: "values" }
        )) {
          processStepMessages(
            step,
            model,
            summaries,
            generatedAds,
            onStep
          );
        }
      } catch (error) {
        console.error(`❌ Error in runCreationWorkflow for model ${model}:`, error);
        onStep({
          type: GraphStep.Error,
          content: `❌ Creation error for ${model}: ${String(error)}\n\n`,
          model: model
        });
      }
    })
  );
}

export async function runWorkflow(
  messages: Message[],
  models: LargeLanguageModel[],
  onStep: (step: StepStreamData) => void
): Promise<void> {
  const augmentationRequired = await runAugmentationWorkflow(messages, onStep, false);
  await runCreationWorkflow(messages, models, onStep, augmentationRequired);
}
