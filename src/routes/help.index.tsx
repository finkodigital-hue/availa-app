import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Rocket,
  LayoutTemplate,
  Scissors,
  CalendarCheck,
  UserCircle,
  Package,
  CreditCard,
  BarChart3,
  Settings,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { HELP_CATEGORIES, HELP_ARTICLES, type HelpArticle } from "@/lib/help-content";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "Help Centre — Bookzenvo" },
      {
        name: "description",
        content:
          "Guides and answers for getting the most out of Bookzenvo — booking pages, staff, payments, reports and more.",
      },
    ],
  }),
  component: HelpCentre,
});

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
    </span>
  );
}

function Mark() {
  return (
    <span className="precision-mark" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

const ICONS: Record<string, LucideIcon> = {
  Rocket,
  LayoutTemplate,
  Scissors,
  CalendarCheck,
  UserCircle,
  Package,
  CreditCard,
  BarChart3,
  Settings,
  ShieldCheck,
  Upload,
};

function articleHaystack(article: HelpArticle) {
  const blockText = article.blocks.flatMap((block) => {
    if (block.type === "steps" || block.type === "list") return block.items;
    return [block.text];
  });
  return [article.title, article.summary, ...(article.keywords ?? []), ...blockText]
    .join(" ")
    .toLowerCase();
}

function ArticleCard({ article, showCategory }: { article: HelpArticle; showCategory?: boolean }) {
  const category = HELP_CATEGORIES.find((c) => c.slug === article.categorySlug);
  return (
    <Link
      to="/help/$slug"
      params={{ slug: article.slug }}
      className="card-hover rounded-xl border border-border bg-white p-5 flex flex-col"
    >
      {showCategory && category && (
        <div className="text-[.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold-deep)] mb-2">
          {category.title}
        </div>
      )}
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-semibold text-[.95rem] leading-snug">{article.title}</h3>
        {article.studioOnly && (
          <Badge variant="gold" className="shrink-0">
            Studio
          </Badge>
        )}
      </div>
      <p className="text-[.83rem] text-muted-foreground leading-relaxed">{article.summary}</p>
    </Link>
  );
}

function HelpCentre() {
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const tokens = q.split(/\s+/).filter(Boolean);
    return HELP_ARTICLES.filter((article) => {
      const hay = articleHaystack(article);
      return tokens.every((t) => hay.includes(t));
    });
  }, [query]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[1120px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <Wordmark className="text-[1.5rem]" />
          </Link>
          <Link
            to={!loading && user ? "/dashboard" : "/"}
            className="text-[.9rem] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {!loading && user ? "Back to dashboard" : "Back to home"}
          </Link>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-16 md:py-20">
        <div className="flex items-center mb-4">
          <Mark />
          <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
            Help Centre
          </span>
        </div>
        <h1 className="font-display font-medium text-[clamp(2.2rem,5vw,3.4rem)] tracking-[-0.02em] leading-[1.05] max-w-[18ch] mb-4">
          How can we help?
        </h1>
        <p className="text-[1.05rem] text-[color:var(--charcoal-soft)] max-w-[52ch] mb-8">
          Answers for setting up your booking page, running your calendar, and everything else in
          Bookzenvo.
        </p>

        <div className="relative max-w-[540px] mb-14">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for anything — “staff holidays”, “import”, “2FA”…"
            className="h-12 pl-10 rounded-[8px] text-[.95rem]"
            aria-label="Search the Help Centre"
          />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {HELP_CATEGORIES.map((category) => {
            const Icon = ICONS[category.icon] ?? Rocket;
            const count = HELP_ARTICLES.filter((a) => a.categorySlug === category.slug).length;
            return (
              <a
                key={category.slug}
                href={`#${category.slug}`}
                onClick={() => setQuery("")}
                className="card-hover rounded-xl border border-border bg-white p-6 flex flex-col"
              >
                <div className="h-10 w-10 rounded-lg bg-[color:var(--gold-wash)] grid place-items-center mb-4">
                  <Icon className="h-5 w-5 text-[color:var(--gold-deep)]" />
                </div>
                <h3 className="font-display font-semibold text-[1.2rem] mb-1">{category.title}</h3>
                <p className="text-[.85rem] text-muted-foreground mb-3">{category.description}</p>
                <span className="mt-auto text-[.75rem] font-semibold text-[color:var(--gold-deep)]">
                  {count} article{count === 1 ? "" : "s"}
                </span>
              </a>
            );
          })}
        </div>

        {results ? (
          <div className="mb-16">
            <p className="text-[.85rem] text-muted-foreground mb-5">
              {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </p>
            {results.length === 0 ? (
              <div className="rounded-xl border border-border bg-white px-6 py-10 text-center text-muted-foreground text-[.9rem]">
                Nothing matched that search. Try a different term, or browse categories above.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {results.map((article) => (
                  <ArticleCard key={article.slug} article={article} showCategory />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-14">
            {HELP_CATEGORIES.map((category) => {
              const articles = HELP_ARTICLES.filter((a) => a.categorySlug === category.slug);
              if (!articles.length) return null;
              return (
                <section key={category.slug} id={category.slug} className="scroll-mt-24">
                  <h2 className="font-display font-medium text-[1.6rem] mb-1">{category.title}</h2>
                  <p className="text-muted-foreground text-[.9rem] mb-5">{category.description}</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {articles.map((article) => (
                      <ArticleCard key={article.slug} article={article} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-[1120px] mx-auto px-6 text-[.85rem] text-muted-foreground">
          © {new Date().getFullYear()} Bookzenvo — can't find what you need? Reach out from inside the
          app via Contact support.
        </div>
      </footer>
    </div>
  );
}
