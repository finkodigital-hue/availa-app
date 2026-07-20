import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpBlock } from "@/lib/help-content";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/help/$slug")({
  loader: ({ params }) => {
    const article = HELP_ARTICLES.find((a) => a.slug === params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.article.title} — Bookzenvo Help Centre` : "Help Centre" },
      { name: "description", content: loaderData?.article.summary ?? "Bookzenvo Help Centre" },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
        <h1 className="font-display text-3xl mt-4">We couldn't find that article.</h1>
        <p className="text-muted-foreground mt-2">It may have moved or been renamed.</p>
        <Link
          to="/help"
          className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-[color:var(--gold-deep)] hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the Help Centre
        </Link>
      </div>
    </div>
  ),
  component: ArticlePage,
});

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
    </span>
  );
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p":
      return <p className="text-[1rem] leading-[1.7] text-[color:var(--charcoal-soft)]">{block.text}</p>;
    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="shrink-0 h-6 w-6 grid place-items-center rounded-full bg-[color:var(--gold-wash)] text-[color:var(--gold-deep)] text-[.75rem] font-bold mt-0.5">
                {i + 1}
              </span>
              <span className="text-[1rem] leading-[1.7] text-[color:var(--charcoal-soft)] pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[1rem] leading-[1.6] text-[color:var(--charcoal-soft)]">
              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[color:var(--gold)] mt-2.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "note":
      return (
        <div className="rounded-lg border border-[color:var(--gold)]/40 bg-[color:var(--gold-wash)]/50 px-5 py-4 text-[.92rem] leading-[1.6] text-[color:var(--charcoal-soft)]">
          {block.text}
        </div>
      );
  }
}

function ArticlePage() {
  const { article } = Route.useLoaderData();
  const category = HELP_CATEGORIES.find((c) => c.slug === article.categorySlug);
  const related = HELP_ARTICLES.filter(
    (a) => a.categorySlug === article.categorySlug && a.slug !== article.slug,
  ).slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[860px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <Wordmark className="text-[1.5rem]" />
          </Link>
          <Link
            to="/help"
            className="text-[.9rem] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Help Centre
          </Link>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-6 py-16 md:py-20">
        <div className="flex flex-wrap items-center gap-2 text-[.8rem] text-muted-foreground mb-6">
          <Link to="/help" className="hover:text-foreground transition-colors">
            Help Centre
          </Link>
          {category && (
            <>
              <span>/</span>
              <Link to="/help" hash={category.slug} className="hover:text-foreground transition-colors">
                {category.title}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="font-display font-medium text-[clamp(1.9rem,4vw,2.6rem)] tracking-[-0.015em] leading-[1.08]">
            {article.title}
          </h1>
          {article.studioOnly && (
            <Badge variant="gold" className="mt-2 shrink-0">
              Studio plan
            </Badge>
          )}
        </div>
        <p className="text-[1.05rem] text-[color:var(--charcoal-soft)] mb-10">{article.summary}</p>

        <div className="flex flex-col gap-5">
          {article.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>

        {related.length > 0 && (
          <div className="mt-16 pt-10 border-t border-border">
            <h2 className="text-[.75rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-4">
              More in {category?.title}
            </h2>
            <div className="flex flex-col gap-3">
              {related.map((a) => (
                <Link
                  key={a.slug}
                  to="/help/$slug"
                  params={{ slug: a.slug }}
                  className="rounded-lg border border-border bg-white px-5 py-4 hover:border-foreground/20 transition-colors"
                >
                  <div className="font-semibold text-[.9rem]">{a.title}</div>
                  <div className="text-[.82rem] text-muted-foreground mt-0.5">{a.summary}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link
          to="/help"
          className="inline-flex items-center gap-2 mt-12 text-sm font-semibold text-[color:var(--gold-deep)] hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the Help Centre
        </Link>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-[860px] mx-auto px-6 text-[.85rem] text-muted-foreground">
          © {new Date().getFullYear()} Bookzenvo
        </div>
      </footer>
    </div>
  );
}
