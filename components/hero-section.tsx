import Image from "next/image"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background py-10 md:py-16">
      {/* Stadium Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/stadium-bg.jpg"
          alt=""
          fill
          className="object-cover opacity-60"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
      </div>

      {/* Glow Effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 text-center">
        <h1
          className="mb-3 text-4xl font-black uppercase tracking-tighter text-foreground md:text-5xl lg:text-6xl"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          Home to{" "}
          <span
            className="text-primary"
            style={{
              textShadow:
                "0 0 20px oklch(0.87 0.29 142 / 0.8), 0 0 40px oklch(0.87 0.29 142 / 0.6), 0 0 60px oklch(0.87 0.29 142 / 0.4)",
            }}
          >
            Sport
          </span>{" "}
          Enthusiast
        </h1>
        <p className="text-sm text-white/70 md:text-base">
          Your ultimate destination for{" "}
          <span
            className="font-medium text-primary"
            style={{ textShadow: "0 0 10px oklch(0.87 0.29 142 / 0.5)" }}
          >
            sports news
          </span>
          ,{" "}
          <span
            className="font-medium text-primary"
            style={{ textShadow: "0 0 10px oklch(0.87 0.29 142 / 0.5)" }}
          >
            live scores
          </span>
          , and comprehensive coverage.
        </p>

        {/* Decorative Line */}
        <div
          className="mx-auto mt-6 h-1 w-20 bg-primary"
          style={{
            boxShadow:
              "0 0 10px oklch(0.87 0.29 142 / 0.8), 0 0 20px oklch(0.87 0.29 142 / 0.6)",
          }}
        />
      </div>
    </section>
  )
}
