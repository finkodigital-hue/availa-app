import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Check,
  Clock,
  Calendar as CalendarIcon,
  User,
  Sun,
  Sunset,
  Moon,
  Loader2,
  Sparkles,
  Search,
  Navigation,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { expandBookingSegments, expandCandidateSegments, segmentsOverlap } from "@/lib/slots";
import { resolveDayPeriods } from "@/lib/staff-hours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { BlockRenderer, type PageBlock } from "@/components/page-blocks";
import { applyThemeVars, themeFontOverrideCss, themedButtonStyle, type Theme } from "@/lib/theme";
import { startBookingCheckout } from "@/lib/stripe-connect.functions";
import { useAuth } from "@/lib/auth";
import { usePortalCustomer } from "@/lib/portal-customer";
import { BookingSignIn } from "@/components/booking-sign-in";
import { AddToCalendar } from "@/components/add-to-calendar";
import { parseStorefrontSettings, type StorefrontSection } from "@/lib/storefront";

// The real public booking page renderer — used both at /book/$slug and,
// embedded/scaled/non-interactive, as the live preview in the setup wizard
// and Design panel. Takes theme and pageBlocks as props rather than reading
// them from the business record, so callers can feed it in-progress
// (unsaved) draft state.
export interface PublicBookingBusiness {
  id: string;
  slug?: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

// A "service" here is always a specific business's variant (its own price,
// duration, id) — the owning business_id is what routes the eventual booking
// to the right business (the salon, or one of its independent pros).
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  description: string | null;
  buffer_before_min?: number | null;
  buffer_after_min?: number | null;
  gap_min?: number | null;
  active_after_min?: number | null;
  color?: string | null;
  business_id: string;
};
type Staff = { id: string; name: string; role: string | null; business_id: string };
type Step = "service" | "staff" | "time" | "info" | "done";

// Services with the same (trimmed, case-insensitive) name across the salon
// and its linked independent pros are shown as one card — customers pick a
// person, not a business, on the next step. Independent pros stay invisible
// as separate businesses throughout.
type ServiceGroup = { key: string; name: string; description: string | null; variants: Service[] };

