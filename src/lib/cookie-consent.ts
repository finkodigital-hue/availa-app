// Client-side record of a visitor's cookie/local-storage consent choice for
// the public site (marketing pages + /book/*). The app currently sets zero
// non-essential cookies or storage, so "accept" and "reject" both leave
// behavior unchanged today — the recorded choice exists so that if/when an
// analytics or marketing category is actually wired up, it can check this
// flag before loading anything. Bump CONSENT_VERSION when that happens (or
// whenever the categories on offer change) so everyone gets re-prompted
// instead of an old choice silently covering a category it never saw.
export const CONSENT_STORAGE_KEY = "bz_cookie_consent";
export const CONSENT_VERSION = 1;

export interface ConsentChoice {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  version: number;
  decidedAt: string;
}

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentChoice;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(choice: { analytics: boolean; marketing: boolean }): ConsentChoice {
  const full: ConsentChoice = {
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(full));
  }
  return full;
}

export function acceptAllChoice(): ConsentChoice {
  return writeConsent({ analytics: true, marketing: true });
}

export function rejectNonEssentialChoice(): ConsentChoice {
  return writeConsent({ analytics: false, marketing: false });
}
