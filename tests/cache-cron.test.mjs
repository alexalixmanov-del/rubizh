import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
test('Cache cron preserves private existing tasks, is idempotent and does not overwrite unreadable schedules',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-cron-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),table=path.join(dir,'table');
 mkdirSync(path.join(site,'shop'),{recursive:true});mkdirSync(bin);writeFileSync(path.join(site,'shop/cache-worker.php'),'<?php');
 writeFileSync(path.join(bin,'crontab'),`#!/usr/bin/env bash\nif [[ "\${BLOCK_CRON:-}" = 1 ]]; then echo 'permission denied' >&2; exit 1; fi\nif [[ "$1" = -l ]]; then if [[ -f "$CRON_TABLE" ]]; then cat "$CRON_TABLE"; else echo 'no crontab for test' >&2; exit 1; fi; else cp "$1" "$CRON_TABLE"; fi\n`,{mode:0o755});
 writeFileSync(path.join(bin,'php'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 const run=(args=[],extra={})=>spawnSync('bash',[path.join(root,'dev/install-cache-cron.sh'),site,...args],{env:{...process.env,PATH:bin+':'+process.env.PATH,CRON_TABLE:table,...extra},encoding:'utf8',timeout:5000});
 try{
  const original='MAILTO=owner@example.com\n15 * * * * existing-worker --token=private-fixture\n';writeFileSync(table,original);
  assert.equal(run().status,0);assert.equal(readFileSync(table,'utf8'),original);
  const installed=run(['--apply']);assert.equal(installed.status,0,installed.stderr);const saved=readFileSync(table,'utf8');assert.ok(saved.startsWith(original));assert.match(saved,/\* \* \* \* \* cd/);assert.equal(installed.stdout.includes('private-fixture'),false);
  assert.equal(run(['--apply']).status,0);assert.equal(readFileSync(table,'utf8'),saved);
  assert.notEqual(run(['--apply'],{BLOCK_CRON:'1'}).status,0);assert.equal(readFileSync(table,'utf8'),saved);
  rmSync(table);assert.equal(run(['--apply']).status,0);assert.ok(existsSync(table));assert.equal((readFileSync(table,'utf8').match(/# rubizh-cache-worker/g)||[]).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Automation cron replaces cache-only scheduling, preserves unrelated jobs, is idempotent and handles hosting denial',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-cron-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),table=path.join(dir,'table');
 mkdirSync(path.join(site,'shop'),{recursive:true});mkdirSync(bin);writeFileSync(path.join(site,'shop/cache-worker.php'),'<?php');writeFileSync(path.join(site,'shop/automation-worker.sh'),'#!/bin/bash');
 writeFileSync(path.join(bin,'crontab'),`#!/usr/bin/env bash\nif [[ "\${BLOCK_CRON:-}" = 1 ]]; then echo 'permission denied' >&2; exit 1; fi\nif [[ "$1" = -l ]]; then if [[ -f "$CRON_TABLE" ]]; then cat "$CRON_TABLE"; else echo 'no crontab for test' >&2; exit 1; fi; else cp "$1" "$CRON_TABLE"; fi\n`,{mode:0o755});
 writeFileSync(path.join(bin,'php'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 const run=(args=[],extra={})=>spawnSync('bash',[path.join(root,'dev/install-automation-cron.sh'),site,...args],{env:{...process.env,PATH:bin+':'+process.env.PATH,CRON_TABLE:table,...extra},encoding:'utf8',timeout:5000});
 try{
  const original='MAILTO=owner@example.com\n15 * * * * existing-worker --token=private-fixture\n';const old=original+`* * * * * php ${site}/shop/cache-worker.php # rubizh-cache-worker\n`;writeFileSync(table,old);
  assert.equal(run().status,0);assert.equal(readFileSync(table,'utf8'),old);
  const installed=run(['--apply']);assert.equal(installed.status,0,installed.stderr);const saved=readFileSync(table,'utf8');assert.ok(saved.startsWith(original));assert.match(saved,/\* \* \* \* \* RUBIZH_PHP_BIN/);assert.doesNotMatch(saved,/shop\/cache-worker.php/);assert.equal(installed.stdout.includes('private-fixture'),false);
  assert.equal(run(['--apply']).status,0);assert.equal(readFileSync(table,'utf8'),saved);
  assert.notEqual(run(['--apply'],{BLOCK_CRON:'1'}).status,0);assert.equal(readFileSync(table,'utf8'),saved);
  rmSync(table);assert.equal(run(['--apply']).status,0);assert.ok(existsSync(table));assert.equal((readFileSync(table,'utf8').match(/# rubizh-automation-worker/g)||[]).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
