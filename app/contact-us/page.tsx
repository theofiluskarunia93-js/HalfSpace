import type { Metadata } from "next"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { Mail, Briefcase, MessageSquare, Clock, ChevronRight } from "lucide-react"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"

export async function generateMetadata(): Promise<Metadata> {
  const title = "Contact Us | HalfSpace"
  const description =
    "Hubungi tim HalfSpace untuk kemitraan strategis, kolaborasi konten, dan peluang bisnis di industri media olahraga."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/contact-us`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/contact-us`,
      siteName: "HalfSpace",
      images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og-default.jpg`],
    },
  }
}

// ─── JSON-LD Schema ─────────────────────────────────────────────────────────
const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact HalfSpace",
  url: `${BASE_URL}/contact-us`,
  description:
    "Halaman kontak resmi HalfSpace untuk kemitraan strategis dan kolaborasi bisnis.",
  inLanguage: "id-ID",
  publisher: {
    "@type": "Organization",
    name: "HalfSpace",
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/og-default.jpg`,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "business partnerships",
        email: "partnership@halfspacesport.com",
        availableLanguage: ["Indonesian", "English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "editorial",
        email: "redaksi@halfspacesport.com",
        availableLanguage: ["Indonesian"],
      },
    ],
  },
}

// ─── Static partnership categories ──────────────────────────────────────────
const partnershipTypes = [
  {
    icon: Briefcase,
    title: "Kemitraan Bisnis",
    desc: "Peluang sponsorship, brand activation, dan kolaborasi komersial jangka panjang bersama platform media olahraga tumbuh-cepat.",
    email: "partnership@halfspacesport.com",
    tag: "Partnership",
  },
  {
    icon: MessageSquare,
    title: "Kolaborasi Konten",
    desc: "Kesempatan co-branding, native advertising, guest article, dan produksi konten bersama untuk menjangkau audiens pecinta olahraga.",
    email: "content@halfspacesport.com",
    tag: "Content",
  },
  {
    icon: Mail,
    title: "Hubungi Redaksi",
    desc: "Tips berita, koreksi editorial, atau pertanyaan seputar liputan. Tim redaksi kami siap merespons dalam 1×24 jam kerja.",
    email: "redaksi@halfspacesport.com",
    tag: "Editorial",
  },
]

export default function ContactUsPage() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageSchema) }}
      />

      <div className="min-h-screen bg-background">
        <NavbarStandalone />

        <main className="mx-auto min-h-[60vh] max-w-4xl px-4 py-12">

          {/* ── Page Header ── */}
          <div className="mb-12">
            <h1
              className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Contact Us
            </h1>
            <div
              className="h-1 w-20 bg-primary"
              style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }}
            />
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Kami terbuka untuk diskusi yang bermakna. Apakah Anda membawa peluang
              kemitraan, ide kolaborasi konten, atau sekadar ingin terhubung — silakan
              pilih jalur yang paling sesuai di bawah ini.
            </p>
          </div>

          {/* ── Partnership Cards ── */}
          <section aria-label="Jenis kontak" className="mb-16">
            <div className="grid gap-5 md:grid-cols-3">
              {partnershipTypes.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.tag}
                    className="group relative flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                  >
                    {/* Tag */}
                    <span className="mb-4 inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                      {item.tag}
                    </span>

                    {/* Icon */}
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>

                    {/* Content */}
                    <h2
                      className="mb-2 text-lg font-bold text-foreground"
                      style={{ fontFamily: "var(--font-oswald)" }}
                    >
                      {item.title}
                    </h2>
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      {item.desc}
                    </p>

                    {/* Email CTA */}
                    <a
                      href={`mailto:${item.email}`}
                      className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                      {item.email}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── What We're Looking For ── */}
          <section
            aria-label="Kriteria kemitraan"
            className="mb-16 rounded-xl border border-border bg-card p-8"
          >
            <h2
              className="mb-6 text-2xl font-bold uppercase tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Apa yang Kami Cari
            </h2>
            <p className="mb-6 text-muted-foreground leading-relaxed">
              HalfSpace dibangun di atas prinsip jurnalisme olahraga yang kredibel dan
              dekat dengan komunitas. Kami secara selektif menjalin kemitraan dengan
              pihak-pihak yang berbagi nilai yang sama:
            </p>
            <ul className="space-y-3">
              {[
                "Brand atau lembaga yang relevan dengan ekosistem olahraga — sportswear, teknologi, gaming, media, atau pendidikan.",
                "Mitra yang menghargai editorial independence dan tidak mengintervensi arah konten.",
                "Kolaborasi berbasis nilai jangka panjang, bukan sekadar transaksional.",
                "Organisasi atau individu dengan track record dan reputasi yang dapat diverifikasi.",
              ].map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Response Time Notice ── */}
          <section
            aria-label="Waktu respons"
            className="mb-16 flex items-start gap-4 rounded-xl border border-border/60 bg-card/50 p-6"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3
                className="mb-1 text-base font-bold text-foreground"
                style={{ fontFamily: "var(--font-oswald)" }}
              >
                Waktu Respons
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Kami membaca setiap pesan yang masuk. Untuk pertanyaan kemitraan dan
                kolaborasi bisnis, kami berupaya merespons dalam{" "}
                <span className="font-semibold text-foreground">2–3 hari kerja</span>.
                Untuk pertanyaan editorial, dalam{" "}
                <span className="font-semibold text-foreground">1 hari kerja</span>.
                Pesan yang tidak relevan atau bersifat spam tidak akan ditindaklanjuti.
              </p>
            </div>
          </section>

          {/* ── Direct Email Block ── */}
          <section
            aria-label="Email langsung"
            className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center"
          >
            <h2
              className="mb-2 text-2xl font-bold uppercase tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Kirim Email Langsung
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Tidak yakin harus menghubungi siapa? Gunakan alamat utama ini dan tim kami
              akan meneruskan ke departemen yang tepat.
            </p>
            <a
              href="mailto:hello@halfspacesport.com"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              style={{ fontFamily: "var(--font-oswald)", letterSpacing: "0.03em" }}
            >
              <Mail className="h-4 w-4" />
              hello@halfspacesport.com
            </a>
          </section>

        </main>

        <FooterStandalone />
      </div>
    </>
  )
}
