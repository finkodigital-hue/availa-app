const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && ['WebWorkspace', 'workspacePathFromDeepLink'].includes(node.name?.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'MOBILE_WORKSPACE_ROUTES')),
).map(node => node.getText(ast)).join('\n');
const compiled = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const find = (tree, predicate) => predicate(tree) ? tree : tree?.children?.flat(Infinity).map(child => find(child, predicate)).find(Boolean);
function fixture(userId, initialPath = '/dashboard') {
  const slots = [], deps = [], effects = [], external = [], injections = [];
  let cursor = 0, requestedPath = initialPath;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn) { const index = cursor++; if (!(index in slots)) slots[index] = fn(); return slots[index]; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useEffect(fn, next) { const index = cursor++; if (!deps[index] || next.some((value, key) => value !== deps[index][key])) effects.push(() => { fn(); deps[index] = next; }); },
    supabase: null, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    useNetworkState: () => ({ isConnected: true }), URL, URLSearchParams, Set, JSON, Date, setTimeout() {},
    mobileConfiguration: { appUrl: 'https://bookzenvo.com' }, WORKSPACE_AUTH_STORAGE_KEY: 'bookzenvo-auth',
    workspaceSessionScript: session => `/* verified session ${session.user.id} */`, workspaceSignOutScript: () => '',
    SafeAreaView: 'SafeAreaView', View: 'View', Text: 'Text', Pressable: 'Pressable', StatusBar: 'StatusBar',
    WebView: 'WebView', ActivityIndicator: 'ActivityIndicator', Ionicons: 'Ionicons', styles: {}, PALETTE: {}, Platform: { OS: 'ios' },
    Linking: { openURL: async url => external.push(url), parse(value) { const url = new URL(value); return { scheme: url.protocol.slice(0, -1), hostname: url.hostname, path: url.pathname, queryParams: Object.fromEntries(url.searchParams) }; } },
    Alert: { alert() {} },
  });
  vm.runInContext(compiled, context);
  function render() {
    cursor = 0;
    const tree = context.WebWorkspace({ session: { access_token: 'fixture', user: { id: userId } }, workspacePath: requestedPath });
    effects.splice(0).forEach(fn => fn());
    const web = find(tree, node => node?.type === 'WebView');
    if (web) web.props.ref.current = { injectJavaScript: value => injections.push(value) };
    return tree;
  }
  return { context, render, external, injections, changePath(value) { requestedPath = value; render(); return render(); } };
}
const accountButton = tree => find(tree, node => node?.props?.accessibilityLabel === 'Account and data');
const webView = tree => find(tree, node => node?.type === 'WebView');
for (const identity of ['owner', 'staff', 'no-workspace-user']) {
  const app = fixture(identity, identity === 'no-workspace-user' ? '/onboarding' : '/dashboard');
  let tree = app.render();
  const button = accountButton(tree); assert(button, `${identity} has account access without a business/role lookup`);
  assert.equal(button.props.accessibilityRole, 'button');
  button.props.onPress(); tree = app.render(); let web = webView(tree);
  assert.equal(web.props.source.uri, 'https://bookzenvo.com/account-data');
  assert(web.props.injectedJavaScriptBeforeContentLoaded.includes(identity), 'existing signed-in bridge is retained');
  assert(!web.props.source.uri.includes('fixture'), 'session never enters account URL');
  const firstKey = web.props.key; accountButton(tree).props.onPress(); tree = app.render(); web = webView(tree);
  assert.notEqual(web.props.key, firstKey, 'repeat native entry remounts after website navigation/plan redirect');
  web.props.onError(); tree = app.render(); assert.equal(webView(tree), undefined);
  assert(accountButton(tree), 'workspace failure retains native account entry');
  accountButton(tree).props.onPress(); tree = app.render(); web = webView(tree);
  assert.equal(web.props.source.uri, 'https://bookzenvo.com/account-data', 'failed workspace can retry the independent account page');
  assert.equal(app.external.length, 0, 'account entry stays inside authenticated WebView');
  const linked = app.changePath('/consultations'); assert.equal(webView(linked).props.source.uri, 'https://bookzenvo.com/consultations', 'later workspace deep link supersedes native account page');
}
for (const unsafe of ['https://evil.example/account-data', '//evil.example/account-data', '/\\evil.example/account-data', '/account-data#access_token=secret', '/account-data\n', '/' + 'a'.repeat(2048)]) {
  assert.equal(webView(fixture('staff', unsafe).render()).props.source.uri, 'https://bookzenvo.com/dashboard', unsafe);
}
const clean = webView(fixture('staff', '/account-data?access_token=secret&refresh_token=secret').render()).props.source.uri;
assert.equal(clean, 'https://bookzenvo.com/account-data', 'auth credentials stripped from native path source');
const deepLink = fixture('no-workspace-user').context.workspacePathFromDeepLink;
assert.equal(deepLink('bookzenvo://workspace/account-data'), '/account-data');
assert.equal(deepLink('bookzenvo://account-data'), '/account-data');
for (const unsafe of ['bookzenvo://workspace/account-data/extra', 'bookzenvo://user:pass@workspace/account-data', 'bookzenvo://workspace/account-data#secret', 'bookzenvo://workspace/account-data?' + 'x'.repeat(4096)]) assert.equal(deepLink(unsafe), null);
console.log('Native account entry passed: owner/staff/no-workspace access, failure/redirect recovery, same-origin authenticated navigation, repeat entry, deep links and bounded unsafe paths. No provider or network calls.');
