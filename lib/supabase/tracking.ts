import { createClient } from "./client"

export async function trackArticleView(articleId: string) {
  const supabase = createClient()
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const now = new Date()
  const dayName = days[now.getDay()]
  const weekNumber = Math.ceil(now.getDate() / 7)

  await Promise.all([
    supabase.from("page_views").insert({
      article_id: articleId,
      day_of_week: dayName,
      week_number: weekNumber,
    }),
    supabase.rpc("increment_views", { article_id: articleId }),
  ])
}