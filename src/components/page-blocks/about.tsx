import type { AboutConfig } from "./types";

export function About({ config }: { config: AboutConfig }) {
  return (
    <section className="rounded-2xl border bg-card p-8 sm:p-10">
      <div
        className={config.photoUrl ? "grid sm:grid-cols-[auto_1fr] gap-6 items-start" : undefined}
      >
        {config.photoUrl && (
          <img
            src={config.photoUrl}
            alt=""
            className="h-24 w-24 rounded-2xl object-cover shrink-0"
          />
        )}
        <div>
          {config.heading && <h2 className="font-display text-2xl mb-3">{config.heading}</h2>}
          <p className="text-muted-foreground text-pretty whitespace-pre-line">{config.bio}</p>
        </div>
      </div>
    </section>
  );
}
