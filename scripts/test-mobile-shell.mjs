import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../mobile/package.json', import.meta.url))('typescript');
const source = fs.readFileSync(new URL('../mobile/App.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shell = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WebWorkspace').getText(tree);
const js = ts.transpileModule(shell, {compilerOptions:{jsx:ts.JsxEmit.React, target:ts.ScriptTarget.ES2022}}).outputText;
const links = [], injections = [], alerts = [];
const context = vm.createContext({
  React:{createElement:(type, props, ...children)=>({type,props,children})},
  useRef:value=>({current:value}), useMemo:fn=>fn(), useState:value=>[value,()=>{}],useEffect:()=>{},
  supabase:null, AppState:{currentState:'active'},useNetworkState:()=>({isConnected:true}),
  process:{env:{}},URL,JSON,Date,setTimeout:()=>{},
  WORKSPACE_AUTH_STORAGE_KEY:'bookzenvo-auth',workspaceSessionScript:()=>'',workspaceSignOutScript:()=>'',
  SafeAreaView:'SafeAreaView',View:'View',Text:'Text',Pressable:'Pressable',StatusBar:'StatusBar',
  WebView:'WebView',ActivityIndicator:'ActivityIndicator',Ionicons:'Ionicons',
  styles:{},PALETTE:{white:'white'},Platform:{OS:'android'},
  Linking:{openURL:async url=>links.push(url)},Alert:{alert:(...args)=>alerts.push(args)},
});
vm.runInContext(js, context);
const rendered = context.WebWorkspace({session:{access_token:'fixture',user:{id:'owner'}},workspacePath:'/reports'});
const find = node => node?.type==='WebView'?node:(node?.children??[]).map(find).find(Boolean);
const view = find(rendered);
assert.ok(view);
const message = (data,url='https://bookzenvo.com/reports')=>view.props.onMessage({nativeEvent:{data:JSON.stringify(data),url}});
await message({type:'print-in-browser',url:'https://bookzenvo.com/reports'});
assert.deepEqual(links,['https://bookzenvo.com/reports'],'Print opens system browser even for own origin');
await message({type:'print-in-browser',url:'https://evil.example/reports'});
await message({type:'print-in-browser',url:'https://bookzenvo.com/reports'},'https://evil.example');
await message({type:'open-external',url:'javascript:alert(1)'});
assert.equal(links.length,1,'Foreign-origin messages and unsafe protocols are ignored');
assert.equal(view.props.onShouldStartLoadWithRequest({url:'https://bookzenvo.com/calendar'}),true);
assert.equal(view.props.onShouldStartLoadWithRequest({url:'https://evil.example'}),false);

const sent = [], fetched = [];
class Xhr {open(){} setRequestHeader(){} send(){} addEventListener(){}}
const window = {location:{origin:'https://bookzenvo.com',href:'https://bookzenvo.com/reports'},
 ReactNativeWebView:{postMessage:value=>sent.push(JSON.parse(value))},
 __bookzenvoNativeAccessToken:'fixture-access',fetch:async(input,init)=>{fetched.push({input,init});return {status:200};}};
const element = {setAttribute(){},appendChild(){}};
const page = vm.createContext({window,XMLHttpRequest:Xhr,Request,Headers,URL,JSON,
 document:{querySelector:()=>element,createElement:()=>({...element}),head:element,addEventListener(){}}});
vm.runInContext(view.props.injectedJavaScript,page);
window.print();
assert.deepEqual(sent.at(-1),{type:'print-in-browser',url:'https://bookzenvo.com/reports'});
await window.fetch('/api/check');
assert.equal(fetched.at(-1).init.headers.get('Authorization'),'Bearer fixture-access');
await window.fetch('/api/check',{headers:{Authorization:'Bearer web-mfa'}});
assert.equal(fetched.at(-1).init.headers.get('Authorization'),'Bearer web-mfa','Existing MFA auth must not be overwritten');
await window.fetch('https://external.example');
assert.equal(fetched.at(-1).init,undefined,'Native tokens never attach to external requests');
console.log('Actual mobile shell regressions passed: print routing, origin/message guards, navigation, same-origin auth and MFA header preservation.');
