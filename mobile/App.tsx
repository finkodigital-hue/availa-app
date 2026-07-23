import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";

type Tab = "Today" | "Calendar" | "Bookings" | "More";

type Business = {
  id: string;
  name: string;
  currency: string;
  plan: string;
};

type Booking = {
  id: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  payment_status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
};

const PALETTE = {
  ink: "#211f1d",
  cream: "#fbfaf7",
  sand: "#f2ece1",
  line: "#e8e1d6",
  muted: "#8f887f",
  gold: "#ae8757",
  green: "#2f805d",
  red: "#ba4b43",
  white: "#ffffff",
};

function formatMoney(cents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format((cents || 0) / 100);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    const receiveRecoveryLink = async (url: string | null) => {
      if (!url || !url.includes("type=recovery")) return;
      const fragment = url.split("#")[1] ?? "";
      const params = new URLSearchParams(fragment);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) return;
      const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!error) setResettingPassword(true);
    };

    Linking.getInitialURL().then(receiveRecoveryLink);
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => receiveRecoveryLink(url));

    return () => {
      data.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  if (!isSupabaseConfigured) return <ConfigurationRequired />;
  if (loading) return <LoadingScreen label="Opening Bookzenvo" />;
  if (resettingPassword) return <NewPasswordScreen onComplete={() => setResettingPassword(false)} />;
  if (!session) return <SignInScreen />;

  return <OwnerApp session={session} />;
}

function NewPasswordScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [working, setWorking] = useState(false);

  const updatePassword = async () => {
    if (!supabase) return;
    if (password.length < 8) {
      Alert.alert("Use at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match");
      return;
    }
    setWorking(true);
    const { error } = await supabase.auth.updateUser({ password });
    setWorking(false);
    if (error) Alert.alert("Could not update password", error.message);
    else {
      Alert.alert("Password updated", "You can now sign in with your new password.");
      await supabase.auth.signOut();
      onComplete();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.authShell}>
        <View style={styles.resetHero}><Wordmark /><Text style={styles.resetHeadline}>Choose a new password.</Text></View>
        <View style={styles.authForm}>
          <Text style={styles.eyebrow}>SECURE ACCOUNT</Text>
          <Text style={styles.authTitle}>Reset password</Text>
          <Text style={styles.authSubtitle}>Use a strong password you have not used elsewhere.</Text>
          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" style={styles.input} placeholder="At least 8 characters" placeholderTextColor={PALETTE.muted} />
          <Text style={[styles.label, { marginTop: 17 }]}>CONFIRM PASSWORD</Text>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" style={styles.input} placeholder="Repeat password" placeholderTextColor={PALETTE.muted} onSubmitEditing={updatePassword} />
          <Pressable style={[styles.primaryButton, working && styles.dimmed]} onPress={updatePassword} disabled={working}>
            {working ? <ActivityIndicator color={PALETTE.white} /> : <Text style={styles.primaryButtonText}>Save new password</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ConfigurationRequired() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Wordmark />
        <Text style={styles.setupTitle}>Connect Bookzenvo</Text>
        <Text style={styles.setupText}>
          Add the public Supabase URL and publishable key to mobile/.env, then restart the app.
        </Text>
        <View style={styles.codeCard}>
          <Text style={styles.codeText}>EXPO_PUBLIC_SUPABASE_URL=...</Text>
          <Text style={styles.codeText}>EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Wordmark />
        <ActivityIndicator color={PALETTE.gold} size="large" style={{ marginTop: 32 }} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

function Wordmark() {
  return <Text style={styles.wordmark}>Bookzenvo.</Text>;
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async () => {
    if (!supabase) return;
    if (!email.trim() || !password) {
      Alert.alert("Enter your email and password");
      return;
    }
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setWorking(false);
    if (error) Alert.alert("Could not sign in", error.message);
  };

  const resetPassword = async () => {
    if (!supabase) return;
    if (!email.trim()) {
      Alert.alert("Enter your email first", "We will send the reset link to that address.");
      return;
    }
    setWorking(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "bookzenvo://auth/reset",
    });
    setWorking(false);
    if (error) Alert.alert("Could not send reset link", error.message);
    else setResetSent(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.authShell}>
        <View style={styles.authHero}>
          <Wordmark />
          <Text style={styles.authHeadline}>Your studio,{"\n"}in your pocket.</Text>
          <Text style={styles.authLead}>Bookings, calendar and clients — wherever your day takes you.</Text>
        </View>
        <View style={styles.authForm}>
          <Text style={styles.eyebrow}>OWNER APP</Text>
          <Text style={styles.authTitle}>Welcome back</Text>
          <Text style={styles.authSubtitle}>Sign in to manage your Bookzenvo studio.</Text>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@studio.com"
            placeholderTextColor={PALETTE.muted}
            style={styles.input}
          />
          <View style={styles.labelRow}>
            <Text style={styles.label}>PASSWORD</Text>
            <Pressable onPress={resetPassword} disabled={working}>
              <Text style={styles.forgot}>Forgot?</Text>
            </Pressable>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Your password"
            placeholderTextColor={PALETTE.muted}
            style={styles.input}
            onSubmitEditing={signIn}
          />
          {resetSent && <Text style={styles.successText}>Reset link sent — check your email.</Text>}
          <Pressable style={[styles.primaryButton, working && styles.dimmed]} onPress={signIn} disabled={working}>
            {working ? <ActivityIndicator color={PALETTE.white} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </Pressable>
          <Text style={styles.authFootnote}>New studios are set up on bookzenvo.com.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function OwnerApp({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>("Today");
  const [business, setBusiness] = useState<Business | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    if (!supabase) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    const { data: activeBusiness, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, currency, plan")
      .eq("owner_id", session.user.id)
      .maybeSingle();

    if (businessError) {
      setError(businessError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setBusiness(activeBusiness);

    if (activeBusiness) {
      const bounds = dayBounds();
      const { data, error: bookingError } = await supabase
        .from("bookings")
        .select("id, customer_name, starts_at, ends_at, status, payment_status, amount_due_cents, amount_paid_cents")
        .eq("business_id", activeBusiness.id)
        .gte("starts_at", bounds.start)
        .lt("starts_at", bounds.end)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (bookingError) setError(bookingError.message);
      setBookings(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [session.user.id]);

  const collected = useMemo(() => bookings.reduce((sum, booking) => sum + booking.amount_paid_cents, 0), [bookings]);

  if (loading) return <LoadingScreen label="Loading your studio" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>{tab === "Today" ? "TODAY" : "BOOKZENVO"}</Text>
            <Text style={styles.appTitle}>{business?.name ?? "Your studio"}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={() => load(true)} disabled={refreshing}>
            {refreshing ? <ActivityIndicator color={PALETTE.ink} /> : <Text style={styles.refreshIcon}>↻</Text>}
          </Pressable>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!business ? (
          <EmptyStudio />
        ) : tab === "Today" ? (
          <TodayView business={business} bookings={bookings} collected={collected} />
        ) : tab === "Calendar" ? (
          <CalendarView bookings={bookings} />
        ) : tab === "Bookings" ? (
          <BookingsView bookings={bookings} currency={business.currency} />
        ) : (
          <MoreView email={session.user.email ?? ""} onSignOut={() => supabase?.auth.signOut()} />
        )}

        <TabBar active={tab} onChange={setTab} />
      </View>
    </SafeAreaView>
  );
}

function EmptyStudio() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Finish setting up your studio</Text>
      <Text style={styles.emptyText}>Your Bookzenvo account is ready, but studio setup still needs to be completed on the website.</Text>
    </View>
  );
}

function TodayView({ business, bookings, collected }: { business: Business; bookings: Booking[]; collected: number }) {
  const today = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.dateText}>{today}</Text>
      <Text style={styles.greeting}>Good morning.</Text>
      <View style={styles.summaryRow}>
        <MetricCard value={String(bookings.length)} label="BOOKINGS TODAY" />
        <MetricCard value={formatMoney(collected, business.currency)} label="COLLECTED TODAY" />
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today’s appointments</Text>
        <Text style={styles.sectionHint}>{bookings.length} scheduled</Text>
      </View>
      {bookings.length ? bookings.map((booking) => <BookingRow key={booking.id} booking={booking} currency={business.currency} />) : <NoBookings />}
    </ScrollView>
  );
}

function CalendarView({ bookings }: { bookings: Booking[] }) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.dateText}>{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</Text>
      <Text style={styles.greeting}>Your calendar</Text>
      <View style={styles.timeline}>
        {bookings.length ? bookings.map((booking) => <TimelineRow key={booking.id} booking={booking} />) : <NoBookings />}
      </View>
    </ScrollView>
  );
}

function BookingsView({ bookings, currency }: { bookings: Booking[]; currency: string }) {
  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.screenContent}
      ListHeaderComponent={<><Text style={styles.dateText}>TODAY</Text><Text style={styles.greeting}>Bookings</Text></>}
      ListEmptyComponent={<NoBookings />}
      renderItem={({ item }) => <BookingRow booking={item} currency={currency} />}
    />
  );
}

