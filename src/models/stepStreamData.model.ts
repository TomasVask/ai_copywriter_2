import { GraphStep } from "@/enums/graphStep.enum";
import { LargeLanguageModel } from "./largeLanguageModel.model";

export interface StepStreamData {
  type: GraphStep,
  content: string,
  model?: LargeLanguageModel
}