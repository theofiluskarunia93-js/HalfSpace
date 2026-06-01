import type { Metadata } from "next"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { Shield, Eye, Cookie, Lock, UserCheck, RefreshCw, Mail } from "lucide-react"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"

// ─── Last updated date ────────────────────────────────────────────────────────
// Update tanggal ini setiap kali ada perubahan material pada kebijakan
const LAST_UPDATED = "1 Juni 2025"

export async function generateMetadata(): Promise<Metadata> {
  const title = "Privacy Policy | HalfSpace"
  const description =
    "Kebijakan Privasi HalfSpace — bagaimana kami mengumpulkan, menggunakan, dan melindungi data Anda sebagai pengguna platform media olahraga kami."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/privacy-policy`,
    },
    // Halaman legal: boleh diindeks tapi tidak perlu masuk hasil pencarian utama
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/privacy-policy`,
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

// ─── JSON-LD Schema ────────────────────────────────────────────────────────────
const privacyPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Privacy Policy — HalfSpace",
  url: `${BASE_URL}/privacy-policy`,
  description:
    "Kebijakan Privasi HalfSpace — transparansi penuh tentang bagaimana kami mengelola data pengguna.",
  inLanguage: "id-ID",
  dateModified: "2025-06-01",
  publisher: {
    "@type": "Organization",
    name: "HalfSpace",
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/og-default.jpg`,
    },
  },
  about: {
    "@type": "Thing",
    name: "Kebijakan Privasi",
    description: "Dokumen yang menjelaskan praktik pengumpulan dan pengelolaan data pengguna oleh HalfSpace.",
  },
}

// ─── Section helper ───────────────────────────────────────────────────────────
interface SectionProps {
  id: string
  icon: React.ElementType
  title: string
  children: React.ReactNode
}

function Section({ id, icon: Icon, title, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <h2
          id={`${id}-heading`}
          className="text-xl font-bold text-foreground"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          {title}
        </h2>
      </div>
      <div className="rounded-xl border border-border bg-card px-6 py-5 text-sm leading-relaxed text-muted-foreground space-y-3">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(privacyPageSchema) }}
      />

      <div className="min-h-screen bg-background">
        <NavbarStandalone />

        <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-12">

          {/* ── Page Header ── */}
          <div className="mb-12">
            <h1
              className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Privacy Policy
            </h1>
            <div
              className="h-1 w-20 bg-primary"
              style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }}
            />
            <p className="mt-5 text-sm text-muted-foreground">
              Terakhir diperbarui:{" "}
              <span className="font-medium text-foreground">{LAST_UPDATED}</span>
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Privasi Anda penting bagi kami. Dokumen ini menjelaskan secara jelas dan
              transparan bagaimana HalfSpace (<strong className="text-foreground">halfspace.id</strong>)
              mengumpulkan, menggunakan, dan menjaga keamanan data Anda. Mohon baca
              dengan seksama sebelum menggunakan layanan kami.
            </p>
          </div>

          {/* ── Quick Summary ── */}
          <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
            <h2
              className="mb-3 text-lg font-bold text-foreground"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Ringkasan Singkat
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "✅  Kami mengumpulkan data minimum yang diperlukan untuk menjalankan layanan.",
                "✅  Kami tidak menjual data Anda kepada pihak ketiga.",
                "✅  Data Anda tidak dibagikan tanpa izin Anda, kecuali diwajibkan oleh hukum.",
                "✅  Kami menggunakan cookie untuk meningkatkan pengalaman membaca Anda.",
                "✅  Anda berhak meminta akses atau penghapusan data Anda kapan saja.",
              ].map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>

          {/* ── 1. Siapa Kami ── */}
          <Section id="who-we-are" icon={Shield} title="1. Siapa Kami">
            <p>
              HalfSpace adalah platform media olahraga digital yang beroperasi di bawah
              domain <strong className="text-foreground">halfspace.id</strong>. Kami
              menyediakan berita, analisis, skor langsung, dan klasemen liga sepak bola
              dari seluruh dunia.
            </p>
            <p>
              Untuk pertanyaan terkait privasi, Anda dapat menghubungi kami di:{" "}
              <a
                href="mailto:privacy@halfspace.id"
                className="font-medium text-primary hover:underline"
              >
                privacy@halfspace.id
              </a>
            </p>
          </Section>

          {/* ── 2. Data yang Kami Kumpulkan ── */}
          <Section id="data-collected" icon={Eye} title="2. Data yang Kami Kumpulkan">
            <p>
              Kami hanya mengumpulkan data yang benar-benar diperlukan untuk menjalankan
              layanan, yaitu:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="text-foreground">Data akun</strong> — jika Anda
                mendaftar atau login (nama, alamat email). Disimpan secara aman melalui
                Supabase Auth.
              </li>
              <li>
                <strong className="text-foreground">Data komentar</strong> — nama dan isi
                komentar yang Anda kirimkan pada artikel.
              </li>
              <li>
                <strong className="text-foreground">Data penggunaan anonim</strong> —
                halaman yang dikunjungi, artikel yang dibaca, durasi sesi. Data ini tidak
                dapat digunakan untuk mengidentifikasi Anda secara personal.
              </li>
              <li>
                <strong className="text-foreground">Data teknis</strong> — jenis browser,
                sistem operasi, dan alamat IP (diproses secara anonim untuk keperluan
                keamanan).
              </li>
            </ul>
            <p>
              Kami <strong className="text-foreground">tidak</strong> mengumpulkan nomor
              kartu kredit, nomor identitas, atau informasi sensitif lainnya.
            </p>
          </Section>

          {/* ── 3. Bagaimana Kami Menggunakan Data ── */}
          <Section id="data-usage" icon={UserCheck} title="3. Bagaimana Kami Menggunakan Data">
            <p>Data yang dikumpulkan digunakan semata-mata untuk:</p>
            <ul className="ml-4 list-disc space-y-2">
              <li>Menyediakan dan meningkatkan layanan platform HalfSpace.</li>
              <li>Menampilkan konten yang relevan berdasarkan preferensi bacaan Anda.</li>
              <li>Memproses dan menampilkan komentar yang Anda kirimkan.</li>
              <li>Menganalisis tren penggunaan secara agregat untuk pengembangan fitur.</li>
              <li>Memastikan keamanan dan mencegah penyalahgunaan platform.</li>
            </ul>
            <p>
              Kami <strong className="text-foreground">tidak</strong> menggunakan data
              Anda untuk iklan bertarget pihak ketiga, profiling, atau pengambilan
              keputusan otomatis yang berdampak signifikan pada Anda.
            </p>
          </Section>

          {/* ── 4. Berbagi Data dengan Pihak Ketiga ── */}
          <Section id="third-party" icon={Lock} title="4. Berbagi Data dengan Pihak Ketiga">
            <p>
              <strong className="text-foreground">
                Kami tidak menjual, menyewakan, atau memperdagangkan data pribadi Anda
                kepada pihak ketiga dalam bentuk apapun.
              </strong>
            </p>
            <p>Data Anda hanya dapat dibagikan dalam kondisi terbatas berikut:</p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="text-foreground">Penyedia infrastruktur teknis</strong> —
                Supabase (database & autentikasi) dan Vercel (hosting). Kedua penyedia
                ini terikat kontrak pengolahan data yang ketat dan beroperasi sesuai
                standar keamanan industri.
              </li>
              <li>
                <strong className="text-foreground">Kewajiban hukum</strong> — jika
                diwajibkan oleh peraturan perundang-undangan Indonesia yang berlaku atau
                perintah pengadilan yang sah.
              </li>
            </ul>
            <p>
              Dalam setiap kondisi di atas, data yang dibagikan dibatasi hanya pada
              informasi yang secara spesifik diperlukan.
            </p>
          </Section>

          {/* ── 5. Cookie ── */}
          <Section id="cookies" icon={Cookie} title="5. Cookie & Teknologi Pelacakan">
            <p>
              HalfSpace menggunakan <strong className="text-foreground">cookie</strong> —
              file teks kecil yang disimpan di perangkat Anda — untuk meningkatkan
              pengalaman menggunakan platform kami.
            </p>
            <p>Jenis cookie yang kami gunakan:</p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="text-foreground">Cookie esensial</strong> — diperlukan
                untuk fungsi dasar platform, termasuk manajemen sesi login. Cookie ini
                tidak dapat dinonaktifkan.
              </li>
              <li>
                <strong className="text-foreground">Cookie analitik</strong> — membantu
                kami memahami bagaimana pengunjung menggunakan situs (misalnya halaman
                paling populer). Data ini bersifat anonim dan agregat.
              </li>
              <li>
                <strong className="text-foreground">Cookie preferensi</strong> — menyimpan
                pengaturan Anda (misalnya tema atau bahasa) agar tidak perlu diatur ulang
                setiap kunjungan.
              </li>
            </ul>
            <p>
              Anda dapat menonaktifkan cookie non-esensial melalui pengaturan browser
              Anda. Namun, beberapa fitur platform mungkin tidak berfungsi secara optimal
              jika cookie dinonaktifkan sepenuhnya.
            </p>
          </Section>

          {/* ── 6. Keamanan Data ── */}
          <Section id="security" icon={Shield} title="6. Keamanan Data">
            <p>
              Kami menerapkan langkah-langkah teknis dan organisasional yang sesuai
              dengan standar industri untuk melindungi data Anda, antara lain:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>Enkripsi data saat transit menggunakan protokol HTTPS/TLS.</li>
              <li>
                Penyimpanan data melalui Supabase yang dilindungi enkripsi di-rest
                dan isolasi tingkat baris (Row Level Security).
              </li>
              <li>Akses ke data produksi dibatasi hanya pada personel yang berwenang.</li>
              <li>Audit keamanan berkala terhadap sistem dan dependensi platform.</li>
            </ul>
            <p>
              Meskipun demikian, tidak ada sistem digital yang 100% aman. Jika Anda
              menduga terjadi pelanggaran keamanan terkait data Anda, segera hubungi
              kami di{" "}
              <a
                href="mailto:privacy@halfspace.id"
                className="font-medium text-primary hover:underline"
              >
                privacy@halfspace.id
              </a>
              .
            </p>
          </Section>

          {/* ── 7. Hak Anda ── */}
          <Section id="your-rights" icon={UserCheck} title="7. Hak-Hak Anda">
            <p>
              Sebagai pengguna, Anda memiliki hak-hak berikut terkait data pribadi Anda:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="text-foreground">Hak akses</strong> — meminta salinan
                data pribadi yang kami miliki tentang Anda.
              </li>
              <li>
                <strong className="text-foreground">Hak koreksi</strong> — meminta
                perbaikan data yang tidak akurat atau tidak lengkap.
              </li>
              <li>
                <strong className="text-foreground">Hak penghapusan</strong> — meminta
                penghapusan data Anda dari sistem kami ("right to be forgotten").
              </li>
              <li>
                <strong className="text-foreground">Hak keberatan</strong> — menolak
                pemrosesan data untuk tujuan tertentu.
              </li>
            </ul>
            <p>
              Untuk menggunakan hak-hak di atas, kirimkan permintaan ke{" "}
              <a
                href="mailto:privacy@halfspace.id"
                className="font-medium text-primary hover:underline"
              >
                privacy@halfspace.id
              </a>{" "}
              dengan subjek <em>"Data Request"</em>. Kami akan merespons dalam 14 hari
              kerja.
            </p>
          </Section>

          {/* ── 8. Retensi Data ── */}
          <Section id="retention" icon={RefreshCw} title="8. Retensi Data">
            <p>
              Kami menyimpan data Anda selama diperlukan untuk tujuan yang tercantum
              dalam kebijakan ini, atau selama akun Anda aktif. Secara spesifik:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>Data akun disimpan selama akun aktif + 30 hari setelah penghapusan.</li>
              <li>
                Data analitik anonim disimpan hingga 24 bulan sebelum dihapus secara
                otomatis.
              </li>
              <li>
                Komentar yang dihapus oleh pengguna segera dihapus dari tampilan publik
                dan dari database dalam 7 hari.
              </li>
            </ul>
          </Section>

          {/* ── 9. Anak-Anak ── */}
          <Section id="children" icon={Shield} title="9. Perlindungan Anak">
            <p>
              HalfSpace tidak secara sengaja mengumpulkan data pribadi dari anak-anak di
              bawah usia 13 tahun. Jika Anda percaya bahwa anak Anda secara tidak sengaja
              memberikan data pribadi kepada kami, hubungi kami segera dan kami akan
              menghapus data tersebut.
            </p>
          </Section>

          {/* ── 10. Perubahan Kebijakan ── */}
          <Section id="changes" icon={RefreshCw} title="10. Perubahan Kebijakan Ini">
            <p>
              Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Jika ada
              perubahan yang material (signifikan), kami akan memberikan pemberitahuan
              melalui banner di halaman utama atau melalui email kepada pengguna
              terdaftar setidaknya 7 hari sebelum perubahan berlaku.
            </p>
            <p>
              Tanggal pembaruan terakhir selalu tercantum di bagian atas halaman ini.
              Penggunaan berkelanjutan atas layanan kami setelah perubahan diberlakukan
              dianggap sebagai persetujuan Anda terhadap kebijakan yang telah diperbarui.
            </p>
          </Section>

          {/* ── 11. Kontak ── */}
          <Section id="contact" icon={Mail} title="11. Hubungi Kami">
            <p>
              Untuk pertanyaan, permintaan, atau kekhawatiran seputar privasi Anda,
              jangan ragu menghubungi tim kami:
            </p>
            <p>
              📧{" "}
              <a
                href="mailto:privacy@halfspace.id"
                className="font-medium text-primary hover:underline"
              >
                privacy@halfspace.id
              </a>
            </p>
            <p>
              Kami berkomitmen untuk merespons setiap permintaan terkait privasi dalam
              waktu <strong className="text-foreground">14 hari kerja</strong>.
            </p>
          </Section>

        </main>

        <FooterStandalone />
      </div>
    </>
  )
}
