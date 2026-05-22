import Image from "next/image"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 md:py-32">
      {/* Stadium Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/stadium-bg.jpg"
          alt=""
          fill
          className="object-cover opacity-70"
          priority
        />
        {/* Lighter gradient overlay - only darkens bottom so text stays readable */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
      </div>

      {/* Glow Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 text-center">
        <h1 
          className="mb-4 text-5xl font-black uppercase tracking-tighter text-foreground md:text-7xl lg:text-8xl"
          style={{ fontFamily: 'var(--font-oswald)' }}
        >
          Home to{" "}
          <span 
            className="text-primary"
            style={{
              textShadow: '0 0 20px oklch(0.87 0.29 142 / 0.8), 0 0 40px oklch(0.87 0.29 142 / 0.6), 0 0 60px oklch(0.87 0.29 142 / 0.4)'
            }}
          >
            Sport
          </span>
          <br />
          Enthusiast
        </h1>
        <p className="text-sm text-white/70 md:text-base">
          Your ultimate destination for{" "}
          <span className="font-medium text-primary" style={{ textShadow: '0 0 10px oklch(0.87 0.29 142 / 0.5)' }}>
            sports news
          </span>
          ,{" "}
          <span className="font-medium text-primary" style={{ textShadow: '0 0 10px oklch(0.87 0.29 142 / 0.5)' }}>
            live scores
          </span>
          , and comprehensive coverage.
        </p>
        
        {/* Decorative Line with glow */}
        <div 
          className="mx-auto mt-8 h-1 w-24 bg-primary"
          style={{
            boxShadow: '0 0 10px oklch(0.87 0.29 142 / 0.8), 0 0 20px oklch(0.87 0.29 142 / 0.6)'
          }}
        />
      </div>
    </section>
  )
}
