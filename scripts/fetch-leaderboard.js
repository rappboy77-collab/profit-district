'use strict';

/**
 * Profit District — Summer League Leaderboard Fetcher
 *
 * Preia statistici din MetaApi/MetaStats pentru fiecare participant.
 * Rulat automat de GitHub Actions zilnic la miezul nopții.
 * Rulare locală: METAAPI_TOKEN=xxx node scripts/fetch-leaderboard.js
 *
 * Ce face automat (din MetaStats):
 *   profitPercent, maxDrawdown, totalTrades, activeDays
 *
 * Ce rămâne manual în data/participants.json (editezi săptămânal):
 *   riskScore, weeklyReportsCompleted, journalCompletionPercent,
 *   disciplineScore, improvementScore
 */

const fs   = require('fs');
const path = require('path');

const METAAPI_TOKEN     = process.env.METAAPI_TOKEN;
const PROVISION_URL     = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const COMPETITION_START = '2026-06-01T00:00:00.000Z';
const COMPETITION_END   = '2026-09-20T23:59:59.000Z';
const PARTICIPANTS_FILE = path.join(__dirname, '..', 'data', 'participants.json');
const LEADERBOARD_FILE  = path.join(__dirname, '..', 'data', 'leaderboard.json');

// ─── Utils ────────────────────────────────────────────────────────────────────

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function round2(n) { return Math.round(n * 100) / 100; }

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─── MetaApi helpers ──────────────────────────────────────────────────────────

