import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { ModelResponse } from "@/models/modelResponse.model";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const REDIS = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});
const RATE_LIMITER = new Ratelimit({
  redis: REDIS,
  limiter: Ratelimit.fixedWindow(15, "2 m"),
});

export async function checkRateLimit(modelName: LargeLanguageModel): Promise<ModelResponse | null> {
  try {
    const { success } = await RATE_LIMITER.limit("user_id");

    if (!success) {
      return {
        model: modelName,
        content: "❌ Rate limit exceeded. Please try again later."
      };
    }
    return null; // No rate limit hit
  } catch (error) {
    console.error("Rate limit check error:", error);
    return null; // Continue in case of error
  }
}