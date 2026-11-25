const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
function load(relative) {
  const exports = {};
  vm.runInNewContext(transpile(fs.readFileSync(path.join(root, relative), 'utf8')), {
    exports, URL, URLSearchParams, Request, AbortController, setTimeout, clearTimeout,
  });
  return exports;
}
const { resolveMobileConfiguration } = load('src/lib/mobile-config.ts');
const { createTimedFetch } = load('src/lib/timed-fetch.ts');
const { recoverySessionFromDeepLink } = load('src/lib/workspace-session.ts');
const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = new Set(['App', 'workspacePathFromDeepLink', 'SignInScreen', 'NewPasswordScreen']);
const executable = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && selected.has(node.name?.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'MOBILE_WORKSPACE_ROUTES')),
).map(node => node.getText(ast)).join('\n');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const find = (tree, match) => match(tree) ? tree : tree?.children?.flat(Infinity).map(child => find(child, match)).find(Boolean);
function fixture() {
  const boot = deferred(), initialLink = deferred();
  const slots = [], effects = [], dependencies = [], cleanups = [], alerts = [], timers = new Map();
  let cursor = 0, timerId = 0, authEvent, linkEvent, unsubscribed = 0, removed = 0;
  const auth = {
    getSession: () => boot.promise,
    onAuthStateChange(callback) { authEvent = callback; return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; },
    setSession: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  };
  const context = vm.createContext({
    exports: {}, URL, URLSearchParams, JSON, Set,
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(fn, next) {
      const index = cursor++;
      if (!dependencies[index] || next.some((value, key) => value !== dependencies[index][key])) effects.push(() => {
        cleanups[index]?.(); cleanups[index] = fn(); dependencies[index] = next;
      });
    },
    useFonts: () => [true, null],
    cleanWorkspaceExports: async () => {}, FileSystem: {},
    supabase: { auth }, isSupabaseConfigured: true,
    setTimeout(fn, duration) { const id = ++timerId; timers.set(id, { fn, duration }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Linking: {
      getInitialURL: () => initialLink.promise,
      addEventListener(_event, callback) { linkEvent = callback; return { remove() { removed++; } }; },
      parse(value) { const url = new URL(value); return { scheme: url.protocol.slice(0, -1), hostname: url.hostname, path: url.pathname, queryParams: Object.fromEntries(url.searchParams) }; },
    },
    Alert: { alert: (...args) => alerts.push(args) }, recoverySessionFromDeepLink,
    nativeGoogleSignIn: null, googleSignInEnabled: false,
    CormorantGaramond_500Medium: {}, CormorantGaramond_600SemiBold: {}, DMSans_400Regular: {},
    DMSans_500Medium: {}, DMSans_600SemiBold: {}, DMSans_700Bold: {},
    SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', LoadingScreen: 'LoadingScreen',
    ConfigurationRequired: 'ConfigurationRequired', StartupUnavailable: 'StartupUnavailable', WebWorkspace: 'WebWorkspace',
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
    StatusBar: 'StatusBar', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
    Wordmark: 'Wordmark', KeyboardDoneAccessory: 'KeyboardDoneAccessory',
    Platform: { OS: 'ios' }, styles: {}, PALETTE: {}, AUTH_KEYBOARD_ACCESSORY_ID: 'keyboard',
  });
  vm.runInContext(transpile(executable), context);
  const render = (component = 'App', props = {}) => {
    cursor = 0; const tree = context[component](props); effects.splice(0).forEach(fn => fn()); return tree;
  };
  return { context, render, auth, boot, initialLink, alerts, slots,
    emit: (event, session) => authEvent(event, session),
    link: url => linkEvent({ url }),
    expire: () => { for (const { fn, duration } of [...timers.values()]) if (duration === 20_000) fn(); },
    unmount: () => cleanups.filter(Boolean).forEach(fn => fn()),
    cleanupCounts: () => [unsubscribed, removed],
  };
}

(async () => {
  assert.equal(resolveMobileConfiguration(undefined).supabaseUrl, 'https://bookzenvo.com/api/supabase');
  assert.equal(resolveMobileConfiguration('https://preview.example/').appUrl, 'https://preview.example');
  assert.notEqual(resolveMobileConfiguration('https://preview.example').authStorageKey, resolveMobileConfiguration(undefined).authStorageKey, 'preview and production credentials are isolated');
  for (const invalid of ['http://bookzenvo.com', 'javascript:bad', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?redirect=evil', 'https://example.com/#fragment', 'not a URL']) {
    assert.equal(resolveMobileConfiguration(invalid, true), null, invalid);
  }
  assert.equal(resolveMobileConfiguration('http://localhost:4173'), null);
  assert.equal(resolveMobileConfiguration('http://localhost:4173', true).appUrl, 'http://localhost:4173');
  assert.equal(resolveMobileConfiguration('http://192.168.1.5:4173', true), null);
  const supabaseSource = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
  assert(!supabaseSource.includes('EXPO_PUBLIC_SUPABASE_'), 'auth cannot be configured to a different backend');
  assert(supabaseSource.includes('createSecureSessionStore(SecureStore)'), 'audited atomic session store remains active');

  let attempted = 0, requestSignal;
  const bounded = createTimedFetch(async (_input, init) => { attempted++; requestSignal = init.signal; return await new Promise(() => {}); }, 5);
  await assert.rejects(bounded('https://fixture.example'), /could not connect/);
  assert(requestSignal.aborted);
  const abort = new AbortController();
  const cancelled = bounded('https://fixture.example', { signal: abort.signal });
  abort.abort();
  await assert.rejects(cancelled, /cancelled/);
  const before = attempted;
  await assert.rejects(bounded(new Request('https://fixture.example', { signal: abort.signal })), /cancelled/);
  assert.equal(attempted, before, 'already cancelled requests do not start');
  const response = { ok: true };
  assert.equal(await createTimedFetch(async () => response)('https://fixture.example'), response);

  const next = { access_token: 'fixture-new', user: { id: 'new-owner' } };
  const old = { access_token: 'fixture-old', user: { id: 'old-owner' } };
  const race = fixture(); race.render(); race.emit('SIGNED_IN', next);
  race.boot.resolve({ data: { session: old }, error: null }); await flush();
  assert.equal(find(race.render(), t => t?.type === 'WebWorkspace').props.session, next);
  race.emit('SIGNED_OUT', null);
  assert(find(race.render(), t => t?.type === race.context.SignInScreen));
  race.unmount(); assert.deepEqual(race.cleanupCounts(), [1, 1]);
  const previous = JSON.stringify(race.slots); race.emit('SIGNED_IN', old); await flush();
  assert.equal(JSON.stringify(race.slots), previous, 'late callbacks after unmount are ignored');

  const signedOut = fixture(); signedOut.render(); signedOut.emit('SIGNED_OUT', null);
  signedOut.boot.resolve({ data: { session: old }, error: null }); await flush();
  assert(find(signedOut.render(), t => t?.type === signedOut.context.SignInScreen), 'boot cannot undo sign-out');
  const broken = fixture(); broken.render(); broken.boot.reject(new Error('storage unavailable')); await flush();
  const retry = find(broken.render(), t => t?.type === 'StartupUnavailable'); assert(retry);
  broken.auth.getSession = async () => ({ data: { session: next }, error: null }); retry.props.retry(); broken.render(); await flush();
  assert.equal(find(broken.render(), t => t?.type === 'WebWorkspace').props.session, next);
  const returnedError = fixture(); returnedError.render(); returnedError.boot.resolve({ data: { session: null }, error: new Error('offline') }); await flush();
  assert(find(returnedError.render(), t => t?.type === 'StartupUnavailable'));
  const hung = fixture(); hung.render(); hung.expire();
  assert(find(hung.render(), t => t?.type === 'StartupUnavailable'), 'a hung startup has a usable retry');
  hung.boot.resolve({ data: { session: old }, error: null }); await flush();
  assert(find(hung.render(), t => t?.type === 'StartupUnavailable'), 'late timed-out result is ignored');
  const fonts = fixture(); fonts.context.useFonts = () => [false, new Error('font failure')]; fonts.render();
  fonts.emit('SIGNED_IN', next); assert(find(fonts.render(), t => t?.type === 'WebWorkspace'), 'font failure does not trap startup');

  const links = fixture(); links.render(); links.emit('SIGNED_IN', next);
  for (const route of ['gift-cards', 'consultations', 'appointment-waitlist']) {
    links.link(`bookzenvo://workspace/${route}`); await flush();
    assert.equal(find(links.render(), t => t?.type === 'WebWorkspace').props.workspacePath, `/${route}`);
  }
  assert.equal(links.context.workspacePathFromDeepLink('bookzenvo://workspace/bookings?bookingId=fixture&access_token=secret'), '/bookings?bookingId=fixture');
  for (const bad of ['https://bookzenvo.com/calendar', 'bookzenvo://user:pass@workspace/calendar', 'bookzenvo://workspace/calendar/extra', 'bookzenvo://workspace/calendar#access_token=secret', 'broken']) assert.equal(links.context.workspacePathFromDeepLink(bad), null);
  links.auth.setSession = async () => { throw new Error('offline'); };
  links.link('bookzenvo://auth/reset#type=recovery&access_token=fixture&refresh_token=fixture'); await flush();
  assert.equal(links.alerts.at(-1)[0], 'Could not open link');
  links.initialLink.reject(new Error('link unavailable')); await flush();
  assert.equal(links.alerts.length, 2);
  const recoveryRace = fixture(); recoveryRace.render(); recoveryRace.emit('SIGNED_IN', next);
  let recoverySignOuts = 0;
  recoveryRace.auth.signOut = async () => { recoverySignOuts++; recoveryRace.emit('SIGNED_OUT', null); return { error: null }; };
  const recovering = deferred(); recoveryRace.auth.setSession = async () => { await recovering.promise; recoveryRace.emit('SIGNED_IN', old); return { error: null }; };
  recoveryRace.link('bookzenvo://auth/reset#type=recovery&access_token=fixture&refresh_token=fixture'); await flush();
  recoveryRace.emit('SIGNED_OUT', null); recovering.resolve({ error: null }); await flush();
  assert.equal(recoverySignOuts, 1, 'an already-started stale SDK session write is followed by local sign-out');
  assert(find(recoveryRace.render(), t => t?.type === recoveryRace.context.SignInScreen), 'late recovery cannot reopen reset after sign-out');

  const signIn = fixture(); let form = signIn.render('SignInScreen');
  assert(!find(form, t => t?.children?.includes('Continue with Google')), 'Google stays hidden until configured');
  find(form, t => t?.props?.autoComplete === 'email').props.onChangeText('owner@example.test');
  find(form, t => t?.props?.autoComplete === 'password').props.onChangeText('fixture-password');
  form = signIn.render('SignInScreen'); const pending = deferred(); let calls = 0;
  signIn.auth.signInWithPassword = () => { calls++; return pending.promise; };
  const submit = find(form, t => t?.props?.autoComplete === 'password').props.onSubmitEditing;
  const first = submit(); await submit(); assert.equal(calls, 1, 'duplicate keyboard/button submission is prevented');
  pending.reject(new Error('offline')); await first;
  assert.equal(signIn.alerts.at(-1)[0], 'Could not sign in'); assert.equal(signIn.slots[2], false, 'form exits busy state after rejection');
  signIn.auth.resetPasswordForEmail = async () => { throw new Error('offline'); };
  form = signIn.render('SignInScreen');
  const forgot = find(form, t => t?.type === 'Pressable' && find(t, child => child?.children?.includes('Forgot?')));
  await forgot.props.onPress(); assert.equal(signIn.alerts.at(-1)[0], 'Could not send reset link'); assert.equal(signIn.slots[2], false);

  const google = fixture(); google.context.googleSignInEnabled = true;
  let googleStarts = 0; const googlePending = deferred();
  google.context.nativeGoogleSignIn = { start: () => { googleStarts++; return googlePending.promise; }, cancel: async () => {} };
  const googleForm = google.render('SignInScreen');
  const googleButton = find(googleForm, t => t?.type === 'Pressable' && find(t, child => child?.children?.includes('Continue with Google')));
  assert(googleButton); const googleFirst = googleButton.props.onPress(); await googleButton.props.onPress();
  assert.equal(googleStarts, 1); googlePending.resolve(); await googleFirst; assert.equal(google.slots[2], false, 'cancelled Google flow restores email/password controls');

  const password = fixture(); let passwordForm = password.render('NewPasswordScreen', { onComplete() {} });
  const inputs = [];
  const collect = tree => { if (tree?.type === 'TextInput') inputs.push(tree); tree?.children?.flat(Infinity).forEach(collect); };
  collect(passwordForm); inputs[0].props.onChangeText('fixture-password'); inputs[1].props.onChangeText('fixture-password');
  password.auth.updateUser = async () => { throw new Error('offline'); };
  passwordForm = password.render('NewPasswordScreen', { onComplete() {} });
  await find(passwordForm, t => t?.props?.onSubmitEditing).props.onSubmitEditing();
  assert.equal(password.alerts.at(-1)[0], 'Could not finish updating password'); assert.equal(password.slots[2], false);
  console.log('Mobile release regressions passed: gateway origin, bounded/cancelled requests, actual startup races/errors/retry, recovery/deep links, font fallback and auth-form failures/duplicate submissions. No network or real accounts used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
