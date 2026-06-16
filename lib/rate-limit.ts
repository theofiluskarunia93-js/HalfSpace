// lib/rate-limit.ts
//
// Rate limiter in-memory sederhana — TIDAK butuh Upstash/Redis/env var apapun.
// Cocok untuk single-instance / CMS internal. Limit reset tiap restart server,
// dan tidak akurat 100% di environment serverless multi-instance — tapi cukup
// untuk mencegah penyalahgunaan tombol generate berulang-ulang.

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Bersihkan entry expired sesekali biar Map tidak membengkak
function cleanup() {
  const now = Date.now()
  for (const [key, bucket] of store.entries()) {
    if (now > bucket.resetAt) store.delete(key)
  }
}

/**
 * @param key        identifier unik (mis. user.id + nama route)
 * @param limit      jumlah request maksimum
 * @param windowMs   durasi window dalam milidetik
 */
function limit(key: string, limit: number, windowMs: number): { success: boolean } {
  cleanup()
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true }
  }

  if (bucket.count >= limit) {
    return { success: false }
  }

  bucket.count += 1
  return { success: true }
}

const MINUTE = 60_000

export const articleRateLimit = {
  limit: async (id: string) => limit(`generate-article:${id}`, 8, MINUTE),
}

export const humanizeRateLimit = {
  limit: async (id: string) => limit(`humanize-article:${id}`, 8, MINUTE),
}

export const captionRateLimit = {
  limit: async (id: string) => limit(`generate-social-captions:${id}`, 10, MINUTE),
}

export const imageRateLimit = {
  limit: async (id: string) => limit(`generate-image:${id}`, 10, MINUTE),
}
