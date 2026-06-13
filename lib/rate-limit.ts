// lib/rate-limit.ts
//
// Rate limiter berbasis Upstash Redis (gratis tier cukup untuk CMS internal).
// Tambahkan env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// (otomatis terisi kalau pakai Vercel Upstash integration).
//
// npm install @upstash/ratelimit @upstash/redis

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

// Limit berbeda per jenis route — sesuaikan cost API masing-masing.
export const articleRateLimit = new Ratelimit({
  redis,
  prefix: "ratelimit:generate-article",
  limiter: Ratelimit.slidingWindow(8, "1 m"),
})

export const humanizeRateLimit = new Ratelimit({
  redis,
  prefix: "ratelimit:humanize-article",
  limiter: Ratelimit.slidingWindow(8, "1 m"),
})

export const captionRateLimit = new Ratelimit({
  redis,
  prefix: "ratelimit:generate-social-captions",
  limiter: Ratelimit.slidingWindow(10, "1 m"),
})

export const publishXRateLimit = new Ratelimit({
  redis,
  prefix: "ratelimit:publish-to-x",
  limiter: Ratelimit.slidingWindow(5, "1 m"),
})

export const imageRateLimit = new Ratelimit({
  redis,
  prefix: "ratelimit:generate-image",
  limiter: Ratelimit.slidingWindow(10, "1 m"),
})

// Helper kecil agar pemanggilan di route seragam
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const result = await limiter.limit(identifier)
  return result
}
