import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminRequest, adminHostMatches, _clearJwksCacheForTest } from '../src/admin-auth.js';
import worker from '../src/worker.js';

const aud = 'a'.repeat(64);
const env = {
  ADMIN_HOST:'beheer.okkiedarts.nl',
  CF_ACCESS_TEAM_DOMAIN:'voorbeeld.cloudflareaccess.com',
  CF_ACCESS_AUD:aud,
  ADMIN_ALLOWED_EMAILS:'beheerder@example.com'
};
const encoder = new TextEncoder();
const b64 = bytes => Buffer.from(bytes).toString('base64url');
async function jwt({email='beheerder@example.com',audience=aud,expired=false,wrongSignature=false}={}) {
  const pair = await crypto.subtle.generateKey({
    name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
  },true,['sign','verify']);
  const jwk = await crypto.subtle.exportKey('jwk',pair.publicKey);
  jwk.kid='test-key';
  const now=Math.floor(Date.now()/1000);
  const a=b64(encoder.encode(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'})));
  const b=b64(encoder.encode(JSON.stringify({iss:'https://voorbeeld.cloudflareaccess.com',aud:[audience],email,exp:now+(expired?-10:120),nbf:now-60})));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,encoder.encode(a+'.'+b));
  const token=a+'.'+b+'.'+b64(signature);
  return {token:wrongSignature?token.slice(0,-5)+'12345':token,
    fetchCert:async()=>({ok:true,json:async()=>({keys:[jwk]})})};
}
test('beheer weigert standaard ieder verzoek zonder juiste configuratie en domein', async()=>{
  const request=new Request('https://beheer.okkiedarts.nl/v1/admin/overview');
  assert.equal(await isAdminRequest(request,{}),false);
  assert.equal(adminHostMatches(new Request('https://api.okkiedarts.nl/beheer'),env),false);
  assert.equal(adminHostMatches(request,env),true);
  const blocked=await worker.fetch(request,{DB:{}});
  assert.equal(blocked.status,403); // fail closed even when database is present
});
test('Access JWT moet correct ondertekend zijn, publiekshost en e-mailadres kloppen',async()=>{
  for(const input of [{},{email:'bezoeker@example.com'},{audience:'b'.repeat(64)},{expired:true},{wrongSignature:true}]){
    _clearJwksCacheForTest();
    const {token,fetchCert}=await jwt(input);
    const req=new Request('https://beheer.okkiedarts.nl/v1/admin/overview',{headers:{'Cf-Access-Jwt-Assertion':token}});
    const actual=await isAdminRequest(req,env,fetchCert);
    assert.equal(actual,Object.keys(input).length===0,JSON.stringify(input));
    const onApi=new Request('https://api.okkiedarts.nl/v1/admin/overview',{headers:{'Cf-Access-Jwt-Assertion':token}});
    assert.equal(await isAdminRequest(onApi,env,fetchCert),false);
  }
});
