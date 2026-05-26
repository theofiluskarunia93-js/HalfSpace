"use client"

import { useState, useRef, useEffect } from "react"
import { Upload, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export function SettingsView() {
  const [siteName, setSiteName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [twitterHandle, setTwitterHandle] = useState("")
  const [instagramHandle, setInstagramHandle] = useState("")
  const [tiktokHandle, setTiktokHandle] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFileName, setLogoFileName] = useState<string | null>(null)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [showFootballWidgets, setShowFootballWidgets] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from("site_settings").select("*").single()
      if (data) {
        setSettingsId(data.id)
        setSiteName(data.site_name || "")
        setContactEmail(data.contact_email || "")
        setTwitterHandle(data.twitter_handle || "")
        setInstagramHandle(data.instagram_handle || "")
        setTiktokHandle(data.tiktok_handle || "")
        setLogoUrl(data.logo_url || null)
        setLogoPreview(data.logo_url || null)
        setShowFootballWidgets(data.show_football_widgets !== false)
      }
      setIsLoading(false)
    }
    loadSettings()
  }, [])

  const handleLogoClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoFileName(file.name)

    // Preview lokal
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    // Upload ke Supabase Storage
    const fileExt = file.name.split(".").pop()
    const fileName = `logo-${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true })

    if (!error && data) {
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName)
      setLogoUrl(urlData.publicUrl)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    const payload = {
      site_name: siteName,
      contact_email: contactEmail,
      twitter_handle: twitterHandle,
      instagram_handle: instagramHandle,
      tiktok_handle: tiktokHandle,
      logo_url: logoUrl,
      show_football_widgets: showFootballWidgets,
      updated_at: new Date().toISOString(),
    }

    const { error } = settingsId
      ? await supabase.from("site_settings").update(payload).eq("id", settingsId)
      : await supabase.from("site_settings").insert(payload)

    setIsSaving(false)
    setMessage(error
      ? { type: "error", text: error.message }
      : { type: "success", text: "Settings saved successfully!" }
    )
    setTimeout(() => setMessage(null), 3000)
  }

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading settings...</div>
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
          Settings
        </h1>
        <p className="text-muted-foreground">Manage your website configuration</p>
      </div>

      <div className="max-w-2xl space-y-8">
        {/* Logo */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Website Logo</h2>
          <div className="flex items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/50 overflow-hidden">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-2xl font-bold text-primary" style={{ fontFamily: "var(--font-oswald)" }}>HS</span>
              )}
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden" onChange={handleFileChange} />
              <Button variant="outline" onClick={handleLogoClick}
                className="border-border text-foreground hover:border-primary hover:text-primary">
                <Upload className="mr-2 h-4 w-4" />
                Upload New Logo
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                {logoFileName || "Recommended: 200x200px, PNG or SVG"}
              </p>
            </div>
          </div>
        </div>

        {/* Site Details */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Site Details</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Site Name</label>
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)}
                className="border-border bg-secondary/50 text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Contact Email</label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                className="border-border bg-secondary/50 text-foreground" />
            </div>
          </div>
        </div>

        {/* Social Media */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Social Media</h2>
          <div className="space-y-4">
            {[
              { label: "Twitter/X Handle", value: twitterHandle, onChange: setTwitterHandle },
              { label: "Instagram Handle", value: instagramHandle, onChange: setInstagramHandle },
              { label: "TikTok Handle", value: tiktokHandle, onChange: setTiktokHandle },
            ].map((field) => (
              <div key={field.label}>
                <label className="mb-2 block text-sm font-medium text-foreground">{field.label}</label>
                <Input value={field.value} onChange={(e) => field.onChange(e.target.value)}
                  className="border-border bg-secondary/50 text-foreground" />
              </div>
            ))}
          </div>
        </div>

        {/* Widget Display */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-semibold text-foreground">Widget Sepakbola</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Tampilkan atau sembunyikan widget Live Score, Standings, dan Top Scorer di halaman utama.
            Jika disembunyikan, bagian Trending dan Editor Choice akan langsung diikuti Footer.
          </p>
          <label className="flex cursor-pointer items-center gap-4">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={showFootballWidgets}
                onChange={(e) => setShowFootballWidgets(e.target.checked)}
              />
              <div
                className={`h-6 w-11 rounded-full transition-colors ${showFootballWidgets ? "bg-primary" : "bg-secondary"}`}
              />
              <div
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${showFootballWidgets ? "translate-x-5" : "translate-x-0"}`}
              />
            </div>
            <span className="text-sm font-medium text-foreground">
              {showFootballWidgets ? "Widget ditampilkan" : "Widget disembunyikan"}
            </span>
          </label>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          {message && (
            <span className={`text-sm ${message.type === "success" ? "text-primary" : "text-destructive"}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}