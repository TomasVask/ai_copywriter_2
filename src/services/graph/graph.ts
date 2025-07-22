import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { retrieveTool, webSearchTool, augmentToolNode, scrapeServiceContent, scrapeLinksFromHomePage } from "./graphTools";
import { augmentationSystemPrompt, createTaskSummaryPrompt, filterServiceTitlesFromScrappedContentPrompt, filterServicesHomeLinkFromHomepagePrompt, filterLinkFromSearchPrompt, generateAdPrompt } from "@/system_prompts/system_prompts";
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
import { useSettingsStore } from "@/store/settingsStore";
import { checkRateLimit } from "../rateLimitCheck";
import { z } from "zod";

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

const generateAdSchema = z.object({
  adText: z.string().optional().describe("Sukurto reklamos teksto turinys"),
  otherText: z.string().optional().describe("Bet koks kitas tekstas, kuris nėra reklamos turinys"),
});

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  filteredLinkAfterSearch: Annotation<string[]>(),
  extractedLinksFromHomePage: Annotation<string[]>(),
  filteredLinkAfterHomePage: Annotation<string[]>(),
  linksUsedForScraping: Annotation<string[]>(),
  scrapedServiceContent: Annotation<string>(),
  scrapedServices: Annotation<string>(),
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
    console.log('filterLinksWithPicker finished', contentStr)
    return { [resultKey]: contentStr ? JSON.parse(contentStr) : [] };
  } catch (error) {
    const errorMessage = String(error);
    return { [resultKey]: [errorMessage] };
  }
}

async function filterServiceLinkFromSearch(state: typeof StateAnnotation.State) {
  console.log('filterServiceLinkFromSearch started')
  const lastResultOfSearch = state.messages[state.messages.length - 1];
  const linksFromSearch = lastResultOfSearch.content;
  return filterLinksWithPicker(linksFromSearch, filterLinkFromSearchPrompt, "filteredLinkAfterSearch");
}

async function filterServiceHomeLinkFromHome(state: typeof StateAnnotation.State) {
  console.log('filterServiceHomeLinkFromHome started')
  const linksFromHomePage = state.extractedLinksFromHomePage || [];
  return filterLinksWithPicker(linksFromHomePage, filterServicesHomeLinkFromHomepagePrompt, "filteredLinkAfterHomePage");
}


async function filterServiceTitlesFromScrappedContent(state: typeof StateAnnotation.State): Promise<{ scrapedServices: string }> {
  console.log('filterServiceTitlesFromScrappedContent started')
  const { scrapedServiceContent: scrapedContent } = state;
  const response = await searchSupporter.invoke([{ type: "system", content: filterServiceTitlesFromScrappedContentPrompt(scrapedContent) }]);
  const contentStr = extractStringContent(response.content);

  console.log('filterServiceTitlesFromScrappedContent completed')
  return { scrapedServices: contentStr || '' };
}

function scrapeLinksOrContentCondition(state: typeof StateAnnotation.State) {
  return state.filteredLinkAfterSearch.some(isHomeLink) ? "scrapeLinksFromHomePage" : "scrapeServiceContent";
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
    const llmInstance = getModelInstance(modelName, 0.2, 0.5);
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
    const temperature = useSettingsStore.getState().temperature;
    const topP = useSettingsStore.getState().topP;
    const llmInstance = getModelInstance(modelName, temperature, topP);
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
    const llmWithSchema = llmInstance.withStructuredOutput(generateAdSchema);
    const structuredResponse = await llmWithSchema.invoke(prompt);

    const response = new AIMessage({
      content: JSON.stringify(structuredResponse),
      additional_kwargs: {
        custom_model_name: modelName,
        custom_function: CustomFunction.GenerateAdContent,
      }
    });

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
    .addNode("filterServiceLinkFromSearch", (state) => filterServiceLinkFromSearch(state))
    .addNode("filterServiceHomeLinkFromHome", (state) => filterServiceHomeLinkFromHome(state))
    .addNode("scrapeServiceContent", (state) => scrapeServiceContent(state))
    .addNode("scrapeLinksFromHomePage", (state) => scrapeLinksFromHomePage(state))
    .addNode("filterServiceTitlesFromScrappedContent", (state) => filterServiceTitlesFromScrappedContent(state))

  graph
    .addEdge("__start__", "queryOrRespond")
    .addConditionalEdges('queryOrRespond', toolsCondition,
      {
        __end__: "__end__",
        tools: "tools"
      })
    .addEdge("tools", "filterServiceLinkFromSearch")
    .addConditionalEdges("filterServiceLinkFromSearch", scrapeLinksOrContentCondition,
      {
        scrapeLinksFromHomePage: "scrapeLinksFromHomePage",
        scrapeServiceContent: "scrapeServiceContent"
      })
    .addEdge("scrapeLinksFromHomePage", "filterServiceHomeLinkFromHome")
    .addEdge("filterServiceHomeLinkFromHome", "scrapeServiceContent")
    .addConditionalEdges("scrapeServiceContent",
      (state) => state.branch === "continue" ? "filterServiceTitlesFromScrappedContent" : "__end__",
      {
        filterServiceTitlesFromScrappedContent: "filterServiceTitlesFromScrappedContent",
        __end__: "__end__"
      })
    .addEdge("filterServiceTitlesFromScrappedContent", "__end__");

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
): Promise<{ augmentationRequired: boolean, terminatFurtherActions: boolean }> {
  let augmentationRequired = initialAugmentationRequired;

  const augmentationGraph = buildAugmentationGraph();
  const langchainMessagesForAugmentation = toLangChainMessagesForAugmentation(messages);

  let retrievalContent: string = '';
  let scrapedServiceContent: string = ''
  let scrapedServices: string = ''
  let linksUsedForScraping: string = ''

  const rateLimitResponse = await checkRateLimit();

  try {
    if (rateLimitResponse) {
      onStep({ type: GraphStep.Error, content: rateLimitResponse.generatedContent });
      return { augmentationRequired: false, terminatFurtherActions: true };
    }

    for await (const step of await augmentationGraph.stream({ messages: langchainMessagesForAugmentation }, { streamMode: "values" })) {
      const retrieveMessage = step.messages?.find((message) => message.name === "retrieve");

      const errorMessage = step.messages?.find(message => message.additional_kwargs?.error === true);

      if (errorMessage) {
        onStep({ type: GraphStep.Error, content: extractStringContent(errorMessage.content) });
        return { augmentationRequired: false, terminatFurtherActions: true };
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

      if (!scrapedServices && step.scrapedServices) {
        scrapedServices = step.scrapedServices;
        onStep({ type: GraphStep.ScrapedServices, content: scrapedServices });
      }
    }
    return { augmentationRequired, terminatFurtherActions: false };
  } catch (error) {
    console.error("❌ Error in runAugmentationWorkflow:", error);
    onStep({ type: GraphStep.Error, content: `❌ Augmentation error: ${String(error)}\n\n` });
    return { augmentationRequired: false, terminatFurtherActions: true };
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
  const response = await runAugmentationWorkflow(messages, onStep, false);
  if (response.terminatFurtherActions) {
    return
  }

  await runCreationWorkflow(messages, models, onStep, response.augmentationRequired);
}
