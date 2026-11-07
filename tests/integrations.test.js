import test from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATIONS, CAPABILITY_GROUPS, integrationStatus } from '../src/lib/integrations.js';
import { FEATURE_FLAGS, PROVIDER_REQUIRED_FLAGS } from '../src/lib/feature-flags.js';

test('provider registry contains unique ids and named server secrets',()=>{
  const ids=INTEGRATIONS.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const provider of INTEGRATIONS){assert.ok(provider.name);assert.ok(provider.setup || provider.secrets.length);assert.ok(provider.capabilities.length);}
});
test('providers are never marked configured without all required keys',()=>{
  for(const provider of INTEGRATIONS)assert.equal(integrationStatus(provider.id,{}),provider.setup?'manual_setup':'needs_setup');
  assert.equal(integrationStatus('github',{GITHUB_TOKEN_JARVIS:'present',GITHUB_OWNER:'owner',GITHUB_REPO:'repo'}),'configured');
  assert.equal(integrationStatus('cloudflare',{CLOUDFLARE_API_TOKEN:'present'}),'needs_setup');
});
test('capability roadmap covers the expected major product areas',()=>{
  for(const id of ['chat','research','creation','developer','agent','voice'])assert.ok(CAPABILITY_GROUPS.some(group=>group.id===id));
});
test('provider-dependent features default to disabled until keys exist',()=>{
  for(const key of ['imageGeneration','webResearch','githubActions','cloudflareDeployments','voiceOutput'])assert.equal(FEATURE_FLAGS[key],false);
  assert.ok(PROVIDER_REQUIRED_FLAGS.githubActions.includes('GITHUB_TOKEN'));
});
