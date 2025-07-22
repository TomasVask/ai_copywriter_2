import { ModelResponseAction } from "@/enums/modelResponseAction.enum";
import { LargeLanguageModel } from "./largeLanguageModel.model";

export interface ModelResponse {
    model: LargeLanguageModel
    generatedContent: string;
    taskSummary?: string;
    loading?: boolean;
    action?: ModelResponseAction | null;
    error?: string;
}