import { z } from "zod";
import { vectorStore } from "../knowledgeBase";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import axios from "axios";
import { Page, PlaywrightWebBaseLoader } from "@langchain/community/document_loaders/web/playwright";
import { chromium } from "playwright";
import { StateAnnotation } from "./graph";

const retrieveSchema = z.object({
  query: z.string(),
  company: z.string()
});

const webSearchSchema = z.object({
  query: z.string()
});

const KNOWN_COMPANIES = [
  "Denticija",
  "Era Dental",
  "Evadenta",
  "Geros buhalterės",
  "ID Clinic",
  "Orto Vita",
  "Pabridentas",
  "Savi",
  "Vingio klinika"
];

interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export const retrieveTool = tool(
  async ({ query, company }) => {
    console.log('RETRIEVE started')
    const foundCompany = KNOWN_COMPANIES.find(name =>
      company.toLowerCase().includes(name.toLowerCase())
    );
    const companyFilter = foundCompany ? { company: foundCompany } : undefined;
    const retrievedDocs = await vectorStore.similaritySearch(query, 4, companyFilter);

    // Filter out duplicates by pageContent (or use another unique property if needed)
    const uniqueDocs = [];
    const seenContents = new Set<string>();
    for (const doc of retrievedDocs) {
      if (!seenContents.has(doc.pageContent)) {
        uniqueDocs.push(doc);
        seenContents.add(doc.pageContent);
      }
      if (uniqueDocs.length >= 4) break;
    }

    const serialized = uniqueDocs
      .map((doc, index) => `
    Reklama: ${index + 1}
    Turinys: ${doc.pageContent}
    Įmonė: ${doc.metadata.company}
    `).join("\n");

    console.log('RETRIEVE completed')
    return [serialized, uniqueDocs];
  },
  {
    name: "retrieve",
    description: "Surink informaciją, susijusią su užklausa.",
    schema: retrieveSchema,
    responseFormat: "content_and_artifact",
  }
);

export const webSearchTool = tool(
  async ({ query }) => {
    console.log('WEB_SEARCH started')
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return { error: "Query is missing or empty" };
    }
    const params = {
      q: query,
      location: "Lithuania",
      hl: "lt",
      gl: "lt",
      apiKey: process.env.SERPER_API_KEY
    };

    try {
      const response = await axios.get("https://google.serper.dev/search", { params });
      if (!response.data || !response.data.organic) {
        return { error: "No search results found" };
      }
      const searchedLinks: string[] = response.data.organic.map((result: WebSearchResult) => result.link);
      console.log('WEB_SEARCH completed')
      return searchedLinks;
    } catch (err) {
      console.error("Serper error:", err);
      return { error: "Web search failed" };
    }
  },
  {
    name: "web_search",
    description: "Ieškok aktualios informacijos internete.",
    schema: webSearchSchema,
    responseFormat: "content"
  }
);

export const augmentToolNode = new ToolNode([retrieveTool, webSearchTool]);

export async function scrapeLinksFromHomePage(
  state: typeof StateAnnotation.State
): Promise<{ extractedLinksFromHomePage: string[], branch: 'continue' | 'end' }> {
  console.log('scrapeLinksFromHomePage started')
  const { filteredLinkAfterSearch: filteredLinks } = state;
  const homeUrl = filteredLinks[0];
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const extractedLinks: string[] = await page.$$eval('a', as => as.map(a => a.href));
    const uniqueLinks = Array.from(new Set(extractedLinks)).filter(href => href.startsWith(homeUrl.split('/').slice(0, 3).join('/')));
    await browser.close();
    console.log('scrapeLinksFromHomePage completed')
    return { extractedLinksFromHomePage: uniqueLinks, branch: 'continue' };
  } catch (error) {
    console.error("Error extracting links:", error);
    return { extractedLinksFromHomePage: [], branch: 'end' };
  }
}

export async function scrapeServiceContent(
  state: typeof StateAnnotation.State
): Promise<{ scrapedServiceContent: string, linksUsedForScraping: string[] }> {
  console.log('scrapeServiceContent started')
  const { filteredLinkAfterSearch } = state;
  const { filteredLinkAfterHomePage } = state;

  let filteredLinks: string[] = [];
  if (filteredLinkAfterHomePage?.length > 0) {
    filteredLinks = filteredLinkAfterHomePage
  } else {
    filteredLinks = filteredLinkAfterSearch;
  }

  let allContent = "";

  const serviceLoader = new PlaywrightWebBaseLoader(filteredLinks[0], {
    launchOptions: { headless: true },
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 30000 },
    async evaluate(page) {
      const content = await extractCleanPageContent(page);
      const keywords = [
        "Atsiliepimai", "Kitos mūsų paslaugos", "Komentarai", "Teiraukitės",
        "Registracija", "Susijusios paslaugos", "Paslaugų kainos", "Dažniausiai užduodami klausimai"
      ];
      const cleanedContent = removeContentAfterKeywords(content, keywords);
      return cleanedContent.substring(0, 4000);
    }
  });
  const docs = await serviceLoader.load();
  for (const doc of docs) {
    if (allContent.length < 4000) { // ~5000 tokens
      allContent += doc.pageContent.substring(0, 4000 - allContent.length);
    } else {
      allContent += "\n...(content truncated due to length)";
      break;
    }
  }

  if (!allContent) {
    return {
      scrapedServiceContent: "Nerasta paslaugos informacijos šioje svetainėje.",
      linksUsedForScraping: filteredLinks
    }
  }

  console.log("scrapeServiceContent completed")
  return {
    scrapedServiceContent: `Surinkta informacija apie paslaugą:\n${allContent}`,
    linksUsedForScraping: filteredLinks
  };
}

async function extractCleanPageContent(page: Page): Promise<string> {
  console.log('extractCleanPageContent started')
  await page.waitForLoadState("networkidle").catch(() => { });

  // Remove unwanted layout elements
  await page.evaluate(() => {
    const selectorsToRemove = [
      'nav', 'footer', '.cookie-banner', '.ads', 'header',
      '.header', '#header', '.navigation', '.menu', '.sidebar',
      '.ad', '.social-links', 'script', 'style', 'noscript',
      'iframe', '.popup', '.modal', '.banner', '.newsletter'
    ];
    selectorsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });
  });

  const title = await page.title();
  const mainContent = await page.evaluate(() => {
    const contentSelectors = [
      'main', 'article', '.content', '#content', '.main',
      '.article', '.post', '.page-content'
    ];
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) return element.innerText;
    }
    return document.body.innerText;
  });
  console.log('extractCleanPageContent completed')
  return `${title}\n\n${mainContent}`;
}

function removeContentAfterKeywords(content: string, keywords: string[]): string {
  const lowerContent = content.toLowerCase();
  let minIndex = content.length;

  for (const keyword of keywords) {
    const idx = lowerContent.indexOf(keyword.toLowerCase());
    if (idx !== -1 && idx < minIndex) {
      minIndex = idx;
    }
  }

  // If a keyword was found, cut the content at its position
  if (minIndex < content.length) {
    return content.substring(0, minIndex).trim();
  }
  return content;
}