function MoreView({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <View style={styles.screenContent}>
      <Text style={styles.dateText}>ACCOUNT</Text>
      <Text style={styles.greeting}>More</Text>
      <View style={styles.accountCard}>
        <Text style={styles.accountEmail}>{email}</Text>
        <Text style={styles.accountText}>Owner account</Text>
      </View>
      <Text style={styles.comingSoon}>Settings, customer search, notifications and tap-to-pay will be added in the next mobile milestones.</Text>
      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return <View style={styles.metricCard}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function BookingRow({ booking, currency }: { booking: Booking; currency: string }) {
  const paid = booking.amount_paid_cents > 0;
  return (
    <View style={styles.bookingRow}>
      <Text style={styles.time}>{formatTime(booking.starts_at)}</Text>
      <View style={styles.bookingMain}>
        <Text style={styles.customerName}>{booking.customer_name}</Text>
        <Text style={styles.bookingMeta}>{booking.status.replace("_", " ")} · {paid ? "Payment received" : "Payment due"}</Text>
      </View>
      <Text style={styles.bookingAmount}>{formatMoney(booking.amount_due_cents, currency)}</Text>
    </View>
  );
}

function TimelineRow({ booking }: { booking: Booking }) {
  return <View style={styles.timelineRow}><Text style={styles.time}>{formatTime(booking.starts_at)}</Text><View style={styles.timelineDot} /><View style={styles.timelineCard}><Text style={styles.customerName}>{booking.customer_name}</Text><Text style={styles.bookingMeta}>{formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}</Text></View></View>;
}

function NoBookings() {
  return <View style={styles.noBookings}><Text style={styles.noBookingsTitle}>Nothing scheduled yet</Text><Text style={styles.noBookingsText}>New online bookings will appear here automatically.</Text></View>;
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { name: Tab; icon: string }[] = [{ name: "Today", icon: "◷" }, { name: "Calendar", icon: "▦" }, { name: "Bookings", icon: "☷" }, { name: "More", icon: "•••" }];
  return <View style={styles.tabBar}>{tabs.map((tab) => <Pressable key={tab.name} style={styles.tabButton} onPress={() => onChange(tab.name)}><Text style={[styles.tabIcon, active === tab.name && styles.tabActive]}>{tab.icon}</Text><Text style={[styles.tabLabel, active === tab.name && styles.tabActive]}>{tab.name}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PALETTE.cream },
  centered: { flex: 1, padding: 32, justifyContent: "center", alignItems: "center", backgroundColor: PALETTE.ink },
  wordmark: { fontSize: 27, fontFamily: "serif", color: PALETTE.white },
  loadingText: { marginTop: 16, color: "#d8d0c6", fontSize: 15 },
  setupTitle: { color: PALETTE.white, marginTop: 30, fontSize: 29, fontFamily: "serif" },
  setupText: { color: "#d8d0c6", textAlign: "center", lineHeight: 22, marginTop: 14, maxWidth: 320 },
  codeCard: { marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: "#302d29", width: "100%" },
  codeText: { fontFamily: "monospace", color: "#e9dfd1", fontSize: 11, marginVertical: 3 },
  authShell: { flex: 1, backgroundColor: PALETTE.cream },
  authHero: { flex: 0.85, backgroundColor: PALETTE.ink, padding: 28, justifyContent: "space-between", paddingBottom: 34 },
  resetHero: { flex: 0.55, backgroundColor: PALETTE.ink, padding: 28, justifyContent: "space-between", paddingBottom: 34 },
  authHeadline: { color: PALETTE.white, fontFamily: "serif", fontSize: 43, lineHeight: 47, letterSpacing: -1, marginTop: 45 },
  resetHeadline: { color: PALETTE.white, fontFamily: "serif", fontSize: 37, lineHeight: 42, letterSpacing: -0.7, marginTop: 30 },
  authLead: { color: "#cbc4bb", fontSize: 15, lineHeight: 23, maxWidth: 300 },
  authForm: { flex: 1.25, paddingHorizontal: 28, paddingTop: 30 },
  eyebrow: { fontSize: 11, letterSpacing: 2.2, color: PALETTE.gold, fontWeight: "700" },
  authTitle: { fontFamily: "serif", fontSize: 37, color: PALETTE.ink, marginTop: 11 },
  authSubtitle: { color: PALETTE.muted, fontSize: 15, marginTop: 6, marginBottom: 28 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17 },
  label: { color: "#716b64", fontSize: 11, fontWeight: "700", letterSpacing: 1.1, marginBottom: 8 },
  forgot: { color: PALETTE.gold, fontSize: 13, fontWeight: "600" },
  input: { backgroundColor: PALETTE.white, borderWidth: 1, borderColor: PALETTE.line, borderRadius: 10, height: 54, paddingHorizontal: 15, color: PALETTE.ink, fontSize: 16 },
  primaryButton: { height: 56, borderRadius: 10, backgroundColor: PALETTE.ink, marginTop: 24, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: PALETTE.white, fontSize: 16, fontWeight: "700" },
  dimmed: { opacity: 0.6 },
  successText: { color: PALETTE.green, marginTop: 12, fontSize: 13 },
  authFootnote: { color: PALETTE.muted, textAlign: "center", fontSize: 13, marginTop: 20 },
  appShell: { flex: 1, backgroundColor: PALETTE.cream },
  topBar: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  appTitle: { color: PALETTE.ink, fontFamily: "serif", fontSize: 28, marginTop: 4 },
  refreshButton: { height: 42, width: 42, borderRadius: 21, backgroundColor: PALETTE.sand, justifyContent: "center", alignItems: "center" },
  refreshIcon: { fontSize: 25, color: PALETTE.ink },
  errorBanner: { marginHorizontal: 22, padding: 12, backgroundColor: "#f6e3e0", borderRadius: 10 },
  errorText: { color: PALETTE.red, fontSize: 13 },
  screenContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 110 },
  dateText: { color: PALETTE.gold, fontSize: 11, letterSpacing: 1.8, fontWeight: "700" },
  greeting: { color: PALETTE.ink, fontFamily: "serif", fontSize: 38, marginTop: 8, letterSpacing: -0.6 },
  summaryRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  metricCard: { flex: 1, padding: 16, backgroundColor: PALETTE.white, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.line, minHeight: 112, justifyContent: "space-between" },
  metricValue: { color: PALETTE.ink, fontSize: 27, fontFamily: "serif" },
  metricLabel: { color: PALETTE.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 31, marginBottom: 10 },
  sectionTitle: { color: PALETTE.ink, fontSize: 17, fontWeight: "700" },
  sectionHint: { color: PALETTE.muted, fontSize: 13 },
  bookingRow: { minHeight: 76, flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderColor: PALETTE.line },
  time: { color: PALETTE.ink, fontSize: 14, fontWeight: "700", width: 68 },
  bookingMain: { flex: 1, paddingRight: 8 },
  customerName: { color: PALETTE.ink, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  bookingMeta: { color: PALETTE.muted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  bookingAmount: { color: PALETTE.ink, fontSize: 14, fontWeight: "700" },
  noBookings: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#d7cebf", padding: 24, marginTop: 12, alignItems: "center" },
  noBookingsTitle: { color: PALETTE.ink, fontSize: 15, fontWeight: "700" },
  noBookingsText: { color: PALETTE.muted, textAlign: "center", lineHeight: 19, fontSize: 13, marginTop: 7 },
  timeline: { marginTop: 28, borderLeftWidth: 1, borderColor: PALETTE.line, marginLeft: 22, paddingLeft: 19 },
  timelineRow: { minHeight: 88, flexDirection: "row", alignItems: "center", marginLeft: -89 },
  timelineDot: { height: 10, width: 10, borderRadius: 5, backgroundColor: PALETTE.gold, marginRight: 12 },
  timelineCard: { flex: 1, backgroundColor: PALETTE.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: PALETTE.line },
  accountCard: { marginTop: 25, backgroundColor: PALETTE.white, borderWidth: 1, borderColor: PALETTE.line, borderRadius: 14, padding: 17 },
  accountEmail: { color: PALETTE.ink, fontSize: 16, fontWeight: "700" },
  accountText: { color: PALETTE.muted, fontSize: 13, marginTop: 5 },
  comingSoon: { color: PALETTE.muted, fontSize: 14, lineHeight: 21, marginTop: 23 },
  signOutButton: { marginTop: 27, height: 52, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.line, alignItems: "center", justifyContent: "center", backgroundColor: PALETTE.white },
  signOutText: { color: PALETTE.red, fontWeight: "700", fontSize: 15 },
  emptyWrap: { margin: 22, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.white },
  emptyTitle: { color: PALETTE.ink, fontSize: 20, fontFamily: "serif" },
  emptyText: { color: PALETTE.muted, lineHeight: 21, marginTop: 9 },
  tabBar: { flexDirection: "row", height: 76, borderTopWidth: 1, borderColor: PALETTE.line, backgroundColor: "rgba(251,250,247,0.98)", paddingHorizontal: 8 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabIcon: { color: PALETTE.muted, fontSize: 18, lineHeight: 19 },
  tabLabel: { color: PALETTE.muted, fontSize: 11, fontWeight: "600" },
  tabActive: { color: PALETTE.ink },
});
