import { OpenAIEmbeddings } from "@langchain/openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocumentMetadata } from "../models/documentMetadata.model";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import fs from "fs";
import path from "path";
import { Document as LangChainDocument } from "@langchain/core/documents";
import { sanitizeAd } from "@/utils/knowledgeBaseUtils";

const isProduction = process.env.NODE_ENV === "production";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
});

export const vectorStore = new Chroma(embeddings, {
  collectionName: "pdf-docs-collection",
  url: isProduction ? process.env.CHROMA_DB_URL : "http://127.0.0.1:8000"
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1300,
  chunkOverlap: 40,
  separators: ["\n\n", "\n", ". ", " ", ""],
});


function getPdfFilesFromDirectory(directoryPath: string): string[] {
  return fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith(".pdf"));
}

async function loadPdfDocuments(
  directoryPath: string,
  pdfFilenames: string[]
): Promise<LangChainDocument[]> {
  const loadedDocs = await Promise.all(
    pdfFilenames.map(async (filename) => {
      const fullPath = path.join(directoryPath, filename);
      const loader = new PDFLoader(fullPath, {
        splitPages: false,
      });
      const docs = await loader.load();

      const filteredDocs = docs.filter((doc) => doc.pageContent.trim().length > 0);
      const baseFilename = path.basename(filename, ".pdf").trim();

      filteredDocs.forEach((doc) => {
        const metadata: DocumentMetadata = {
          source: "pdf",
          filename,
          company: baseFilename,
          language: "lt",
          doc_type: "advertisement",
          doc_id: `${baseFilename}-full`,
        };
        doc.metadata = metadata;
      });

      console.log(`📄 Loaded full document from ${filename}`);
      return filteredDocs;
    })
  );

  return loadedDocs.flat();
}

async function getSplittedDocuments(): Promise<LangChainDocument[]> {
  const directoryPath = "src/document_loaders/";
  const files = getPdfFilesFromDirectory(directoryPath);
  const documents = await loadPdfDocuments(directoryPath, files);

  const allFinalChunks: LangChainDocument[] = [];
  for (const doc of documents) {
    const baseContent = doc.pageContent;
    const baseMeta = doc.metadata;
    const ads = baseContent.split("###").map(ad => ad.trim()).filter(ad => ad.length > 0);

    for (const ad of ads) {
      const sanitizedAdWithMetadata = sanitizeAd(ad, baseMeta.company, baseMeta.filename);
      if (sanitizedAdWithMetadata.pageContent.length > 1200) {
        const subChunks = await splitter.splitDocuments([sanitizedAdWithMetadata]);
        subChunks.forEach(chunk => {
          if (chunk.metadata.loc) {
            chunk.metadata.id = `${chunk.metadata.company}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
          }
          allFinalChunks.push(chunk);
        })
      } else {
        allFinalChunks.push(sanitizedAdWithMetadata);
      }
    }
  }

  return allFinalChunks;
}

export async function loadKnowledgeBase() {
  try {
    const allSplits = await getSplittedDocuments();
    console.log(`📚 Prepared ${allSplits.length} document chunks for storage.`);
    await vectorStore.addDocuments(allSplits);
    console.log("✅ Documents successfully added to vector store.");
  } catch (error) {
    console.error("❌ Failed to load knowledge base:", error);
  }
}

// loadKnowledgeBase()