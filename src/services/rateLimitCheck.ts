import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const REDIS = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});
const RATE_LIMITER = new Ratelimit({
  redis: REDIS,
  limiter: Ratelimit.fixedWindow(3, "2 m"),
});

export async function checkRateLimit(): Promise<{ generatedContent: string } | null> {
  try {
    const { success } = await RATE_LIMITER.limit("user_id");

    if (!success) {
      return {
        generatedContent: "❌ Rate limit exceeded. Please try again a bit later."
      };
    }
    return null;
  } catch (error) {
    console.error("Rate limit check error:", error);
    return null;
  }
}