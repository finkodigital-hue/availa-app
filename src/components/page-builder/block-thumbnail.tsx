import type { BlockType } from "@/components/page-blocks";

// Small static wireframe mockups for the "Add block" picker — not real
// screenshots, just enough shape per type that owners recognize it at a
// glance without reading the label.
export function BlockThumbnail({ type }: { type: BlockType }) {
  return (
    <div className="h-16 w-full rounded-md bg-secondary/40 p-2.5 flex flex-col justify-center gap-1.5 overflow-hidden">
      {type === "hero" && (
        <>
          <div className="h-1.5 w-2/3 rounded-full bg-foreground/25" />
          <div className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
          <div className="h-3 w-10 rounded-full bg-primary/50 mt-1" />
        </>
      )}
      {type === "about" && (
        <div className="flex gap-2 items-center">
          <div className="h-10 w-10 rounded bg-foreground/15 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-foreground/20" />
            <div className="h-1.5 w-4/5 rounded-full bg-foreground/15" />
            <div className="h-1.5 w-3/5 rounded-full bg-foreground/10" />
          </div>
        </div>
      )}
      {type === "gallery" && (
        <div className="grid grid-cols-3 gap-1 h-full">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-sm bg-foreground/15" />
          ))}
        </div>
      )}
      {type === "services-list" && (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-1.5 w-2/3 rounded-full bg-foreground/20" />
              <div className="h-1.5 w-6 rounded-full bg-primary/40" />
            </div>
          ))}
        </div>
      )}
      {type === "staff-spotlight" && (
        <div className="flex gap-2 justify-center items-center h-full">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-8 rounded-full bg-foreground/15" />
          ))}
        </div>
      )}
      {type === "testimonial" && (
        <div className="space-y-1.5 text-center">
          <div className="mx-auto h-1.5 w-4/5 rounded-full bg-foreground/20" />
          <div className="mx-auto h-1.5 w-3/5 rounded-full bg-foreground/15" />
          <div className="mx-auto h-1.5 w-1/4 rounded-full bg-primary/40 mt-1" />
        </div>
      )}
      {type === "hours-location" && (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-1.5 w-1/3 rounded-full bg-foreground/20" />
              <div className="h-1.5 w-1/4 rounded-full bg-foreground/10" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
