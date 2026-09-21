import assert from 'node:assert/strict';
import { requireVerifiedIdentity } from '../src/lib/verified-identity.server.ts';
const verified={id:'fictional-owner',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'};
const client=(user,aal='aal1',sub=user?.id,error=null)=>({auth:{
  getUser:async()=>({data:{user},error}),
  getClaims:async()=>({data:{claims:{sub,aal}},error:null}),
}});
assert.equal((await requireVerifiedIdentity(client(verified),'test')).user.id,verified.id);
await assert.rejects(requireVerifiedIdentity(client({...verified,email_confirmed_at:null}),'test'),/Email verification/);
const mfa={...verified,factors:[{status:'verified'}]};
await assert.rejects(requireVerifiedIdentity(client(mfa),'test'),/Two-factor/);
await requireVerifiedIdentity(client(mfa,'aal2'),'test');
await assert.rejects(requireVerifiedIdentity(client(verified,'aal2','different-user'),'test'),/Unauthorized/);
await assert.rejects(requireVerifiedIdentity(client(null),'test'),/Unauthorized/);
await assert.rejects(requireVerifiedIdentity(client(verified,'aal2',verified.id,new Error('revoked')),'test'),/Unauthorized/);
console.log('7 server identity regression checks passed.');