function groupServices(services: Service[]): ServiceGroup[] {
  const map = new Map<string, Service[]>();
  for (const s of services) {
    const key = s.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries())
    .map(([key, variants]) => ({
      key,
      name: variants[0].name,
      description: variants.find((v) => v.description)?.description ?? null,
      variants,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function priceRange(variants: Service[], currency: string) {
  const prices = variants.map((v) => v.price_cents);
  const min = Math.min(...prices),
    max = Math.max(...prices);
  if (min === max) return fmtMoney(min, currency);
  return `${fmtMoney(min, currency)} to ${fmtMoney(max, currency)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function inferServiceCategory(name: string) {
  const value = name.toLowerCase();
  if (/colour|color|balayage|highlight|tint|foil|bleach|toner/.test(value)) return "Colour";
  if (/extension/.test(value)) return "Extensions";
  if (/treatment|keratin|mask|conditioning/.test(value)) return "Treatments";
  if (/cut|trim|blow|style|hair up/.test(value)) return "Cuts & styling";
  if (/brow|lash|nail|makeup|wax|facial|massage/.test(value)) return "Beauty & finishing";
  return "Other services";
}

function displayTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function durationRange(variants: Service[]) {
  const durations = variants.map((v) => v.duration_minutes);
  const min = Math.min(...durations),
    max = Math.max(...durations);
  return min === max ? `${min} min` : `${min}–${max} min`;
}

const STEPS: { id: Step; label: string }[] = [
  { id: "service", label: "Service" },
  { id: "staff", label: "Staff" },
  { id: "time", label: "Time" },
  { id: "info", label: "Details" },
];

export function PublicBookingPage({
  business,
  theme,
  pageBlocks,
  storefrontSettings,
  domId = "public-booking-page",
  footerExtra,
  renderBlock = (_block, _index, children) => children,
}: {
  business: PublicBookingBusiness;
  theme: Theme;
  pageBlocks: PageBlock[];
  storefrontSettings?: unknown;
  // Callers that embed more than one instance at once (e.g. the wizard's
  // preset grid) must supply a unique id — CSS id selectors match every
  // element sharing that id, so two default instances would leak each
  // other's font overrides.
  domId?: string;
  // Extra content (e.g. a "Cookie settings" link) rendered next to the
  // "Powered by Bookzenvo" footer. Left undefined by the wizard/design-panel
  // preview embeds, which render this component with no consent provider in
  // the tree — only the real /book/$slug route passes it.
  footerExtra?: React.ReactNode;
  // Lets the page-builder canvas wrap each rendered block with a
  // hover/select/drag-handle shell without forking BlockRenderer or the
  // block components themselves. Real visitors and every other embed get
  // the identity default.
  renderBlock?: (block: PageBlock, index: number, children: React.ReactNode) => React.ReactNode;
}) {
  const biz = business;
  const currency = business.currency ?? "GBP";
  const [step, setStep] = useState<Step>("service");
  const [serviceGroup, setServiceGroup] = useState<ServiceGroup | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [time, setTime] = useState<string | null>(null);
  // Captured at the moment of a successful direct booking so the "done"
  // screen's Add-to-calendar event has the TRUE full-span end time (start +
  // duration + gap + active_after for a gap service) without recomputing it
  // from `service` after the fact, where a stale/reset `service` could drift.
  const [bookedEndsAt, setBookedEndsAt] = useState<string | null>(null);
  // Same id the confirmation email's .ics attachment uses as its UID (see
  // confirmation-email.server.ts) — keeping them identical means a client who
  // both downloads from this screen and later opens the emailed attachment
  // gets treated as the SAME calendar event by their calendar app (an update,
  // not a duplicate), rather than two unrelated events for one appointment.
  const [bookedBookingId, setBookedBookingId] = useState<string | null>(null);
  const [info, setInfo] = useState({ name: "", email: "", phone: "", notes: "" });
  const [infoTouched, setInfoTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState<"success" | "cancelled" | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedServices, setExpandedServices] = useState(false);
  const { user: signedInUser } = useAuth();
  const { profile: myProfile } = usePortalCustomer(biz.id);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("payment");
    if (value === "success" || value === "cancelled") setPaymentReturn(value);
  }, []);

  // Prefill from the signed-in visitor's saved details — but only until they
  // start typing themselves, so this never overwrites something they've
  // already edited (e.g. signing in mid-way through, or a slow profile
  // fetch landing after they've already filled the form in as a guest).
  useEffect(() => {
    if (infoTouched || !signedInUser) return;
    setInfo((prev) => ({
      name: prev.name || myProfile?.name || "",
      email: prev.email || signedInUser.email || "",
      phone: prev.phone || myProfile?.phone || "",
      notes: prev.notes,
    }));
  }, [signedInUser, myProfile, infoTouched]);

  const brand = theme.colors.primary;
  const accent = theme.colors.accent;
  const brandStyle = applyThemeVars(theme);
  const storefront = useMemo(
    () => parseStorefrontSettings(storefrontSettings),
    [storefrontSettings],
  );

  // Independent professionals linked to this salon who allow public booking.
  // They're deliberately invisible as separate businesses — this just
  // widens which staff/services are pulled in below.
  const { data: pros } = useQuery({
    queryKey: ["pub-pros", biz.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_public_salon_professionals", {
        _salon_business_id: biz.id,
      });
      // Degrade to salon-only booking (this page's original behavior) if the
      // RPC isn't available yet — e.g. its migration hasn't been applied —
      // rather than getting the whole booking page stuck.
      if (error) return [];
      return (data ?? []) as {
        pro_business_id: string;
        chair_label: string | null;
        display_order: number;
      }[];
    },
  });

  const proBusinessIds = useMemo(() => (pros ?? []).map((p) => p.pro_business_id), [pros]);
  const bizIds = useMemo(() => [biz.id, ...proBusinessIds], [biz.id, proBusinessIds]);

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ["pub-services", biz.id, proBusinessIds.join(",")],
    enabled: pros !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, duration_minutes, price_cents, description, buffer_before_min, buffer_after_min, gap_min, active_after_min, color, business_id",
        )
        .in("business_id", bizIds)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: openingHours = [] } = useQuery({
    queryKey: ["pub-business-hours", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, open_time, close_time, closed")
        .eq("business_id", biz.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: galleryPhotos = [] } = useQuery({
    queryKey: ["public-storefront-gallery", biz.id],
    queryFn: async () => {
      const response = await fetch(`/api/public-gallery?business_id=${encodeURIComponent(biz.id)}`);
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        photos?: { id: string; kind: string; url: string }[];
      };
      return payload.photos ?? [];
    },
  });

  const serviceGroups = useMemo(() => groupServices(services ?? []), [services]);
  const serviceCategories = useMemo(() => {
    const categories = new Map<string, ServiceGroup[]>();
    for (const group of serviceGroups) {
      const category = inferServiceCategory(group.name);
      categories.set(category, [...(categories.get(category) ?? []), group]);
    }
    return Array.from(categories, ([name, groups]) => ({ name, groups }));
  }, [serviceGroups]);
  useEffect(() => {
    if (!activeCategory && serviceCategories.length > 0)
      setActiveCategory(serviceCategories[0].name);
  }, [activeCategory, serviceCategories]);
  const visibleServiceGroups = useMemo(() => {
    const needle = serviceSearch.trim().toLowerCase();
    if (needle)
      return serviceGroups.filter((group) =>
        `${group.name} ${group.description ?? ""}`.toLowerCase().includes(needle),
      );
    return (
      serviceCategories.find((category) => category.name === activeCategory)?.groups ??
      serviceGroups
    );
  }, [activeCategory, serviceCategories, serviceGroups, serviceSearch]);
  const sortedOpeningHours = useMemo(
    () => [...openingHours].sort((a, b) => a.weekday - b.weekday),
    [openingHours],
  );

  const { data: allStaff, isLoading: loadingStaff } = useQuery({
    queryKey: ["pub-staff", serviceGroup?.key, proBusinessIds.join(",")],
    enabled: !!serviceGroup,
    queryFn: async () => {
      const variants = serviceGroup!.variants;
      const variantIds = variants.map((v) => v.id);
      const linkedRes = await supabase
        .from("service_staff")
        .select("staff_id, service_id")
        .in("service_id", variantIds);
      const linkedByService = new Map<string, string[]>();
      for (const row of linkedRes.data ?? []) {
        const arr = linkedByService.get(row.service_id) ?? [];
        arr.push(row.staff_id);
        linkedByService.set(row.service_id, arr);
      }
      // A variant with no explicit service_staff links is bookable with any
      // of that business's staff (existing single-business behavior),
      // preserved per-business here.
      const staffIds = new Set<string>();
      const fallbackBizIds: string[] = [];
      for (const v of variants) {
        const linked = linkedByService.get(v.id);
        if (linked && linked.length > 0) linked.forEach((id) => staffIds.add(id));
        else fallbackBizIds.push(v.business_id);
      }
      const results: Staff[] = [];
      if (staffIds.size > 0) {
        const { data, error } = await (supabase as any)
          .from("public_staff")
          .select("id, name, role, business_id")
          .in("id", Array.from(staffIds));
        if (error) throw error;
        results.push(...(data as Staff[]));
      }
      if (fallbackBizIds.length > 0) {
        const { data, error } = await (supabase as any)
          .from("public_staff")
          .select("id, name, role, business_id")
          .in("business_id", fallbackBizIds);
        if (error) throw error;
        results.push(...(data as Staff[]));
      }
      const dedup = Array.from(new Map(results.map((s) => [s.id, s])).values());
      dedup.sort((a, b) => a.name.localeCompare(b.name));
      return dedup;
    },
  });

  const { data: dayData, isLoading: loadingDay } = useQuery({
    queryKey: ["pub-day", service?.business_id, staff?.id, date.toDateString()],
    enabled: !!staff && !!service,
    queryFn: async () => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const weekday = date.getDay();
      const [hoursR, periodsR, staffHoursR, bookingsR, blockedR] = await Promise.all([
        supabase
          .from("business_hours")
          .select("*")
          .eq("business_id", service!.business_id)
          .eq("weekday", weekday)
          .maybeSingle(),
        supabase
          .from("business_hour_periods")
          .select("open_time, close_time")
          .eq("business_id", service!.business_id)
          .eq("weekday", weekday)
          .order("open_time"),
        supabase
          .from("staff_hours")
          .select("closed, open_time, close_time, repeat_weeks, repeat_anchor")
          .eq("staff_id", staff!.id)
          .eq("weekday", weekday)
          .maybeSingle(),
        (supabase as any)
          .from("public_booking_slots")
          .select("starts_at, ends_at, gap_min, active_after_min")
          .eq("business_id", service!.business_id)
          .eq("staff_id", staff!.id)
          .gte("starts_at", dayStart.toISOString())
          .lte("starts_at", dayEnd.toISOString()),
        supabase
          .from("blocked_dates")
          .select("*")
          .eq("business_id", service!.business_id)
          .lt("starts_at", dayEnd.toISOString())
          .gt("ends_at", dayStart.toISOString()),
      ]);
      return {
        periods: resolveDayPeriods({
          weekday,
          staffHours: staffHoursR.data as any,
          bizPeriods: (periodsR.data ?? []) as any,
          bizHours: hoursR.data as any,
          date,
        }),
        bookings: (bookingsR.data ?? []) as {
          starts_at: string;
          ends_at: string;
          gap_min: number | null;
          active_after_min: number | null;
        }[],
        blocked: blockedR.data ?? [],
      };
    },
  });

  const slots = useMemo(() => {
    if (!service || !dayData?.periods?.length) return [];
    const slotMin = 15;
    const bufBefore = service.buffer_before_min ?? 0;
    const bufAfter = service.buffer_after_min ?? 0;
    const gapMin = service.gap_min ?? 0;
    const activeAfterMin = service.active_after_min ?? 0;
    const totalMin = service.duration_minutes + bufBefore + bufAfter + gapMin + activeAfterMin;
    const result: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    const existingSegments = dayData.bookings.map((b) => expandBookingSegments(b));
    for (const period of dayData.periods) {
      const [oh, om] = period.open_time.split(":").map(Number);
      const [ch, cm] = period.close_time.split(":").map(Number);
      const open = new Date(date);
      open.setHours(oh, om, 0, 0);
      const close = new Date(date);
      close.setHours(ch, cm, 0, 0);
      for (
        let t = new Date(open);
        t.getTime() + totalMin * 60000 <= close.getTime();
        t = new Date(t.getTime() + slotMin * 60000)
      ) {
        if (t < now) continue;
        const candidateSegments = expandCandidateSegments(t.getTime(), service);
        const conflict = existingSegments.some((segs) => segmentsOverlap(candidateSegments, segs));
        const blocked = dayData.blocked.some((b: any) => {
          if (b.staff_id && b.staff_id !== staff?.id) return false;
          const blockedSeg = [
            { start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() },
          ];
          return segmentsOverlap(candidateSegments, blockedSeg);
        });
        if (!conflict && !blocked) {
          const start = new Date(t.getTime() + bufBefore * 60000);
          result.push({
            time: start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            iso: start.toISOString(),
            hour: start.getHours(),
          });
        }
      }
    }
    return result;
  }, [service, dayData, date, staff]);

  const grouped = useMemo(
    () => ({
      morning: slots.filter((s) => s.hour < 12),
      afternoon: slots.filter((s) => s.hour >= 12 && s.hour < 17),
      evening: slots.filter((s) => s.hour >= 17),
    }),
    [slots],
  );

  // 14-day strip
  const dayStrip = useMemo(() => {
    const arr: Date[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isValidPhone = (v: string) => {
    if (!v.trim()) return true;
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  };
  const sanitizePhone = (v: string) => v.replace(/[^\d\s+()\-.]/g, "");

  const pickGroup = (g: ServiceGroup) => {
    setServiceGroup(g);
    setService(null);
    setStaff(null);
    setTime(null);
    setStep("staff");
  };

  const pickStaff = (p: Staff) => {
    const variant = serviceGroup?.variants.find((v) => v.business_id === p.business_id);
    if (!variant) return;
    setService(variant);
    setStaff(p);
    setStep("time");
  };

  const book = async () => {
    if (!service || !staff || !time) return;
    if (!info.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!isValidEmail(info.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (info.phone.trim() && !isValidPhone(info.phone)) {
      toast.error("Please enter a valid phone number.");
      return;
    }

    setSubmitting(true);
    try {
      const starts_at = time;
      const gapMin = service.gap_min ?? 0;
      const activeAfterMin = service.active_after_min ?? 0;
      const totalMin = service.duration_minutes + gapMin + activeAfterMin;
      const ends_at = new Date(new Date(starts_at).getTime() + totalMin * 60000).toISOString();
      const { data: clashRows } = await (supabase as any)
        .from("public_booking_slots")
        .select("starts_at, ends_at, gap_min, active_after_min")
        .eq("staff_id", staff.id)
        .lt("starts_at", ends_at)
        .gt("ends_at", starts_at);
      const candidateSegments = expandCandidateSegments(new Date(starts_at).getTime(), service);
      const clash = (clashRows ?? []).some((b: any) =>
        segmentsOverlap(candidateSegments, expandBookingSegments(b)),
      );
      if (clash) {
        toast.error("That slot was just taken — pick another.");
        setStep("time");
        setTime(null);
        setSubmitting(false);
        return;
      }
      const checkout = await startBookingCheckout({
        data: {
          businessId: service.business_id,
          serviceId: service.id,
          staffId: staff.id,
          customerName: info.name,
          customerEmail: info.email,
          customerPhone: info.phone,
          startsAt: starts_at,
          endsAt: ends_at,
          notes: info.notes,
          returnPath: window.location.pathname,
        },
      });
      if (checkout.checkoutUrl) {
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      const { data: bookingId, error } = await supabase.rpc("create_public_booking", {
        p_business_id: service.business_id,
        p_service_id: service.id,
        p_staff_id: staff.id,
        p_customer_name: info.name,
        p_customer_email: info.email || "",
        p_customer_phone: info.phone || "",
        p_starts_at: starts_at,
        p_ends_at: ends_at,
        p_notes: info.notes || "",
        p_gap_min: service.gap_min ?? null,
        p_active_after_min: service.active_after_min ?? null,
      });
      if (error) throw error;
      setBookedEndsAt(ends_at);
      setBookedBookingId(bookingId ?? null);
      setStep("done");
      if (bookingId) {
        // Best-effort — a dropped/failed call here doesn't lose the
        // confirmation email, the sweep backstop in /api/cron/send-reminders
        // picks up anything still unsent a few minutes later.
        fetch("/api/bookings/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ booking_id: bookingId }),
        }).catch(() => {});
      }
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("SLOT_TAKEN")) {
        toast.error("That slot was just taken — pick another.");
        setStep("time");
        setTime(null);
      } else if (msg.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed — pick another.");
        setStep("time");
        setTime(null);
      } else if (msg.includes("RATE_LIMITED")) {
        toast.error("Too many booking attempts — please wait a few minutes and try again.");
      } else {
        toast.error(msg || "Could not book");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("service");
    setServiceGroup(null);
    setService(null);
    setStaff(null);
    setTime(null);
    setBookedEndsAt(null);
    setBookedBookingId(null);
    setInfo({ name: "", email: "", phone: "", notes: "" });
    setInfoTouched(false);
  };

  const storefrontOwnedBlockTypes = new Set([
    "hero",
    "gallery",
    "services-list",
    "staff-spotlight",
    "testimonial",
    "hours-location",
  ]);
  const customBlocks: PageBlock[] = (pageBlocks ?? []).filter(
    (block) => !storefrontOwnedBlockTypes.has(block.type),
  );
  const gallerySection = storefront.sections.find((section) => section.id === "gallery")!;
  const bookingSection = storefront.sections.find((section) => section.id === "booking")!;
  const locationSection = storefront.sections.find((section) => section.id === "location")!;
  const galleryLimit = Math.max(1, gallerySection.itemLimit);
  const testshopPhotos =
    biz.slug === "testshop"
      ? [
          { id: "testshop-main", kind: "interior", url: "/storefront/testshop-salon-main.jpg" },
          { id: "testshop-wash", kind: "interior", url: "/storefront/testshop-salon-wash.jpg" },
          {
            id: "testshop-reception",
            kind: "interior",
            url: "/storefront/testshop-salon-reception.jpg",
          },
        ]
      : [];
  const heroPhotos = (galleryPhotos.length > 0 ? galleryPhotos : testshopPhotos).slice(
    0,
    galleryLimit,
  );
  const displayAddress =
    biz.address || (biz.slug === "testshop" ? "16 Inglis Street, Inverness" : null);

  return (
    <div id={domId} className="min-h-screen bg-background text-foreground" style={brandStyle}>
      <style>{themeFontOverrideCss(theme, `#${domId}`)}</style>
      <div
        aria-hidden="true"
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${brand}, ${accent})` }}
      />
      <header className="border-b bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-6">
          {theme.logoUrl ? (
            <img src={theme.logoUrl} alt={biz.name} className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <div
              className="grid h-11 w-11 place-items-center rounded-xl text-lg font-display text-white"
              style={{ background: brand }}
            >
              {biz.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Book online with
            </div>
            <div className="font-display text-xl leading-tight">{biz.name}</div>
          </div>
        </div>
      </header>

      {customBlocks.length > 0 && (
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-8 space-y-8">
          {customBlocks.map((block, index) => (
            <div key={block.id}>{renderBlock(block, index, <BlockRenderer block={block} />)}</div>
          ))}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-10 pb-32">
        {paymentReturn === "success" && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm mb-6">
            Payment received. Your booking is being confirmed now.
          </div>
        )}
        {paymentReturn === "cancelled" && (
          <div className="rounded-2xl border bg-secondary/50 p-4 text-sm mb-6">
            Payment cancelled — no money was taken. You can choose a time and try again whenever
            you’re ready.
          </div>
        )}
        {biz.description && step === "service" && (
          <p className="text-muted-foreground mb-8 text-pretty">{biz.description}</p>
        )}

        {step !== "done" && step !== "service" && <Stepper step={step} brand={brand} />}

        {/* Selection summary */}
        {(serviceGroup || staff || time) && step !== "done" && (
          <div className="rounded-2xl border bg-card/60 backdrop-blur p-4 mb-6 flex flex-wrap gap-2 text-xs animate-rise">
            {serviceGroup && (
              <Chip onClick={() => setStep("service")} icon={Sparkles} label={serviceGroup.name} />
            )}
            {staff && <Chip onClick={() => setStep("staff")} icon={User} label={staff.name} />}
            {time && (
              <Chip
                onClick={() => setStep("time")}
                icon={Clock}
                label={new Date(time).toLocaleString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
            )}
          </div>
        )}

        {/* SERVICE */}
        {step === "service" && (
          <div key="service" className="space-y-14 animate-rise">
            {storefront.sections
              .filter((section) => section.visible)
              .map((section: StorefrontSection) => {
                if (section.id === "gallery")
                  return (
                    <section
                      key={section.id}
                      aria-labelledby={`${domId}-gallery-heading`}
                      className="relative overflow-hidden rounded-[28px] bg-foreground text-background"
                    >
                      {heroPhotos.length > 0 && (
                        <img
                          src={heroPhotos[0].url}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-65"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/35" />
                      <div
                        className={`relative grid min-h-[420px] gap-5 p-6 sm:p-9 ${heroPhotos.length > 1 ? "lg:grid-cols-[1fr_260px]" : ""}`}
                      >
                        <div className="flex max-w-2xl flex-col justify-end">
                          <div className="flex items-center gap-3">
                            {theme.logoUrl && (
                              <img
                                src={theme.logoUrl}
                                alt=""
                                className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/30"
                              />
                            )}
                            <div>
                              {section.heading && (
                                <p
                                  id={`${domId}-gallery-heading`}
                                  className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70"
                                >
                                  {section.heading}
                                </p>
                              )}
                              <h1 className="font-display text-4xl text-white sm:text-6xl">
                                {biz.name}
                              </h1>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90">
                            {displayAddress && (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {displayAddress}
                              </span>
                            )}
                          </div>
                          {biz.description && (
                            <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
                              {biz.description}
                            </p>
                          )}
                          <a
                            href={`#${domId}-booking`}
                            className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black"
                          >
                            Book now <ChevronRight className="h-4 w-4" />
                          </a>
                        </div>
                        {heroPhotos.length > 1 && (
                          <div className="hidden grid-rows-2 gap-3 lg:grid">
                            {heroPhotos.slice(1, 3).map((photo) => (
                              <img
                                key={photo.id}
                                src={photo.url}
                                alt=""
                                className="h-full min-h-0 w-full rounded-2xl object-cover ring-1 ring-white/25"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  );

                if (section.id === "booking") {
                  const shownGroups =
                    expandedServices || serviceSearch
                      ? visibleServiceGroups
                      : visibleServiceGroups.slice(0, bookingSection.itemLimit);
                  return (
                    <section key={section.id} id={`${domId}-booking`} className="scroll-mt-5">
                      <Stepper step={step} brand={brand} />
                      <div className="mt-10 max-w-3xl">
                        {section.heading && (
                          <h2 className="font-display text-3xl sm:text-5xl">{section.heading}</h2>
                        )}
                        <p className="mt-2 text-sm text-muted-foreground">
                          Search or browse by category, then choose the service that suits you.
                        </p>
                      </div>
                      <div className="relative mt-6">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={serviceSearch}
                          onChange={(event) => {
                            setServiceSearch(event.target.value);
                            setExpandedServices(false);
                          }}
                          placeholder="Search services"
                          className="h-14 rounded-full pl-11 text-base"
                          aria-label="Search services"
                        />
                      </div>
                      <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
                        {serviceCategories.map((category) => (
                          <button
                            key={category.name}
                            type="button"
                            onClick={() => {
                              setActiveCategory(category.name);
                              setServiceSearch("");
                              setExpandedServices(false);
                            }}
                            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${!serviceSearch && activeCategory === category.name ? "font-medium text-white" : "bg-card hover:bg-secondary/50"}`}
                            style={
                              !serviceSearch && activeCategory === category.name
                                ? { background: brand, borderColor: brand }
                                : undefined
                            }
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                      <div className="mt-7 grid gap-7 md:grid-cols-[190px_minmax(0,1fr)]">
                        <nav className="hidden space-y-1 md:block" aria-label="Service categories">
                          {serviceCategories.map((category) => (
                            <button
                              key={category.name}
                              type="button"
                              onClick={() => {
                                setActiveCategory(category.name);
                                setServiceSearch("");
                                setExpandedServices(false);
                              }}
                              className={`w-full rounded-xl px-4 py-3 text-left text-sm ${!serviceSearch && activeCategory === category.name ? "font-medium" : "text-muted-foreground hover:text-foreground"}`}
                              style={
                                !serviceSearch && activeCategory === category.name
                                  ? {
                                      background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                                      color: accent,
                                    }
                                  : undefined
                              }
                            >
                              {category.name}
                              <span className="float-right text-xs">{category.groups.length}</span>
                            </button>
                          ))}
                        </nav>
                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-display text-2xl">
                              {serviceSearch ? "Search results" : activeCategory}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                              {visibleServiceGroups.length} services
                            </span>
                          </div>
                          {loadingServices &&
                            Array.from({ length: 3 }).map((_, i) => (
                              <Skeleton key={i} className="mb-2 h-24 rounded-2xl" />
                            ))}
                          {!loadingServices && shownGroups.length === 0 && (
                            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
                              No matching services.
                            </div>
                          )}
                          <div className="overflow-hidden rounded-2xl border bg-card">
                            {shownGroups.map((group) => (
                              <button
                                key={group.key}
                                onClick={() => pickGroup(group)}
                                className="group w-full border-b p-5 text-left last:border-0 hover:bg-secondary/40"
                              >
                                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                                  <div>
                                    <h3 className="font-display text-xl">{group.name}</h3>
                                    {group.description && (
                                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                        {group.description}
                                      </p>
                                    )}
                                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {durationRange(group.variants)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-display text-lg tabular-nums">
                                      {priceRange(group.variants, currency)}
                                    </div>
                                    <div
                                      className="ml-auto mt-2 grid h-8 w-8 place-items-center rounded-full transition-transform group-hover:translate-x-0.5"
                                      style={{
                                        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                                        color: accent,
                                      }}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                          {!serviceSearch &&
                            visibleServiceGroups.length > bookingSection.itemLimit && (
                              <Button
                                type="button"
                                variant="outline"
                                className="mx-auto mt-5 flex rounded-full"
                                onClick={() => setExpandedServices((value) => !value)}
                              >
                                {expandedServices
                                  ? "Show fewer services"
                                  : `Show ${visibleServiceGroups.length - bookingSection.itemLimit} more services`}
                              </Button>
                            )}
                        </div>
                      </div>
                    </section>
                  );
                }

                if (section.id === "location" && (displayAddress || sortedOpeningHours.length > 0))
                  return (
                    <section
                      key={section.id}
                      className="grid overflow-hidden rounded-[28px] border bg-card md:grid-cols-[0.85fr_1.4fr]"
                    >
                      <div className="p-7 sm:p-10">
                        {section.heading && (
                          <>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                              Visit us
                            </p>
                            <h2 className="font-display text-3xl sm:text-4xl">{section.heading}</h2>
                          </>
                        )}
                        {displayAddress && (
                          <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            {displayAddress}
                          </p>
                        )}
                        {displayAddress && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-5 inline-flex items-center gap-2 px-5 py-3 text-sm font-medium"
                            style={themedButtonStyle(theme, "accent")}
                          >
                            <Navigation className="h-4 w-4" />
                            Get directions
                          </a>
                        )}
                        <div className="mt-7 space-y-2 text-sm">
                          {sortedOpeningHours.slice(0, locationSection.itemLimit).map((hours) => (
                            <div key={hours.weekday} className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                {WEEKDAYS[hours.weekday]}
                              </span>
                              <span className="tabular-nums">
                                {hours.closed
                                  ? "Closed"
                                  : `${displayTime(hours.open_time)} – ${displayTime(hours.close_time)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {displayAddress && (
                        <iframe
                          title={`${biz.name} location`}
                          src={`https://www.google.com/maps?q=${encodeURIComponent(displayAddress)}&output=embed`}
                          className="min-h-[360px] h-full w-full border-0 grayscale-[25%]"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      )}
                    </section>
                  );
                return null;
              })}
          </div>
        )}

        {/* STAFF */}
        {step === "staff" && (
          <div key="staff" className="space-y-3 animate-rise">
            <BackBtn onClick={() => setStep("service")} />
            {loadingStaff &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            {!loadingStaff && allStaff?.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center text-muted-foreground">
                No staff available for this service.
              </div>
            )}
            {allStaff?.map((p, i) => (
              <button
                key={p.id}
                onClick={() => pickStaff(p)}
                className={`group w-full text-left rounded-2xl border bg-card p-5 flex items-center gap-4 card-hover animate-rise stagger-${(i % 6) + 1}`}
              >
                <div className="h-12 w-12 rounded-full bg-secondary grid place-items-center font-display text-lg shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.role && <div className="text-xs text-muted-foreground truncate">{p.role}</div>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* TIME */}
        {step === "time" && service && (
          <div key="time" className="animate-rise">
            <BackBtn onClick={() => setStep("staff")} />
            {/* Date strip */}
            <div className="rounded-2xl border bg-card p-3 mb-5 shadow-soft">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="font-display text-base inline-flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      const d = new Date(date);
                      d.setDate(d.getDate() - 1);
                      if (d >= new Date(new Date().setHours(0, 0, 0, 0))) setDate(d);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      const d = new Date(date);
                      d.setDate(d.getDate() + 1);
                      setDate(d);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
                {dayStrip.map((d) => {
                  const isSel = d.toDateString() === date.toDateString();
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setDate(d)}
                      className={`shrink-0 flex flex-col items-center min-w-[56px] py-2.5 rounded-xl text-xs transition-all ${
                        isSel
                          ? "text-white shadow-soft"
                          : "bg-secondary/50 hover:bg-secondary text-foreground"
                      }`}
                      style={isSel ? { background: brand } : undefined}
                    >
                      <span className="uppercase tracking-wider text-[10px] opacity-80">
                        {d.toLocaleDateString([], { weekday: "short" })}
                      </span>
                      <span className="font-display text-lg mt-0.5 tabular-nums leading-none">
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loadingDay ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <Skeleton key={j} className="h-11 rounded-xl" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center">
                <Clock className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-3">
                  No availability on this day. Try another date.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <SlotGroup
                  label="Morning"
                  icon={Sun}
                  slots={grouped.morning}
                  brand={brand}
                  onPick={(iso) => {
                    setTime(iso);
                    setStep("info");
                  }}
                />
                <SlotGroup
                  label="Afternoon"
                  icon={Sunset}
                  slots={grouped.afternoon}
                  brand={brand}
                  onPick={(iso) => {
                    setTime(iso);
                    setStep("info");
                  }}
                />
                <SlotGroup
                  label="Evening"
                  icon={Moon}
                  slots={grouped.evening}
                  brand={brand}
                  onPick={(iso) => {
                    setTime(iso);
                    setStep("info");
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* INFO */}
        {step === "info" && service && staff && time && (
          <div key="info" className="space-y-4 animate-rise">
            <BackBtn onClick={() => setStep("time")} />
            <div
              className="rounded-2xl p-5 text-white shadow-elegant"
              style={{
                background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 70%, black))`,
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.2em] opacity-80">Almost there</div>
              <div className="font-display text-xl mt-1">{serviceGroup?.name ?? service.name}</div>
              <div className="text-sm opacity-90 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {staff.name}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(time).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span>· {fmtMoney(service.price_cents, currency)}</span>
              </div>
            </div>
            {signedInUser ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border bg-secondary/20 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Signed in as{" "}
                  <span className="text-foreground font-medium">{signedInUser.email}</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setInfo({ name: "", email: "", phone: "", notes: info.notes });
                    setInfoTouched(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                >
                  Not you?
                </button>
              </div>
            ) : (
              <BookingSignIn onSignedIn={() => setInfoTouched(false)} />
            )}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Your name
              </Label>
              <Input
                value={info.name}
                onChange={(e) => {
                  setInfoTouched(true);
                  setInfo({ ...info, name: e.target.value });
                }}
                className="mt-1.5 h-11"
                required
                autoFocus
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Email
                </Label>
                <Input
                  type="email"
                  value={info.email}
                  onChange={(e) => {
                    setInfoTouched(true);
                    setInfo({ ...info, email: e.target.value });
                  }}
                  className="mt-1.5 h-11"
                  placeholder="you@email.com"
                />
                {info.email.length > 0 && !isValidEmail(info.email) && (
                  <p className="mt-1 text-xs text-destructive">
                    Please enter a valid email address.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Phone
                </Label>
                <Input
                  value={info.phone}
                  onChange={(e) => {
                    setInfoTouched(true);
                    setInfo({ ...info, phone: sanitizePhone(e.target.value) });
                  }}
                  className="mt-1.5 h-11"
                  placeholder="(555) 000-0000"
                  inputMode="tel"
                />
                {info.phone.length > 0 && !isValidPhone(info.phone) && (
                  <p className="mt-1 text-xs text-destructive">
                    Please enter a valid phone number (7–15 digits).
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes <span className="text-muted-foreground/60 normal-case">(optional)</span>
              </Label>
              <Textarea
                value={info.notes}
                onChange={(e) => setInfo({ ...info, notes: e.target.value })}
                className="mt-1.5"
                placeholder="Anything we should know?"
              />
            </div>
            <Button
              onClick={book}
              disabled={
                submitting ||
                !info.name.trim() ||
                !isValidEmail(info.email) ||
                (info.phone.trim().length > 0 && !isValidPhone(info.phone))
              }
              className="w-full h-12 text-base shadow-glow"
              style={themedButtonStyle(theme)}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing secure checkout…
                </>
              ) : (
                <>Continue to secure payment</>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              By confirming, you agree to our booking terms.
            </p>
          </div>
        )}

        {/* DONE */}
        {step === "done" && service && staff && time && (
          <div className="text-center py-12 animate-rise">
            <div
              className="mx-auto h-20 w-20 rounded-full grid place-items-center text-white shadow-glow animate-pulse-ring"
              style={{ background: brand }}
            >
              <Check className="h-9 w-9" />
            </div>
            <h2 className="font-display text-3xl sm:text-4xl mt-8 text-balance">You're booked.</h2>
            <p className="text-muted-foreground mt-3 text-pretty">
              We'll see you{" "}
              {new Date(time).toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}{" "}
              at {new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
            <div className="mt-8 mx-auto max-w-sm rounded-2xl border bg-card p-5 text-left text-sm">
              <SummaryRow label="Service" value={serviceGroup?.name ?? service.name} />
              <SummaryRow label="With" value={staff.name} />
              <SummaryRow label="Total" value={fmtMoney(service.price_cents, currency)} />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {bookedEndsAt && (
                <AddToCalendar
                  event={{
                    uid: `booking-${bookedBookingId ?? `${staff.id}-${time}`}@bookzenvo.com`,
                    title: `${serviceGroup?.name ?? service.name} with ${staff.name}`,
                    description: `${serviceGroup?.name ?? service.name} at ${biz.name}, with ${staff.name}. Booked via Bookzenvo.`,
                    location: displayAddress ?? undefined,
                    startsAtIso: time,
                    endsAtIso: bookedEndsAt,
                  }}
                />
              )}
              <Button variant="outline" onClick={reset}>
                Book another
              </Button>
              {info.email && (
                <a
                  href="/portal"
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                >
                  Manage your bookings →
                </a>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-muted-foreground py-6 flex items-center justify-center gap-3 flex-wrap">
        <span>
          Powered by{" "}
          <span className="font-display text-foreground">
            Bookzenvo<span style={{ color: brand }}>.</span>
          </span>
        </span>
        {footerExtra}
      </footer>
    </div>
  );
}

function SlotGroup({
  label,
  icon: Icon,
  slots,
  brand,
  onPick,
}: {
  label: string;
  icon: any;
  slots: { time: string; iso: string }[];
  brand: string;
  onPick: (iso: string) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5 text-xs uppercase tracking-[0.15em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className="text-muted-foreground/70 normal-case tracking-normal">
          · {slots.length}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slots.map((s) => (
          <button
            key={s.iso}
            onClick={() => onPick(s.iso)}
            className="px-3 h-11 rounded-xl border bg-card hover:text-white hover:border-transparent text-sm tabular-nums transition-colors"
            style={{ ["--tw-bg-opacity" as any]: 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = brand)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ step, brand }: { step: Step; brand: string }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        <span>
          Step {idx + 1} of {STEPS.length}
        </span>
        <span>{STEPS[idx]?.label}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: i <= idx ? "100%" : "0%",
                background: brand,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4 group"
    >
      <ChevronLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back
    </button>
  );
}

function Chip({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-secondary hover:bg-secondary/70 px-2.5 py-1 text-foreground transition-colors"
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[180px]">{label}</span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
