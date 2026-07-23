import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { useFonts } from "expo-font";
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from "@expo-google-fonts/cormorant-garamond";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";

type Tab = "Today" | "Calendar" | "Bookings" | "More";
type Screen = Tab | "Clients" | "Staff" | "Professionals" | "Services" | "Payments" | "Settings" | "Page builder" | "Help centre" | "Reports" | "Stock" | "Assistant" | "Import data";

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

type Customer = { id: string; name: string; email: string | null; phone: string | null; notes: string | null };
type StaffMember = { id: string; name: string; role: string | null; email: string | null; phone: string | null; active: boolean | null; bookable: boolean | null };
type Service = { id: string; name: string; description: string | null; duration_minutes: number; price_cents: number; active: boolean | null; color: string | null };

const PALETTE = {
  ink: "#1A1A1A",
  cream: "#FAFAF8",
  sand: "#F4EDE1",
  line: "#EAE6DE",
  muted: "#8B857B",
  gold: "#C8A97E",
  goldDeep: "#A98B5F",
  green: "#748563",
  confirmedBg: "#EAEDE5",
  red: "#BA4B43",
  white: "#ffffff",
};

const AUTH_KEYBOARD_ACCESSORY_ID = "bookzenvo-auth-keyboard";

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
  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
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

  if (!fontsLoaded) return <LoadingScreen label="Opening Bookzenvo" />;
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
      <KeyboardAvoidingView style={styles.authShell} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.authScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.resetHero}><Wordmark /><Text style={styles.resetHeadline}>Choose a new password.</Text></View>
        <View style={styles.authForm}>
          <Text style={styles.eyebrow}>SECURE ACCOUNT</Text>
          <Text style={styles.authTitle}>Reset password</Text>
          <Text style={styles.authSubtitle}>Use a strong password you have not used elsewhere.</Text>
          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" style={styles.input} placeholder="At least 8 characters" placeholderTextColor={PALETTE.muted} inputAccessoryViewID={Platform.OS === "ios" ? AUTH_KEYBOARD_ACCESSORY_ID : undefined} />
          <Text style={[styles.label, { marginTop: 17 }]}>CONFIRM PASSWORD</Text>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" style={styles.input} placeholder="Repeat password" placeholderTextColor={PALETTE.muted} inputAccessoryViewID={Platform.OS === "ios" ? AUTH_KEYBOARD_ACCESSORY_ID : undefined} onSubmitEditing={updatePassword} />
          <Pressable style={[styles.primaryButton, working && styles.dimmed]} onPress={updatePassword} disabled={working}>
            {working ? <ActivityIndicator color={PALETTE.white} /> : <Text style={styles.primaryButtonText}>Save new password</Text>}
          </Pressable>
        </View>
        </ScrollView>
        <KeyboardDoneAccessory />
      </KeyboardAvoidingView>
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

