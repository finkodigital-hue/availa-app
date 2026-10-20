import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/software-notices")({
  head: () => ({
    meta: [
      { title: "Software notices — Bookzenvo" },
      {
        name: "description",
        content:
          "Third-party software acknowledgements and licences for Bookzenvo.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://bookzenvo.com/software-notices" },
    ],
  }),
  component: SoftwareNoticesPage,
});

function SoftwareNoticesPage() {
  const [notices, setNotices] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/third-party-notices.txt", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load notices");
        return response.text();
      })
      .then(setNotices)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const entries =
    notices
      ?.split(/^={80}\r?\n(?=[^\r\n]+\r?\nDeclared licence:)/m)
      .slice(1)
      .map((entry) => {
        const [name, licence, source, ...body] = entry.trim().split(/\r?\n/);
        return { name, licence, source, body: body.join("\n").trim() };
      }) ?? [];
  const query = search.trim().toLowerCase();
  const filtered = entries.filter((entry) =>
    `${entry.name} ${entry.licence}`.toLowerCase().includes(query),
  );

  return (
    <LegalPage
      eyebrow="Acknowledgements"
      title="Software notices"
      intro="Bookzenvo uses third-party software. We thank its authors and contributors for their work. You can read the licences and copyright notices below."
      lastUpdated="20 October 2026"
      sections={[
        {
          title: "Third-party licences",
          content: (
            <>
              <p>
                The original authors retain the rights granted or reserved by
                their licences.
              </p>
              <a
                href="/third-party-notices.txt"
                download
                className="inline-flex font-semibold text-foreground underline underline-offset-4"
              >
                Download all software notices (.txt)
              </a>
              {failed ? (
                <p role="alert">
                  We couldn’t load the licence list. Please refresh this page or
                  use the download link above to read the full notices.
                </p>
              ) : notices === null ? (
                <p role="status">Loading software notices…</p>
              ) : (
                <>
                  <div className="pt-4">
                    <label
                      htmlFor="licence-search"
                      className="block font-medium text-foreground mb-2"
                    >
                      Search software or licence
                    </label>
                    <input
                      id="licence-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="e.g. React or MIT"
                      className="w-full rounded-lg border border-border bg-white px-4 py-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                    />
                  </div>
                  <p role="status">
                    {filtered.length} of {entries.length} software notices
                  </p>
                  <div className="space-y-3">
                    {filtered.map((entry) => (
                      <details
                        key={entry.name}
                        className="rounded-xl border border-border bg-white px-5 py-4"
                      >
                        <summary className="cursor-pointer text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
                          <span className="font-semibold break-words">
                            {entry.name}
                          </span>
                          <span className="block pl-4 text-sm text-muted-foreground">
                            {entry.licence}
                          </span>
                        </summary>
                        <div className="mt-4 border-t border-border pt-4">
                          <p className="break-words text-sm">{entry.source}</p>
                          <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted-foreground">
                            {entry.body}
                          </pre>
                        </div>
                      </details>
                    ))}
                    {filtered.length === 0 && (
                      <p>
                        No software notices match your search. Try a different
                        software name or licence.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          ),
        },
      ]}
    />
  );
}
