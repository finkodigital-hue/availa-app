import type { CSSProperties } from "react";

/**
 * The Bookzenvo wordmark. Carries its own typeface, weight and tracking so it
 * renders identically on every page regardless of that page's font setup.
 * Size comes from the caller (a class), so page-level overrides still work.
 */
const WORDMARK_STYLE: CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontWeight: 680,
  letterSpacing: "-0.065em",
  lineHeight: 1,
};

export function Wordmark({
  className = "",
  dotClassName = "",
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span className={`lp-wordmark ${className}`.trim()} style={WORDMARK_STYLE}>
      Bookzenvo<span className={dotClassName}>.</span>
    </span>
  );
}