function KeyboardDoneAccessory() {
  if (Platform.OS !== "ios") return null;

  return (
    <InputAccessoryView nativeID={AUTH_KEYBOARD_ACCESSORY_ID}>
      <View style={styles.keyboardAccessory}>
        <Pressable onPress={Keyboard.dismiss} hitSlop={12}>
          <Text style={styles.keyboardDone}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
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
      <KeyboardAvoidingView style={styles.authShell} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.authScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            inputAccessoryViewID={Platform.OS === "ios" ? AUTH_KEYBOARD_ACCESSORY_ID : undefined}
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
            inputAccessoryViewID={Platform.OS === "ios" ? AUTH_KEYBOARD_ACCESSORY_ID : undefined}
            onSubmitEditing={signIn}
          />
          {resetSent && <Text style={styles.successText}>Reset link sent — check your email.</Text>}
          <Pressable style={[styles.primaryButton, working && styles.dimmed]} onPress={signIn} disabled={working}>
            {working ? <ActivityIndicator color={PALETTE.white} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </Pressable>
          <Text style={styles.authFootnote}>New studios are set up on bookzenvo.com.</Text>
        </View>
        </ScrollView>
        <KeyboardDoneAccessory />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OwnerApp({ session }: { session: Session }) {
  const [screen, setScreen] = useState<Screen>("Today");
  const [business, setBusiness] = useState<Business | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<Service[]>([]);
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
      const [bookingResult, customerResult, staffResult, serviceResult] = await Promise.all([
        supabase
        .from("bookings")
        .select("id, customer_name, starts_at, ends_at, status, payment_status, amount_due_cents, amount_paid_cents")
        .eq("business_id", activeBusiness.id)
        .gte("starts_at", bounds.start)
        .lt("starts_at", bounds.end)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true }),
        supabase.from("customers").select("id, name, email, phone, notes").eq("business_id", activeBusiness.id).order("name"),
        supabase.from("staff").select("id, name, role, email, phone, active, bookable").eq("business_id", activeBusiness.id).order("name"),
        supabase.from("services").select("id, name, description, duration_minutes, price_cents, active, color").eq("business_id", activeBusiness.id).order("name"),
      ]);
      const requestError = bookingResult.error || customerResult.error || staffResult.error || serviceResult.error;
      if (requestError) setError(requestError.message);
      setBookings(bookingResult.data ?? []);
      setCustomers(customerResult.data ?? []);
      setStaff(staffResult.data ?? []);
      setServices(serviceResult.data ?? []);
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
          <View style={styles.topTitleBlock}>
            <View style={styles.brandRow}>
              <Text style={styles.brandWordmark}>BOOKZENVO</Text>
              <Text style={styles.brandStudio} numberOfLines={1}>{business?.name ?? "Your studio"}</Text>
            </View>
            {isRootScreen(screen) ? <Text style={styles.eyebrow}>{screen === "Today" ? "TODAY" : screen.toUpperCase()}</Text> : <Pressable style={styles.backButton} onPress={() => setScreen("More")}><Ionicons name="chevron-back" size={17} color={PALETTE.ink} /><Text style={styles.backText}>More</Text></Pressable>}
            {!isRootScreen(screen) && <Text style={styles.appTitle}>{screen}</Text>}
          </View>
          <Pressable style={styles.refreshButton} onPress={() => load(true)} disabled={refreshing}>
            {refreshing ? <ActivityIndicator color={PALETTE.ink} /> : <Ionicons name="refresh-outline" size={20} color={PALETTE.ink} />}
          </Pressable>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!business ? (
          <EmptyStudio />
        ) : screen === "Today" ? (
          <TodayView business={business} bookings={bookings} collected={collected} />
        ) : screen === "Calendar" ? (
          <CalendarView bookings={bookings} />
        ) : screen === "Bookings" ? (
          <BookingsView bookings={bookings} currency={business.currency} />
        ) : screen === "More" ? <MoreView email={session.user.email ?? ""} onNavigate={setScreen} onSignOut={() => supabase?.auth.signOut()} />
        : screen === "Clients" ? <ClientsView customers={customers} />
        : screen === "Staff" ? <StaffView staff={staff} />
        : screen === "Services" ? <ServicesView services={services} currency={business.currency} />
        : screen === "Payments" ? <PaymentsView bookings={bookings} currency={business.currency} />
        : <ManagementView screen={screen} business={business} />}

        {isRootScreen(screen) && <TabBar active={screen} onChange={setScreen} />}
      </View>
    </SafeAreaView>
  );
}

function isRootScreen(screen: Screen): screen is Tab { return ["Today", "Calendar", "Bookings", "More"].includes(screen); }

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

