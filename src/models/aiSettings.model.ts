import { PromptStrategyKey } from "./promptStrategy.model";

export interface AISettings {
    temperature: number;
    topP: number;
    promptStrategy: PromptStrategyKey;
}