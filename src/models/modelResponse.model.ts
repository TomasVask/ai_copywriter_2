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


// /* In your CSS */
// .streaming-content {
//   border-left: 3px solid #0070f3;
//   padding-left: 1rem;
// }

// @keyframes typing {
//   0% { border-color: transparent }
//   50% { border-color: #0070f3 }
//   100% { border-color: transparent }
// }

// .streaming-content::after {
//   content: "";
//   display: inline-block;
//   width: 6px;
//   height: 15px;
//   background: #0070f3;
//   margin-left: 5px;
//   animation: typing 1s infinite;
// }