'use strict';

/**
 * Profit District — Summer League Leaderboard Calculator
 *
 * Citește data/participants.json (completat manual săptămânal),
 * calculează scorurile și scrie data/leaderboard.json.
 *
 * Rulare: node scripts/fetch-leaderboard.js
 */

const fs   = require('fs');
const path = require('path');

const PARTICIPANTS_FILE = path.join(__dirname, '..', 'data', 'participants.json');
const LEADERBOARD_FILE  = path.join(__dirname, '..', 'data', 'leaderboard.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

// ─── Formule scoruri ──────────────────────────────────────────────────────────

function calcGeneral(p) {
  // Raport Profit% / MaxDrawdown% — recompensează profit bun cu risc mic
  if (!p.maxDrawdown || p.maxDrawdown === 0) return round4(p.profitPercent > 0 ? p.profitPercent : 0);
  return round4(p.profitPercent / p.maxDrawdown);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const participants = readJSON(PARTICIPANTS_FILE, []);

  if (participants.length === 0) {
    writeJSON(LEADERBOARD_FILE, {
      lastUpdated: null,
      general:    [],
      consistenta: [],
    });
    console.log('⚠  Niciun participant în data/participants.json');
    return;
  }

  // General — sortat după scor
  const general = [...participants]
    .map(p => ({
      rank:          0,
      id:            p.id,
      name:          p.name,
      score:         calcGeneral(p),
      profitPercent: round2(p.profitPercent),
      maxDrawdown:   round2(p.maxDrawdown),
      totalLots:     p.totalLots   || 0,
      activeDays:    p.activeDays  || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  // Consistență — sortat după loturi tranzacționate
  const consistenta = [...participants]
    .map(p => ({
      rank:          0,
      id:            p.id,
      name:          p.name,
      totalLots:     p.totalLots   || 0,
      activeDays:    p.activeDays  || 0,
      profitPercent: round2(p.profitPercent),
    }))
    .sort((a, b) => b.totalLots - a.totalLots)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const result = {
    lastUpdated: new Date().toISOString(),
    general,
    consistenta,
  };

  writeJSON(LEADERBOARD_FILE, result);
  console.log(`✅ Clasament calculat: ${participants.length} participanți`);
}

main();
