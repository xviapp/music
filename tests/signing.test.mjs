import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {initializeSigning} from '../scripts/init-signing.mjs';

test('generates a valid private release key and refuses to overwrite it',t=>{
  const root=mkdtempSync(join(tmpdir(),'music-signing-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const result=initializeSigning(root);
  const properties=readFileSync(result.properties,'utf8');
  const password=properties.match(/^storePassword=(.+)$/m)?.[1];
  assert.ok(password&&/^[0-9a-f]{64}$/.test(password),'uses a cryptographically generated password');
  assert.equal(statSync(result.directory).mode&0o777,0o700);
  assert.equal(statSync(result.keystore).mode&0o777,0o600);
  assert.equal(statSync(result.properties).mode&0o777,0o600);
  const check=spawnSync('keytool',['-list','-keystore',result.keystore,'-storetype','PKCS12','-alias','music-release','-storepass:env','MUSIC_TEST_STORE_PASSWORD'],{env:{...process.env,MUSIC_TEST_STORE_PASSWORD:password},stdio:'ignore'});
  assert.equal(check.status,0,'keytool can read the generated signing entry');
  assert.throws(()=>initializeSigning(root),/已存在/);
  assert.ok(readFileSync(result.properties,'utf8')===properties,'existing credentials are unchanged');
});
test('does not overwrite a partially initialized signing configuration',t=>{
  const root=mkdtempSync(join(tmpdir(),'music-signing-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const directory=join(root,'.signing');mkdirSync(directory);
  writeFileSync(join(directory,'release.properties'),'existing configuration');
  assert.throws(()=>initializeSigning(root),/已存在/);
  assert.equal(readFileSync(join(directory,'release.properties'),'utf8'),'existing configuration');
});
