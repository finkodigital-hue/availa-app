import type { GalleryConfig } from "./types";

export function Gallery({ config }: { config: GalleryConfig }) {
  const photos = config.photos.slice(0, config.layout);
  const placeholders = Math.max(0, config.layout - photos.length);

  return (
    <section className="grid grid-cols-3 gap-2 sm:gap-3">
      {photos.map((p, i) => (
        <div key={i} className="aspect-square rounded-xl overflow-hidden bg-secondary">
          <img
            src={p.url}
            alt={p.alt ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
      {Array.from({ length: placeholders }).map((_, i) => (
        <div
          key={`placeholder-${i}`}
          className="aspect-square rounded-xl border border-dashed bg-secondary/40 grid place-items-center text-xs text-muted-foreground"
        >
          No photo
        </div>
      ))}
    </section>
  );
}
