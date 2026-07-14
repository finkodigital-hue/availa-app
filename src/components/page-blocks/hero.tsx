import { cn } from "@/lib/utils";
import type { HeroConfig } from "./types";

export function Hero({ config }: { config: HeroConfig }) {
  const brand = config.brandColor ?? "#8E2A38";
  const brandStyle = { ["--brand" as any]: brand } as React.CSSProperties;

  if (config.variant === "split-screen") {
    return (
      <section
        style={brandStyle}
        className="grid sm:grid-cols-2 min-h-[420px] rounded-2xl overflow-hidden border"
      >
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <HeroCopy config={config} brand={brand} />
        </div>
        <Photo url={config.photoUrl} className="min-h-[240px]" />
      </section>
    );
  }

  if (config.variant === "text-photo") {
    return (
      <section className="rounded-2xl overflow-hidden border">
        <div className="relative h-56 sm:h-72">
          <Photo url={config.photoUrl} className="absolute inset-0" />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 35%, color-mix(in oklab, ${brand} 65%, black) 100%)`,
            }}
          />
        </div>
        <div style={brandStyle} className="p-8 sm:p-12 text-center">
          <HeroCopy config={config} brand={brand} centered />
        </div>
      </section>
    );
  }

  // text-only
  return (
    <section
      style={{
        ...brandStyle,
        background: `linear-gradient(135deg, color-mix(in oklab, ${brand} 12%, transparent), transparent 70%)`,
      }}
      className="rounded-2xl border p-10 sm:p-16 text-center"
    >
      <HeroCopy config={config} brand={brand} centered />
    </section>
  );
}

function Photo({ url, className }: { url?: string | null; className?: string }) {
  if (!url) {
    return (
      <div
        className={cn(
          "bg-secondary grid place-items-center text-sm text-muted-foreground",
          className,
        )}
      >
        No photo
      </div>
    );
  }
  return <img src={url} alt="" className={cn("h-full w-full object-cover", className)} />;
}

function HeroCopy({
  config,
  brand,
  centered,
}: {
  config: HeroConfig;
  brand: string;
  centered?: boolean;
}) {
  return (
    <div className={cn(centered && "mx-auto max-w-xl")}>
      {config.eyebrow && (
        <div className="text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: brand }}>
          {config.eyebrow}
        </div>
      )}
      <h1 className="font-display text-3xl sm:text-4xl text-balance">{config.heading}</h1>
      {config.subheading && (
        <p className="text-muted-foreground mt-3 text-pretty">{config.subheading}</p>
      )}
      {config.ctaLabel && (
        <a
          href={config.ctaHref ?? "#"}
          className="inline-flex items-center justify-center h-11 px-6 rounded-xl text-white text-sm font-medium mt-6 shadow-glow"
          style={{ background: brand }}
        >
          {config.ctaLabel}
        </a>
      )}
    </div>
  );
}