async function metaApiGet(url) {
  const res = await fetch(url, {
    headers: { 'auth-token': METAAPI_TOKEN },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getAccountRegion(accountId) {
  const data = await metaApiGet(`${PROVISION_URL}/users/current/accounts/${accountId}`);
  return data.region || 'new-york';
}

// ─── MetaStats + Deals History ────────────────────────────────────────────────

async function fetchMetaStats(accountId) {
  const region = await getAccountRegion(accountId);

  // Balanța curentă din MetaStats
  const statsUrl = `https://metastats-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${accountId}/metrics`;
  const data     = await metaApiGet(statsUrl);
  const metrics  = data.metrics || data;
  const currentBalance = metrics.balance || 0;

  // Deals din perioada competiției — sursă unică de adevăr
  const dealsUrl  = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${accountId}/history-deals/time/${COMPETITION_START}/${COMPETITION_END}`;
  const dealsData = await metaApiGet(dealsUrl);
  const allDeals  = Array.isArray(dealsData) ? dealsData : (dealsData.deals || []);

  // Doar tranzacții reale (nu depozite/retrageri)
  const tradingDeals = allDeals.filter(d =>
    d.type !== 'DEAL_TYPE_BALANCE' && d.type !== 'DEAL_TYPE_CREDIT'
  );

  const totalTrades    = tradingDeals.length;
  const profitInPeriod = tradingDeals.reduce((sum, d) => sum + (d.profit || 0), 0);
  const balanceAtStart = currentBalance - profitInPeriod;
  const profitPercent  = balanceAtStart > 0
    ? (profitInPeriod / balanceAtStart) * 100
    : 0;

  // Zile active și drawdown din curba zilnică de capital
  const byDate = {};
  for (const d of tradingDeals) {
    const date = (d.time || d.brokerTime || '').split('T')[0];
    if (date) byDate[date] = (byDate[date] || 0) + (d.profit || 0);
  }

  const activeDays = Object.keys(byDate).length;

  let balance = balanceAtStart;
  let peak    = balance;
  let maxDD   = 0;
  for (const date of Object.keys(byDate).sort()) {
    balance += byDate[date];
    if (balance > peak) peak = balance;
    const dd = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    profitPercent: round2(profitPercent),
    maxDrawdown:   round2(maxDD),
    totalTrades,
    activeDays,
  };
}

// ─── Formule scoruri ──────────────────────────────────────────────────────────

function calcScores(p) {
  const performanceScore =
    (p.profitPercent       * 0.50) +
    (p.riskScore           * 0.25) +
    ((100 - p.maxDrawdown) * 0.25);

  const activityScore =
    (p.totalTrades * 0.60) +
    (p.activeDays  * 0.40);

  const transformationScore =
    (p.disciplineScore          * 0.40) +
    (p.journalCompletionPercent * 0.30) +
    (p.improvementScore         * 0.30);

  const overallScore =
    (performanceScore    * 0.50) +
    (activityScore       * 0.25) +
    (transformationScore * 0.25);

  return { ...p, performanceScore, activityScore, transformationScore, overallScore };
}

function rankList(scored, scoreKey, extraFn) {
  return [...scored]
    .sort((a, b) => b[scoreKey] - a[scoreKey])
    .slice(0, 10)
    .map((p, i) => ({
      rank:          i + 1,
      id:            p.id,
      name:          p.name,
      score:         round2(p[scoreKey]),
      profitPercent: round2(p.profitPercent),
      maxDrawdown:   round2(p.maxDrawdown),
      totalTrades:   p.totalTrades,
      activeDays:    p.activeDays,
      ...(extraFn ? extraFn(p) : {}),
    }));
}

function seededRand(seed) {
  let s = [...seed].reduce((a, c) => (a + c.charCodeAt(0)) | 0, 0);
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!METAAPI_TOKEN) {
    console.error('❌ Lipsește METAAPI_TOKEN');
    process.exit(1);
  }

  const participants = readJSON(PARTICIPANTS_FILE, []);

  if (participants.length === 0) {
    console.log('⚠  Niciun participant în data/participants.json');
    writeJSON(LEADERBOARD_FILE, {
      lastUpdated: null, overall: [], performance: [],
      activity: [], transformation: [], luckyDraw: null,
    });
    return;
  }

  const enriched = [];

  for (const p of participants) {
    if (!p.metaApiAccountId) {
      console.log(`⚠  ${p.name}: lipsește metaApiAccountId — date din JSON`);
      enriched.push(p);
      continue;
    }

    try {
      console.log(`📊 ${p.name}...`);
      const m = await fetchMetaStats(p.metaApiAccountId);

      const { profitPercent, maxDrawdown, totalTrades, activeDays } = m;

      console.log(`   profit ${profitPercent}% | dd ${maxDrawdown}% | trades ${totalTrades} | zile ${activeDays}`);

      enriched.push({ ...p, profitPercent, maxDrawdown, totalTrades, activeDays });
    } catch (err) {
      console.warn(`   ⚠  ${err.message} — se păstrează datele existente`);
      console.warn(`   DEBUG eroare completă:`, err);
      enriched.push(p);
    }
  }

  const scored  = enriched.map(calcScores);
  const dateStr = todayStr();

  const eligible = enriched.filter(p =>
    p.activeDays             >= 10 &&
    p.weeklyReportsCompleted >= 1  &&
    p.totalTrades            >= 20
  );

  let luckyDraw = null;
  if (eligible.length > 0) {
    const rand   = seededRand(dateStr);
    const winner = eligible[Math.floor(rand() * eligible.length)];
    luckyDraw = { id: winner.id, name: winner.name, drawnFor: dateStr };
    console.log(`🎲 Lucky Draw: ${winner.name}`);
  }

  const result = {
    lastUpdated:    new Date().toISOString(),
    overall:        rankList(scored, 'overallScore'),
    performance:    rankList(scored, 'performanceScore', p => ({ riskScore: round2(p.riskScore) })),
    activity:       rankList(scored, 'activityScore',    p => ({ weeklyReports: p.weeklyReportsCompleted })),
    transformation: rankList(scored, 'transformationScore', p => ({
      journalPercent:  round2(p.journalCompletionPercent),
      disciplineScore: round2(p.disciplineScore),
    })),
    luckyDraw,
  };

  writeJSON(LEADERBOARD_FILE, result);

  const updated = enriched.map(p => ({
    id:                       p.id,
    name:                     p.name,
    metaApiAccountId:         p.metaApiAccountId || null,
    accountBalanceStart:      p.accountBalanceStart,
    profitPercent:            p.profitPercent,
    maxDrawdown:              p.maxDrawdown,
    totalTrades:              p.totalTrades,
    activeDays:               p.activeDays,
    riskScore:                p.riskScore,
    weeklyReportsCompleted:   p.weeklyReportsCompleted,
    journalCompletionPercent: p.journalCompletionPercent,
    disciplineScore:          p.disciplineScore,
    improvementScore:         p.improvementScore,
    registeredAt:             p.registeredAt,
  }));

  writeJSON(PARTICIPANTS_FILE, updated);

  console.log(`\n✅ Clasament actualizat: ${enriched.length} participanți`);
}

main().catch(err => {
  console.error('❌ Eroare fatală:', err.message);
  process.exit(1);
});
