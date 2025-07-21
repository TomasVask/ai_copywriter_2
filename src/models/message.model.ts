import { LargeLanguageModel } from "./largeLanguageModel.model";
import { ModelResponse } from "./modelResponse.model";

export interface Message {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
    activeModels: LargeLanguageModel[],
    responses?: ModelResponse[],
    retrievedContent?: string;
    scrapedServices?: string;
    scrapedServiceContent?: string
}
