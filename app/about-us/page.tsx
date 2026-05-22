import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"

export const metadata = {
  title: "About Us - HalfSpace",
  description: "Mengenal HalfSpace, media olahraga untuk para pencinta sepak bola.",
}

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />
      <main className="mx-auto min-h-[60vh] max-w-4xl px-4 py-12">
        <div className="mb-10">
          <h1
            className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            About Us
          </h1>
          <div className="h-1 w-20 bg-primary" style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }} />
        </div>

        <div className="prose prose-invert max-w-none">
          <div className="rounded-xl border border-border bg-card p-8">
            <h2 className="mb-4 text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
              HalfSpace — Home to Sport Enthusiast
            </h2>
            <p className="mb-6 text-muted-foreground leading-relaxed">
              HalfSpace adalah media olahraga yang lahir dari kecintaan terhadap sepak bola. 
              Kami hadir untuk menjadi rumah bagi para penggemar yang ingin mengikuti berita, 
              analisis, dan perkembangan terkini dari liga-liga terbaik dunia.
            </p>
            <p className="mb-6 text-muted-foreground leading-relaxed">
              Dari Champions League hingga Liga 1 Indonesia, dari transfer window hingga berita 
              timnas — semuanya tersaji di satu tempat, ditulis dari perspektif fans untuk fans.
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                { label: "Liputan", value: "15+ Liga", desc: "dari seluruh dunia" },
                { label: "Misi", value: "From Fans", desc: "to fans" },
                { label: "Update", value: "24/7", desc: "berita terkini" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-primary/5 p-6 text-center">
                  <div className="text-xs font-semibold uppercase tracking-widest text-primary">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>{item.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <FooterStandalone />
    </div>
  )
}