function MoreView({ email, onNavigate, onSignOut }: { email: string; onNavigate: (screen: Screen) => void; onSignOut: () => void }) {
  const groups: { title: string; items: { label: Screen; icon: keyof typeof Ionicons.glyphMap; note: string }[] }[] = [
    { title: "MANAGE", items: [
      { label: "Clients", icon: "people-outline", note: "Clients & notes" },
      { label: "Staff", icon: "person-outline", note: "Team & availability" },
      { label: "Professionals", icon: "person-add-outline", note: "Independent providers" },
      { label: "Services", icon: "cut-outline", note: "Menu & prices" },
      { label: "Stock", icon: "cube-outline", note: "Products & levels" },
      { label: "Payments", icon: "card-outline", note: "Outstanding balances" },
    ] },
    { title: "GROW", items: [
      { label: "Reports", icon: "stats-chart-outline", note: "Performance overview" },
      { label: "Assistant", icon: "sparkles-outline", note: "Your Bookzenvo helper" },
      { label: "Page builder", icon: "color-palette-outline", note: "Brand & booking page" },
      { label: "Import data", icon: "cloud-upload-outline", note: "Bring over your bookings" },
    ] },
    { title: "ACCOUNT", items: [
      { label: "Settings", icon: "settings-outline", note: "Business & account" },
      { label: "Help centre", icon: "help-circle-outline", note: "Guides & support" },
    ] },
  ];
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.dateText}>YOUR BUSINESS</Text>
      <Text style={styles.greeting}>More</Text>
      <View style={styles.accountCard}>
        <Text style={styles.accountEmail}>{email}</Text>
        <Text style={styles.accountText}>Owner account</Text>
      </View>
      {groups.map((group) => <View key={group.title} style={styles.managementGroup}>
        <Text style={styles.groupLabel}>{group.title}</Text>
        <View style={styles.managementCard}>{group.items.map((item, index) => <Pressable key={item.label} onPress={() => onNavigate(item.label)} style={[styles.managementRow, index < group.items.length - 1 && styles.managementRowDivider]}>
          <View style={styles.managementIcon}><Ionicons name={item.icon} size={19} color={PALETTE.ink} /></View>
          <View style={styles.managementCopy}><Text style={styles.managementName}>{item.label}</Text><Text style={styles.managementNote}>{item.note}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={PALETTE.muted} />
        </Pressable>)}</View>
      </View>)}
      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function ClientsView({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState("");
  const results = customers.filter((customer) => `${customer.name} ${customer.email ?? ""} ${customer.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <FlatList data={results} keyExtractor={(item) => item.id} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<><Text style={styles.pageKicker}>CLIENT DIRECTORY</Text><Text style={styles.pageTitle}>Clients</Text><View style={styles.searchBox}><Ionicons name="search-outline" size={18} color={PALETTE.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search clients" placeholderTextColor={PALETTE.muted} style={styles.searchInput} /></View><Text style={styles.listCount}>{results.length} client{results.length === 1 ? "" : "s"}</Text></>}
    ListEmptyComponent={<EmptyList title="No clients found" text="Clients from appointments and online bookings will show here." />}
    renderItem={({ item }) => <View style={styles.personRow}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{item.name}</Text><Text style={styles.personMeta}>{item.email || item.phone || "No contact details"}</Text></View><Ionicons name="chevron-forward" size={18} color={PALETTE.muted} /></View>} />;
}

function StaffView({ staff }: { staff: StaffMember[] }) {
  return <ScrollView contentContainerStyle={styles.screenContent}><Text style={styles.pageKicker}>YOUR TEAM</Text><Text style={styles.pageTitle}>Staff</Text><Text style={styles.pageIntro}>Manage who appears on your booking page and who can take appointments.</Text>{staff.length ? staff.map((person) => <View key={person.id} style={styles.personRow}><View style={styles.avatar}><Text style={styles.avatarText}>{person.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personMeta}>{person.role || "Team member"} · {person.active === false ? "Inactive" : "Active"}</Text></View><View style={[styles.statusPill, person.active === false && styles.statusPillMuted]}><Text style={styles.statusPillText}>{person.bookable === false ? "Hidden" : "Bookable"}</Text></View></View>) : <EmptyList title="No staff yet" text="Add your team on the website, then manage them here." />}</ScrollView>;
}

function ServicesView({ services, currency }: { services: Service[]; currency: string }) {
  return <ScrollView contentContainerStyle={styles.screenContent}><Text style={styles.pageKicker}>SERVICE MENU</Text><Text style={styles.pageTitle}>Services</Text><Text style={styles.pageIntro}>Your live services, pricing and booking durations.</Text>{services.length ? services.map((service) => <View key={service.id} style={styles.serviceCard}><View style={[styles.serviceAccent, { backgroundColor: service.color || PALETTE.gold }]} /><View style={styles.serviceCopy}><Text style={styles.personName}>{service.name}</Text><Text style={styles.personMeta}>{service.duration_minutes} min · {service.active === false ? "Hidden" : "Available online"}</Text>{service.description ? <Text style={styles.serviceDescription} numberOfLines={2}>{service.description}</Text> : null}</View><Text style={styles.servicePrice}>{formatMoney(service.price_cents, currency)}</Text></View>) : <EmptyList title="No services yet" text="Create services on the website to make them available for booking." />}</ScrollView>;
}

function PaymentsView({ bookings, currency }: { bookings: Booking[]; currency: string }) {
  const outstanding = bookings.filter((booking) => booking.amount_due_cents > booking.amount_paid_cents);
  const total = outstanding.reduce((sum, booking) => sum + booking.amount_due_cents - booking.amount_paid_cents, 0);
  return <ScrollView contentContainerStyle={styles.screenContent}><Text style={styles.pageKicker}>MONEY</Text><Text style={styles.pageTitle}>Payments</Text><View style={styles.balanceCard}><Text style={styles.balanceLabel}>OUTSTANDING TODAY</Text><Text style={styles.balanceValue}>{formatMoney(total, currency)}</Text><Text style={styles.balanceNote}>Open a booking to take payment securely.</Text></View><Text style={styles.listCount}>PAYMENT DUE</Text>{outstanding.length ? outstanding.map((booking) => <View key={booking.id} style={styles.bookingRow}><Text style={styles.time}>{formatTime(booking.starts_at)}</Text><View style={styles.bookingMain}><Text style={styles.customerName}>{booking.customer_name}</Text><Text style={styles.bookingMeta}>{formatMoney(booking.amount_paid_cents, currency)} paid · {formatMoney(booking.amount_due_cents - booking.amount_paid_cents, currency)} left</Text></View><Ionicons name="chevron-forward" size={18} color={PALETTE.muted} /></View>) : <EmptyList title="Nothing outstanding" text="Payments due from today's bookings will be listed here." />}</ScrollView>;
}

function ManagementView({ screen, business }: { screen: Exclude<Screen, Tab | "Clients" | "Staff" | "Services" | "Payments">; business: Business }) {
  const content: Record<string, { kicker: string; title: string; intro: string; cards: { title: string; text: string; icon: keyof typeof Ionicons.glyphMap }[] }> = {
    "Page builder": { kicker: "ONLINE BOOKING", title: "Page builder", intro: "Keep your public booking page aligned with your studio.", cards: [{ title: "Branding", text: "Logo, colours and visual style", icon: "color-palette-outline" }, { title: "Page content", text: "Welcome message and booking instructions", icon: "document-text-outline" }, { title: "Booking options", text: "Services, staff and availability", icon: "calendar-outline" }] },
    Settings: { kicker: "BUSINESS SETTINGS", title: "Settings", intro: `${business.name} is currently on the ${business.plan || "Solo"} plan.`, cards: [{ title: "Business details", text: "Name, email, phone and address", icon: "business-outline" }, { title: "Hours & availability", text: "Opening hours and booking rules", icon: "time-outline" }, { title: "Notifications", text: "Emails and booking updates", icon: "notifications-outline" }] },
    "Help centre": { kicker: "HOW CAN WE HELP?", title: "Help centre", intro: "Practical guides for running Bookzenvo day to day.", cards: [{ title: "Taking payments", text: "Deposits, balances and Stripe", icon: "card-outline" }, { title: "Your booking page", text: "Make it look and work your way", icon: "link-outline" }, { title: "Contact support", text: "Get help from the Bookzenvo team", icon: "chatbubble-ellipses-outline" }] },
    Reports: { kicker: "INSIGHTS", title: "Reports", intro: "Revenue, bookings and client trends are available on the web dashboard while the full mobile report suite is being completed.", cards: [{ title: "View web reports", text: "Open Bookzenvo in your browser", icon: "open-outline" }] },
    Stock: { kicker: "INVENTORY", title: "Stock", intro: "Keep an eye on the products you sell and use.", cards: [{ title: "View stock", text: "Manage products and stock levels", icon: "cube-outline" }] },
    Professionals: { kicker: "YOUR NETWORK", title: "Professionals", intro: "Independent providers connected to your studio.", cards: [{ title: "Professionals", text: "View professional accounts on the web dashboard", icon: "person-add-outline" }] },
    Assistant: { kicker: "BOOKZENVO AI", title: "Assistant", intro: "Get help planning your day, improving your page and understanding your bookings.", cards: [{ title: "Open Assistant", text: "Continue in the web dashboard", icon: "sparkles-outline" }] },
    "Import data": { kicker: "BRING IT WITH YOU", title: "Import data", intro: "Move your existing clients, services and bookings into Bookzenvo.", cards: [{ title: "Import from another system", text: "Open the import guide on the web dashboard", icon: "cloud-upload-outline" }] },
  };
  const data = content[screen];
  const routeForCard = (title: string) => {
    if (screen === "Help centre") return "/help";
    if (screen === "Page builder") return "/page-builder";
    if (screen === "Settings") return "/settings";
    if (screen === "Reports") return "/reports";
    if (screen === "Stock") return "/stock";
    if (screen === "Professionals") return "/professionals";
    if (screen === "Assistant") return "/assistant";
    if (screen === "Import data") return "/import";
    if (title === "Taking payments") return "/payments";
    return "/dashboard";
  };
  return <ScrollView contentContainerStyle={styles.screenContent}><Text style={styles.pageKicker}>{data.kicker}</Text><Text style={styles.pageTitle}>{data.title}</Text><Text style={styles.pageIntro}>{data.intro}</Text>{data.cards.map((card) => <Pressable key={card.title} onPress={() => Linking.openURL(`https://bookzenvo.com${routeForCard(card.title)}`)} style={styles.featureCard}><View style={styles.featureIcon}><Ionicons name={card.icon} size={21} color={PALETTE.ink} /></View><View style={styles.featureCopy}><Text style={styles.personName}>{card.title}</Text><Text style={styles.personMeta}>{card.text}</Text></View><Ionicons name="open-outline" size={18} color={PALETTE.muted} /></Pressable>)}</ScrollView>;
}

function EmptyList({ title, text }: { title: string; text: string }) { return <View style={styles.noBookings}><Text style={styles.noBookingsTitle}>{title}</Text><Text style={styles.noBookingsText}>{text}</Text></View>; }

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
  return <View style={styles.timelineRow}><Text style={styles.timelineTime}>{formatTime(booking.starts_at)}</Text><View style={styles.timelineDot} /><View style={styles.timelineCard}><Text style={styles.customerName}>{booking.customer_name}</Text><Text style={styles.bookingMeta}>{formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}</Text></View></View>;
}

function NoBookings() {
  return <View style={styles.noBookings}><Text style={styles.noBookingsTitle}>Nothing scheduled yet</Text><Text style={styles.noBookingsText}>New online bookings will appear here automatically.</Text></View>;
}

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { name: Tab; icon: keyof typeof Ionicons.glyphMap }[] = [{ name: "Today", icon: "time-outline" }, { name: "Calendar", icon: "calendar-outline" }, { name: "Bookings", icon: "list-outline" }, { name: "More", icon: "ellipsis-horizontal" }];
  return <View style={styles.tabBar}>{tabs.map((tab) => <Pressable key={tab.name} style={styles.tabButton} onPress={() => onChange(tab.name)}><Ionicons name={tab.icon} size={21} color={active === tab.name ? PALETTE.ink : PALETTE.muted} /><Text style={[styles.tabLabel, active === tab.name && styles.tabActive]}>{tab.name}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PALETTE.cream },
  centered: { flex: 1, padding: 32, justifyContent: "center", alignItems: "center", backgroundColor: PALETTE.ink },
  wordmark: { fontSize: 27, fontFamily: "CormorantGaramond_600SemiBold", color: PALETTE.white },
  loadingText: { marginTop: 16, color: "#d8d0c6", fontSize: 15 },
  setupTitle: { color: PALETTE.white, marginTop: 30, fontSize: 29, fontFamily: "CormorantGaramond_500Medium" },
  setupText: { color: "#d8d0c6", textAlign: "center", lineHeight: 22, marginTop: 14, maxWidth: 320 },
  codeCard: { marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: "#302d29", width: "100%" },
  codeText: { fontFamily: "monospace", color: "#e9dfd1", fontSize: 11, marginVertical: 3 },
  authShell: { flex: 1, backgroundColor: PALETTE.cream },
  authHero: { minHeight: 300, backgroundColor: PALETTE.ink, padding: 28, justifyContent: "space-between", paddingBottom: 34 },
  resetHero: { flex: 0.55, backgroundColor: PALETTE.ink, padding: 28, justifyContent: "space-between", paddingBottom: 34 },
  authHeadline: { color: PALETTE.white, fontFamily: "CormorantGaramond_500Medium", fontSize: 48, lineHeight: 48, letterSpacing: -1, marginTop: 45 },
  resetHeadline: { color: PALETTE.white, fontFamily: "CormorantGaramond_500Medium", fontSize: 41, lineHeight: 42, letterSpacing: -0.7, marginTop: 30 },
  authLead: { color: "#cbc4bb", fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 23, maxWidth: 300 },
  authScrollContent: { flexGrow: 1 },
  authForm: { paddingHorizontal: 28, paddingTop: 30, paddingBottom: 34 },
  eyebrow: { fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 2.2, color: PALETTE.goldDeep },
  authTitle: { fontFamily: "CormorantGaramond_500Medium", fontSize: 40, color: PALETTE.ink, marginTop: 11 },
  authSubtitle: { fontFamily: "DMSans_400Regular", color: PALETTE.muted, fontSize: 15, marginTop: 6, marginBottom: 28 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17 },
  label: { fontFamily: "DMSans_700Bold", color: "#716b64", fontSize: 11, letterSpacing: 1.1, marginBottom: 8 },
  forgot: { fontFamily: "DMSans_600SemiBold", color: PALETTE.goldDeep, fontSize: 13 },
  input: { fontFamily: "DMSans_400Regular", backgroundColor: PALETTE.white, borderWidth: 1, borderColor: PALETTE.line, borderRadius: 10, height: 54, paddingHorizontal: 15, color: PALETTE.ink, fontSize: 16 },
  primaryButton: { height: 56, borderRadius: 10, backgroundColor: PALETTE.ink, marginTop: 24, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontFamily: "DMSans_700Bold", color: PALETTE.white, fontSize: 16 },
  dimmed: { opacity: 0.6 },
  successText: { color: PALETTE.green, marginTop: 12, fontSize: 13 },
  authFootnote: { color: PALETTE.muted, textAlign: "center", fontSize: 13, marginTop: 20 },
  keyboardAccessory: { alignItems: "flex-end", paddingHorizontal: 20, paddingVertical: 10, backgroundColor: PALETTE.white, borderTopWidth: 1, borderColor: PALETTE.line },
  keyboardDone: { color: PALETTE.ink, fontSize: 16, fontWeight: "700" },
  appShell: { flex: 1, backgroundColor: PALETTE.cream },
  topBar: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", backgroundColor: PALETTE.cream },
  topTitleBlock: { flex: 1 },
  brandRow: { alignItems: "flex-start", marginBottom: 13 },
  brandWordmark: { color: PALETTE.goldDeep, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 3.7 },
  brandStudio: { color: PALETTE.ink, fontFamily: "CormorantGaramond_500Medium", fontSize: 44, lineHeight: 46, letterSpacing: -0.8, marginTop: 4, maxWidth: 280 },
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 5, marginLeft: -5 },
  backText: { fontFamily: "DMSans_600SemiBold", color: PALETTE.muted, fontSize: 13 },
  appTitle: { color: PALETTE.ink, fontFamily: "CormorantGaramond_500Medium", fontSize: 36, lineHeight: 39, marginTop: 4 },
  refreshButton: { height: 42, width: 42, borderRadius: 21, backgroundColor: PALETTE.sand, justifyContent: "center", alignItems: "center", marginTop: 1 },
  errorBanner: { marginHorizontal: 22, padding: 12, backgroundColor: "#f6e3e0", borderRadius: 10 },
  errorText: { color: PALETTE.red, fontSize: 13 },
  screenContent: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 112 },
  dateText: { color: PALETTE.goldDeep, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 1.8 },
  greeting: { color: PALETTE.ink, fontFamily: "CormorantGaramond_500Medium", fontSize: 41, lineHeight: 43, marginTop: 8, letterSpacing: -0.6 },
  summaryRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  metricCard: { flex: 1, padding: 16, backgroundColor: PALETTE.white, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.line, minHeight: 112, justifyContent: "space-between" },
  metricValue: { color: PALETTE.ink, fontSize: 32, fontFamily: "CormorantGaramond_500Medium" },
  metricLabel: { color: PALETTE.muted, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 31, marginBottom: 10 },
  sectionTitle: { color: PALETTE.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  sectionHint: { color: PALETTE.muted, fontSize: 13, fontFamily: "DMSans_400Regular" },
  bookingRow: { minHeight: 76, flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderColor: PALETTE.line },
  time: { color: PALETTE.ink, fontSize: 14, fontFamily: "DMSans_700Bold", width: 68 },
  bookingMain: { flex: 1, paddingRight: 8 },
  customerName: { color: PALETTE.ink, fontSize: 15, fontFamily: "DMSans_700Bold", textTransform: "capitalize" },
  bookingMeta: { color: PALETTE.muted, fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  bookingAmount: { color: PALETTE.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  noBookings: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#d7cebf", padding: 24, marginTop: 12, alignItems: "center" },
  noBookingsTitle: { color: PALETTE.ink, fontSize: 15, fontWeight: "700" },
  noBookingsText: { color: PALETTE.muted, textAlign: "center", lineHeight: 19, fontSize: 13, marginTop: 7 },
  timeline: { marginTop: 28 },
  timelineRow: { minHeight: 88, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  timelineTime: { width: 56, color: PALETTE.muted, fontFamily: "DMSans_600SemiBold", fontSize: 12 },
  timelineDot: { height: 10, width: 10, borderRadius: 5, backgroundColor: PALETTE.gold, marginHorizontal: 12 },
  timelineCard: { flex: 1, backgroundColor: PALETTE.white, borderRadius: 14, padding: 15, borderWidth: 1, borderColor: PALETTE.line, shadowColor: PALETTE.ink, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  accountCard: { marginTop: 25, backgroundColor: PALETTE.white, borderWidth: 1, borderColor: PALETTE.line, borderRadius: 14, padding: 17 },
  accountEmail: { color: PALETTE.ink, fontSize: 16, fontWeight: "700" },
  accountText: { color: PALETTE.muted, fontSize: 13, marginTop: 5 },
  managementGroup: { marginTop: 25 },
  groupLabel: { fontFamily: "DMSans_700Bold", color: PALETTE.goldDeep, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  managementCard: { backgroundColor: PALETTE.white, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.line, overflow: "hidden" },
  managementRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 15 },
  managementRowDivider: { borderBottomWidth: 1, borderBottomColor: PALETTE.line },
  managementIcon: { height: 35, width: 35, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: PALETTE.sand, marginRight: 12 },
  managementCopy: { flex: 1 },
  managementName: { fontFamily: "DMSans_700Bold", color: PALETTE.ink, fontSize: 14 },
  managementNote: { fontFamily: "DMSans_400Regular", color: PALETTE.muted, fontSize: 12, marginTop: 2 },
  pageKicker: { fontFamily: "DMSans_700Bold", color: PALETTE.goldDeep, fontSize: 10, letterSpacing: 1.7, marginTop: 5 },
  pageTitle: { fontFamily: "CormorantGaramond_500Medium", color: PALETTE.ink, fontSize: 42, lineHeight: 45, marginTop: 7 },
  pageIntro: { fontFamily: "DMSans_400Regular", color: PALETTE.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  searchBox: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.white, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, marginTop: 24 },
  searchInput: { flex: 1, fontFamily: "DMSans_400Regular", color: PALETTE.ink, fontSize: 15, paddingLeft: 9 },
  listCount: { fontFamily: "DMSans_700Bold", color: PALETTE.muted, fontSize: 10, letterSpacing: 1.2, marginTop: 22, marginBottom: 5 },
  personRow: { minHeight: 72, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: PALETTE.line },
  avatar: { height: 38, width: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: PALETTE.sand, marginRight: 12 },
  avatarText: { fontFamily: "CormorantGaramond_600SemiBold", color: PALETTE.ink, fontSize: 19 },
  personCopy: { flex: 1, paddingRight: 8 },
  personName: { fontFamily: "DMSans_700Bold", color: PALETTE.ink, fontSize: 15 },
  personMeta: { fontFamily: "DMSans_400Regular", color: PALETTE.muted, fontSize: 12, marginTop: 3 },
  statusPill: { backgroundColor: PALETTE.confirmedBg || "#EAEDE5", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  statusPillMuted: { backgroundColor: PALETTE.sand },
  statusPillText: { fontFamily: "DMSans_600SemiBold", color: PALETTE.green, fontSize: 11 },
  serviceCard: { minHeight: 88, borderWidth: 1, borderColor: PALETTE.line, borderRadius: 14, backgroundColor: PALETTE.white, padding: 15, flexDirection: "row", alignItems: "flex-start", marginBottom: 10, overflow: "hidden" },
  serviceAccent: { width: 4, alignSelf: "stretch", borderRadius: 3, marginRight: 12 },
  serviceCopy: { flex: 1 },
  serviceDescription: { fontFamily: "DMSans_400Regular", color: PALETTE.muted, fontSize: 12, marginTop: 7, lineHeight: 17 },
  servicePrice: { fontFamily: "CormorantGaramond_600SemiBold", color: PALETTE.ink, fontSize: 21, marginLeft: 8 },
  balanceCard: { marginTop: 21, backgroundColor: PALETTE.ink, padding: 20, borderRadius: 14 },
  balanceLabel: { fontFamily: "DMSans_700Bold", color: "#d8d0c6", fontSize: 10, letterSpacing: 1.4 },
  balanceValue: { fontFamily: "CormorantGaramond_500Medium", color: PALETTE.white, fontSize: 39, marginTop: 8 },
  balanceNote: { fontFamily: "DMSans_400Regular", color: "#d8d0c6", fontSize: 12, marginTop: 7 },
  featureCard: { minHeight: 86, backgroundColor: PALETTE.white, borderColor: PALETTE.line, borderWidth: 1, borderRadius: 14, marginBottom: 10, padding: 15, flexDirection: "row", alignItems: "center" },
  featureIcon: { height: 39, width: 39, borderRadius: 10, backgroundColor: PALETTE.sand, alignItems: "center", justifyContent: "center", marginRight: 12 },
  featureCopy: { flex: 1 },
  signOutButton: { marginTop: 27, height: 52, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.line, alignItems: "center", justifyContent: "center", backgroundColor: PALETTE.white },
  signOutText: { color: PALETTE.red, fontWeight: "700", fontSize: 15 },
  emptyWrap: { margin: 22, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.white },
  emptyTitle: { color: PALETTE.ink, fontSize: 25, fontFamily: "CormorantGaramond_500Medium" },
  emptyText: { color: PALETTE.muted, lineHeight: 21, marginTop: 9 },
  tabBar: { flexDirection: "row", height: 82, borderTopWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.cream, paddingHorizontal: 8, paddingBottom: 4 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  tabLabel: { color: PALETTE.muted, fontFamily: "DMSans_600SemiBold", fontSize: 11 },
  tabActive: { color: PALETTE.ink },
});
