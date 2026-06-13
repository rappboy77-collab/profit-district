'use strict';

/**
 * Profit District — Summer League Leaderboard Fetcher
 *
 * Rulat automat de GitHub Actions zilnic (sau manual: node scripts/fetch-leaderboard.js)
 * Necesită Node 18+ pentru fetch nativ.
 *
 * Variabile de mediu necesare:
 *   MYFXBOOK_EMAIL    — emailul tău de Myfxbook (contul organizatorului)
 *   MYFXBOOK_PASSWORD — parola ta de Myfxbook
 *
 * Ce face automat (din Myfxbook):
 *   profitPercent, maxDrawdown, totalTrades, activeDays
 *
 * Ce rămâne manual în data/participants.json (editezi săptămânal):
 *   riskScore, weeklyReportsCompleted, journalCompletionPercent,
 *   disciplineScore, improvementScore
 */

const fs   = require('fs');
const path = require('path');

const MYFXBOOK_API       = 'https://www.myfxbook.com/api';
const COMPETITION_START  = '2025-06-12';
const COMPETITION_END    = '2025-09-20';
const PARTICIPANTS_FILE  = path.join(__dirname, '..', 'data', 'participants.json');
const LEADERBOARD_FILE   = path.join(__dirname, '..', 'data', 'leaderboard.json');

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

async function myfxGet(endpoint, params) {
  const url = new URL(`${MYFXBOOK_API}/${endpoint}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'ProfitDistrictBot/1.0' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} la ${endpoint}`);

  const data = await res.json();
  if (data.error) throw new Error(data.message || `Myfxbook error la ${endpoint}`);
  return data;
}

// ─── Calcul drawdown din curba de capital ─────────────────────────────────────

function calcFromDailyGain(dailyGain, startBalance) {
  // dailyGain = [["2025-06-12", dailyGain%, profit], ...]
  // profit este profitul zilnic absolut (în valuta contului)
  let balance = startBalance;
  let peak    = startBalance;
  let maxDD   = 0;

  for (const entry of dailyGain) {
    const dailyProfit = parseFloat(entry[2]) || 0;
    balance += dailyProfit;
    if (balance > peak) peak = balance;
    const dd = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const profitPercent = startBalance > 0
    ? ((balance - startBalance) / startBalance) * 100
    : 0;

  return {
    profitPercent: round2(profitPercent),
    maxDrawdown:   round2(maxDD),
  };
}

// ─── Fetch date Myfxbook pentru un participant ─────────────────────────────────

async function fetchParticipantData(session, participant) {
  const id    = String(participant.myfxbookId);
  const start = COMPETITION_START;
  const end   = COMPETITION_END;

  // 1) Date zilnice (pentru profitPercent și maxDrawdown)
  const gainResp = await myfxGet('get-daily-gain', { session, id, start, end });
  const dailyGain = gainResp.dailyGain || [];

  // 2) Istoric tranzacții (pentru totalTrades și activeDays)
  const histResp = await myfxGet('get-history', { session, id, start, end });
  const history  = histResp.history || [];

  // totalTrades = numărul de tranzacții închise
  const totalTrades = history.length;

  // activeDays = zile unice cu cel puțin o tranzacție
  const uniqueDays = new Set(
    history
      .map(t => (t.closeTime || t.openTime || '').split(' ')[0])
      .filter(Boolean)
  );
  const activeDays = uniqueDays.size;

  // profitPercent + maxDrawdown din curba de capital
  const { profitPercent, maxDrawdown } = calcFromDailyGain(
    dailyGain,
    participant.accountBalanceStart || 1000
  );

  return { profitPercent, maxDrawdown, totalTrades, activeDays };
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

// ─── Lucky Draw reproductibil (seed = data zilei) ────────────────────────────

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
  const email    = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;

  if (!email || !password) {
    console.error('❌  Lipsesc MYFXBOOK_EMAIL sau MYFXBOOK_PASSWORD');
    console.error('    Rulare locală: MYFXBOOK_EMAIL=x MYFXBOOK_PASSWORD=y node scripts/fetch-leaderboard.js');
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

  // Login Myfxbook
  console.log('🔑 Autentificare Myfxbook...');
  let session;
  try {
    const resp = await myfxGet('login', { email, password });
    session    = resp.session;
    console.log('✅ Autentificat');
  } catch (err) {
    console.error('❌ Login eșuat:', err.message);
    process.exit(1);
  }

  // Fetch date pentru fiecare participant
  const enriched = [];

  for (const p of participants) {
    if (!p.myfxbookId) {
      console.log(`⚠  ${p.name}: lipsește myfxbookId — date din JSON`);
      enriched.push(p);
      continue;
    }

    try {
      console.log(`📊 ${p.name} (myfxbook ID: ${p.myfxbookId})...`);
      const fetched = await fetchParticipantData(session, p);

      console.log(
        `   profit ${fetched.profitPercent}% | dd ${fetched.maxDrawdown}% | ` +
        `trades ${fetched.totalTrades} | zile ${fetched.activeDays}`
      );

      enriched.push({ ...p, ...fetched });
    } catch (err) {
      console.warn(`   ⚠  Eroare fetch, se păstrează datele existente: ${err.message}`);
      enriched.push(p);
    }
  }

  // Logout (fire-and-forget)
  myfxGet('logout', { session }).catch(() => {});

  // Calculează scoruri
  const scored  = enriched.map(calcScores);
  const dateStr = todayStr();

  // Lucky Draw — eligibil: ≥10 zile active, ≥1 raport săptămânal, ≥20 tranzacții
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

  // Scrie leaderboard.json
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

  // Actualizează participants.json cu valorile auto-fetch-uite
  // (câmpurile manuale rămân neschimbate)
  const updatedParticipants = enriched.map(p => ({
    id:                       p.id,
    name:                     p.name,
    myfxbookId:               p.myfxbookId || null,
    accountBalanceStart:      p.accountBalanceStart,
    // Auto (actualizate din Myfxbook):
    profitPercent:            p.profitPercent,
    maxDrawdown:              p.maxDrawdown,
    totalTrades:              p.totalTrades,
    activeDays:               p.activeDays,
    // Manual (nu le suprascrie):
    riskScore:                p.riskScore,
    weeklyReportsCompleted:   p.weeklyReportsCompleted,
    journalCompletionPercent: p.journalCompletionPercent,
    disciplineScore:          p.disciplineScore,
    improvementScore:         p.improvementScore,
    registeredAt:             p.registeredAt,
  }));

  writeJSON(PARTICIPANTS_FILE, updatedParticipants);

  console.log(`\n✅ Clasament actualizat: ${enriched.length} participanți`);
}

main().catch(err => {
  console.error('❌ Eroare fatală:', err.message);
  process.exit(1);
});
