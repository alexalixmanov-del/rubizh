// Stage 4 (ТЗ §8): server-side staff provisioning and recovery — the CLI knows the five roles, applies the same password
// policy as the CRM (local weak list, argon2id/bcrypt), and a lost TOTP device is recovered only on the server, audited.
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {startCrm,staffEmail} from './helpers/crm-fixture.mjs';import {runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const cli=(s,args,input='')=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,s.site+'/dev/staff-user.php',...args],{env:phpEnv,encoding:'utf8',input,timeout:120000});

test('staff CLI: five roles, CRM password policy, TOTP recovery for a lost device is audited and ends sessions',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const ok=cli(s,['--email=buh@fixture.test','--name=Бухгалтер Тест','--role=ACCOUNTANT','--reason=Створення бухгалтера для перевірки'],'Kvitka-Sad-2026-Lypen');
  assert.equal(ok.status,0,ok.stderr);assert.equal(s.sql("SELECT role FROM rubizh_staff_users WHERE email='buh@fixture.test'")[0].role,'ACCOUNTANT');
  assert.match(s.sql("SELECT password_hash FROM rubizh_staff_users WHERE email='buh@fixture.test'")[0].password_hash,/^\$(argon2id|2y\$1[2-9])/);
  for(const role of ['WAREHOUSE','SUPPORT'])assert.equal(cli(s,['--email='+role.toLowerCase()+'2@fixture.test','--name=Тест '+role,'--role='+role,'--reason=Створення співробітника для перевірки'],'Kvitka-Sad-2026-Lypen').status,0,role);
  const weak=cli(s,['--email=weak@fixture.test','--name=Слабкий Пароль','--role=MANAGER','--reason=Перевірка слабкого пароля'],'aaaaaaaaaaaaaaa');
  assert.notEqual(weak.status,0,'weak password refused');assert.match(weak.stderr,/password/i);assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_staff_users WHERE email='weak@fixture.test'")[0].n,0);
  // Lost device: an enabled TOTP is removed only through the server CLI; sessions end; the next login enrols again.
  const owner=s.sql("SELECT id,session_version FROM rubizh_staff_users WHERE email='"+staffEmail('OWNER')+"'")[0];
  s.sql("INSERT INTO rubizh_staff_totp(staff_id,secret_enc,enabled_at,last_step,updated_at) VALUES('"+owner.id+"','x',UTC_TIMESTAMP(),0,UTC_TIMESTAMP())");
  assert.notEqual(cli(s,['--reset-totp','--email='+staffEmail('OWNER')]).status,0,'reason required');
  const r=cli(s,['--reset-totp','--email='+staffEmail('OWNER'),'--reason=Власник втратив телефон з автентифікатором']);assert.equal(r.status,0,r.stderr);
  assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_staff_totp WHERE staff_id='"+owner.id+"'")[0].n,0);
  assert.equal(+s.sql("SELECT session_version FROM rubizh_staff_users WHERE id='"+owner.id+"'")[0].session_version,+owner.session_version+1,'all sessions end');
  assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_staff_audit WHERE entity_id='"+owner.id+"' AND action='staff.totp_reset'")[0].n,1,'audited');
  assert.notEqual(cli(s,['--reset-totp','--email=nobody@fixture.test','--reason=Немає такого співробітника']).status,0);
 }finally{s.stop();}
});
