import { z } from "zod";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { vectorStore } from "./knowledgeBase";
import { DocumentMetadata } from "@/models/documentMetadata.model";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StructuredTool, tool } from "@langchain/core/tools";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { toneMatcherSystemPrompt } from "@/system_prompts/system_prompts";

interface ToolsResult {
  toolsList: StructuredTool[];
  toolsNode: ToolNode;
}

const saveToKBSchema = z.object({
  content: z.string().describe("Turinys skirtas išsaugoti konteksto (žinių) duomenų bazėje"),
  title: z.string().optional().describe("Pavadinimas skirtas išsaugotam turiniui"),
  company: z.string().default("Vidinis įrašas").describe("Įmonės pavadinimas, susijęs su turiniu"),
  language: z.string().default("lt").describe("Turinio kalba, pvz., 'lt' (lietuvių), 'en' (anglų) ir pan."),
});


const toneMatcherSchema = z.object({
  ad_copy: z.string().describe("Sugeneruoto reklamos teksto turinys, kurį reikia patikrinti"),
  channel: z.enum(["Facebook", "Instagram", "LinkedIn", "TikTok", "Google", "Twitter", "Email"])
    .describe("Platforma, kuriai skirta reklama"),
});

const toneMatcherResponseSchema = z.object({
  platform_match: z.boolean().describe("Ar tekstas atitinka platformos toną"),
  analysis: z.string().describe("Išsami tono analizė"),
  suggested_revision: z.string().describe("Patobulintas tekstas, jei reikia")
});

export const saveToKnowledgeBase = tool(
  async ({ content, title, company, language }) => {
    try {
      const doc_id = `saved_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const metadata: DocumentMetadata = {
        source: "ai_išsaugotas_atsakymas",
        company: company ?? "Vidinis įrašas",
        language: language ?? "lt",
        doc_type: "išsaugotas_atsakymas",
        doc_id,
        title: title ?? "Naudotojo išsaugotas atsakymas",
        created_at: new Date().toISOString(),
      }
      const document = new LangChainDocument({
        pageContent: content,
        metadata
      });

      await vectorStore.addDocuments([document]);
      return `Pasirinktas turinys sėkmingai išsaugotas duomenų bazėje su ID: ${doc_id}`;
    } catch (error) {
      console.error("Error saving to knowledge baseKlai:", error);
      return `Turinio nepavyko išsaugoti duomenų bazėje: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "save_to_knowledge_base",
    description: "Išsaugok turinį konteksto (žinių) duomenų bazėje ateities naudojimui. Naudok šią komandą, kai naudotojas paprašys tavęs išsaugoti ar įsiminti nurodytą turinį.",
    schema: saveToKBSchema,
  }
);





export function createToneMatcherTool(llm: ChatAnthropic | ChatGoogleGenerativeAI | ChatOpenAI<ChatOpenAICallOptions>) {
  return tool(
    async ({ ad_copy, channel }) => {
      try {
        const pseudoUserPrompt = `
          Analizuok šį reklamos tekstą:
          Reklamos tekstas: "${ad_copy}"
          Platforma: ${channel}
          Pateik tono analizę ir rekomendacijas.`

        const llmWithSchema = llm.withStructuredOutput(toneMatcherResponseSchema);
        const result = await llmWithSchema.invoke([
          ["system", toneMatcherSystemPrompt],
          ["user", pseudoUserPrompt]
        ]);
        // console.log("Tone matcher result:", result);
        return `
        ## Ar tonas tinkamas platformai (${channel}) - ${result.platform_match ? '✅ Tinkamas' : '❌ Netinkamas'}
        ## Analizė:
        ${result.analysis}
        ## Siūlomas patobulinimas: ${result.suggested_revision ?? 'nereikalingas'}`;
      } catch (error) {
        console.error("Error in tone matcher tool:", error);
        return `Klaida analizuojant toną: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "analyze_tone_match",
      description: "Analizuoja, ar reklamos teksto tonas atitinka nurodytą platformą ir prekės ženklo balsą. Jei reikia, siūlo pataisymus.",
      schema: toneMatcherSchema,
    }
  );
}


export function createTools(llm: ChatAnthropic | ChatGoogleGenerativeAI | ChatOpenAI<ChatOpenAICallOptions>): ToolsResult {
  const toneMatcher = createToneMatcherTool(llm)
  const toolsList = [saveToKnowledgeBase, toneMatcher];
  const toolsNode = new ToolNode(toolsList);

  return {
    toolsList,
    toolsNode
  };
}