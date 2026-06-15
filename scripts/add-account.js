'use strict';

/**
 * Adaugă un participant nou în MetaApi și în data/participants.json
 *
 * Rulare:
 *   METAAPI_TOKEN=xxx node scripts/add-account.js \
 *     --name "Ion Popescu" \
 *     --server "ICMarketsSC-Live3" \
 *     --login "12345678" \
 *     --password "investorpass" \
 *     --platform mt5 \
 *     --balance 1000
 *
 * Dacă nu dai argumente, scriptul le cere interactiv.
 */

const fs   = require('fs');
const path = require('path');

const METAAPI_TOKEN     = process.env.METAAPI_TOKEN;
const PROVISION_URL     = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const PARTICIPANTS_FILE = path.join(__dirname, '..', 'data', 'participants.json');

if (!METAAPI_TOKEN) {
  console.error('❌ Lipsește METAAPI_TOKEN');
  console.error('   Rulare: METAAPI_TOKEN=xxx node scripts/add-account.js ...');
  process.exit(1);
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

async function metaApiPost(endpoint, body) {
  const res = await fetch(`${PROVISION_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'auth-token':   METAAPI_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function metaApiGet(endpoint) {
  const res = await fetch(`${PROVISION_URL}${endpoint}`, {
    headers: { 'auth-token': METAAPI_TOKEN },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function waitForDeployed(accountId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const account = await metaApiGet(`/users/current/accounts/${accountId}`);
    console.log(`   Stare: ${account.state}...`);
    if (account.state === 'DEPLOYED') return account;
    if (account.state === 'DEPLOY_FAILED') throw new Error('Deploy eșuat');
  }
  throw new Error('Timeout — contul nu s-a conectat în 2 minute');
}

async function main() {
  const name     = getArg('name');
  const server   = getArg('server');
  const login    = getArg('login');
  const password = getArg('password');
  const platform = getArg('platform') || 'mt5';
  const balance  = parseFloat(getArg('balance') || '1000');

  if (!name || !server || !login || !password) {
    console.error('❌ Argumente lipsă. Exemplu:');
    console.error('   node scripts/add-account.js \\');
    console.error('     --name "Ion Popescu" \\');
    console.error('     --server "ICMarketsSC-Live3" \\');
    console.error('     --login "12345678" \\');
    console.error('     --password "investorpass" \\');
    console.error('     --platform mt5 \\');
    console.error('     --balance 1000');
    process.exit(1);
  }

  console.log(`\n➕ Adaugă cont MetaApi pentru ${name}...`);

  // Adaugă contul în MetaApi
  let account;
  try {
    account = await metaApiPost('/users/current/accounts', {
      login,
      password,
      name:     `ProfitDistrict - ${name}`,
      server,
      platform,
      type:     'cloud',
      magic:    0,
    });
    console.log(`✅ Cont creat: ${account.id}`);
  } catch (err) {
    console.error('❌ Eroare creare cont:', err.message);
    process.exit(1);
  }

  // Așteaptă conexiunea la broker
  console.log('⏳ Aștept conexiunea la broker (max 2 minute)...');
  try {
    await waitForDeployed(account.id);
    console.log('✅ Cont conectat la broker');
  } catch (err) {
    console.warn(`⚠  ${err.message} — contul a fost creat dar poate nu e conectat încă`);
    console.warn(`   ID cont: ${account.id} — adaugă-l manual în participants.json`);
  }

  // Adaugă participantul în participants.json
  const participants = readJSON(PARTICIPANTS_FILE, []);

  // Generează ID unic
  const maxId = participants.reduce((max, p) => {
    const n = parseInt(p.id.replace('p', ''), 10);
    return n > max ? n : max;
  }, 0);
  const newId = `p${String(maxId + 1).padStart(3, '0')}`;

  const newParticipant = {
    id:                       newId,
    name,
    metaApiAccountId:         account.id,
    accountBalanceStart:      balance,
    profitPercent:            0,
    maxDrawdown:              0,
    totalTrades:              0,
    activeDays:               0,
    riskScore:                0,
    weeklyReportsCompleted:   0,
    journalCompletionPercent: 0,
    disciplineScore:          0,
    improvementScore:         0,
    registeredAt:             new Date().toISOString(),
  };

  participants.push(newParticipant);
  writeJSON(PARTICIPANTS_FILE, participants);

  console.log(`\n✅ ${name} adăugat în data/participants.json cu ID: ${newId}`);
  console.log(`   MetaApi Account ID: ${account.id}`);
  console.log('\n   Acum rulează:');
  console.log('   git add data/participants.json && git commit -m "Adaugă participant" && git push');
}

main().catch(err => {
  console.error('❌ Eroare fatală:', err.message);
  process.exit(1);
});
