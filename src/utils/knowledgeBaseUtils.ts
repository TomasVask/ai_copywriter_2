import { Document as LangChainDocument } from "@langchain/core/documents";

export function removeEmojis(text: string): string {
  return text
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{E000}-\u{F8FF}\u{F900}-\u{FAFF}]/gu,
      '' // includes private use area
    )
    .replace(/[📞📱💻🌐📍🔹✅⬇️🦷🧑‍⚕️❌]/g, '');
}

export function sanitizeAd(ad: string, company: string, source: string): LangChainDocument {
  const phoneRegex = /\+370\s?\d{3}\s?\d{4,5}/g;
  const linkRegex = /https?:\/\/\S+|www\.\S+/gi;
  const addressRegex = /S\.?\s?Nėries|Vytauto\s?g\.?|gatvė|Klaipėda|Vilnius|Adresas/i;
  const emojiRegex = /[📞📱💻🌐📍]/;

  const isSensitive = (text: string): boolean => {
    return (
      phoneRegex.test(text) ||
      linkRegex.test(text) ||
      addressRegex.test(text) ||
      emojiRegex.test(text)
    );
  };

  const sanitizeLongSensitiveSentence = (sentence: string): string => {
    const lines = sentence.split(/\n+/);
    const filteredLines = lines.filter(
      (line) =>
        !phoneRegex.test(line) &&
        !linkRegex.test(line) &&
        !addressRegex.test(line) &&
        !emojiRegex.test(line)
    );
    let result = filteredLines.join(" ").trim();

    // If phone number is inline, remove only the number
    result = result.replace(phoneRegex, "").replace(/\s{2,}/g, " ").trim();
    return result;
  };

  const sentences = ad
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sanitizedSentences: string[] = [];

  for (const sentence of sentences) {
    const cleanedSentence = removeEmojis(sentence).trim()
    const wordCount = cleanedSentence.split(/\s+/).length;

    if (linkRegex.test(cleanedSentence)) {
      continue;
    } else if (!isSensitive(cleanedSentence)) {
      sanitizedSentences.push(cleanedSentence);
    } else if (wordCount <= 5) {
      continue;
    } else {
      const cleaned = sanitizeLongSensitiveSentence(cleanedSentence);
      if (cleaned) sanitizedSentences.push(cleaned);
    }
  }

  return new LangChainDocument({
    pageContent: sanitizedSentences.join(" ").trim(),
    metadata: {
      company,
      source,
    },
    id: `${company}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  });
}