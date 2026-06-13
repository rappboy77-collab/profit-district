/**
 * Profit District — Summer League Score Calculator
 *
 * Rulează LOCAL când vrei să actualizezi clasamentul:
 *   node server.js
 *
 * Ce face:
 *   1. Citește participanții din data/participants.json
 *   2. Calculează scorurile pentru toate categoriile
 *   3. Scrie rezultatul în data/leaderboard.json
 *   4. Tu faci git push → site-ul se actualizează
 */

const fs   = require('fs');
const path = require('path');

const PARTICIPANTS_FILE  = path.join(__dirname, 'data', 'participants.json');
const LEADERBOARD_FILE   = path.join(__dirname, 'data', 'leaderboard.json');
const SNAPSHOTS_DIR      = path.join(__dirname, 'data', 'snapshots');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function round2(n) { return Math.round(n * 100) / 100; }

function today() { return new Date().toISOString().split('T')[0]; }

// ─── Lucky Draw reproductibil cu seed = data zilei ───────────────────────────
function seededRand(seed) {
  let s = [...seed].reduce((a, c) => (a + c.charCodeAt(0)) | 0, 0);
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Formule scoruri ─────────────────────────────────────────────────────────
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
      rank:         i + 1,
      id:           p.id,
      name:         p.name,
      score:        round2(p[scoreKey]),
      profitPercent: round2(p.profitPercent),
      maxDrawdown:  round2(p.maxDrawdown),
      totalTrades:  p.totalTrades,
      activeDays:   p.activeDays,
      ...(extraFn ? extraFn(p) : {}),
    }));
}

// ─── Calcul principal ─────────────────────────────────────────────────────────
function calculate() {
  const participants = readJSON(PARTICIPANTS_FILE, []);

  if (participants.length === 0) {
    console.log('⚠  Niciun participant în data/participants.json');
    const empty = { lastUpdated: null, overall: [], performance: [], activity: [], transformation: [], luckyDraw: null };
    writeJSON(LEADERBOARD_FILE, empty);
    return;
  }

  const scored  = participants.map(calcScores);
  const dateStr = today();

  // Lucky Draw — eligibil: activeDays>=10, weeklyReports>=1, totalTrades>=20
  const eligible = participants.filter(p =>
    p.activeDays             >= 10 &&
    p.weeklyReportsCompleted >= 1  &&
    p.totalTrades            >= 20
  );
  let luckyDraw = null;
  if (eligible.length > 0) {
    const rand   = seededRand(dateStr);
    const winner = eligible[Math.floor(rand() * eligible.length)];
    luckyDraw = { id: winner.id, name: winner.name, drawnFor: dateStr };
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

  // Scrie clasamentul (citit de site)
  writeJSON(LEADERBOARD_FILE, result);

  // Salvează snapshot zilnic (nu suprascrie zilele anterioare)
  writeJSON(path.join(SNAPSHOTS_DIR, `${dateStr}.json`), {
    date: dateStr, createdAt: result.lastUpdated,
    participants: scored.map(p => ({
      id: p.id, name: p.name,
      overallRank:         rankList(scored,'overallScore').findIndex(x=>x.id===p.id)+1,
      overallScore:        round2(p.overallScore),
      performanceRank:     rankList(scored,'performanceScore').findIndex(x=>x.id===p.id)+1,
      performanceScore:    round2(p.performanceScore),
      activityRank:        rankList(scored,'activityScore').findIndex(x=>x.id===p.id)+1,
      activityScore:       round2(p.activityScore),
      transformationRank:  rankList(scored,'transformationScore').findIndex(x=>x.id===p.id)+1,
      transformationScore: round2(p.transformationScore),
    })),
    luckyDraw,
  });

  console.log(`✅ Clasament calculat pentru ${participants.length} participanți`);
  console.log(`   Salvat în: data/leaderboard.json`);
  console.log(`   Snapshot:  data/snapshots/${dateStr}.json`);
  console.log(`\n   Acum rulează:\n   git add data/leaderboard.json && git commit -m "Update clasament ${dateStr}" && git push`);
}

calculate();
