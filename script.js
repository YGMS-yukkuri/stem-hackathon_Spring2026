const KEY_BIND = "asdfghjkl;:]";
const LAST_RESORT_CHART_SONGS = [
  "終点の先が在るとするならば。",
  "回る空うさぎ"
];
const LAST_RESORT_CHART_FILES = [
  "Charts/終点の先が在るとするならば。/MASTER.usc",
  "Charts/回る空うさぎ/EXPERT.usc"
];
const DIFFICULTY_KEYS = ["EASY", "NORMAL", "HARD", "EXPERT", "MASTER"];
const JUDGE_ADJUST_UNIT_SEC = 0.016;
const FAST_JUDGE_SNAP_SEC = 0.016;
const JUDGE_TEXT_Y_SCALE_PX = 50;
const DAMAGE_BASE_MULTIPLIER = 2.0;
const COMBO_HEAL_INTERVAL = 50;
const COMBO_HEAL_AMOUNT = 10;
const SETTINGS_STORAGE_KEY = "stem-rhythm-settings";
const ENABLE_CONSOLE_LOG = true;

const DIFFICULTY_DAMAGE_RATE = {
  Easy: 0.2,
  Normal: 0.5,
  Hard: 0.8,
  Expert: 1.0,
  Master: 1.0
};

const JUDGE_COLORS = {
  "C-Perfect": "#ffd54a",
  Perfect: "#ffee58",
  Great: "#ffb74d",
  Good: "#8bc34a",
  Miss: "#222",
  SAFE: "#ffd54a",
  DAMAGE: "#ff5252"
};

const TIMING_HINT_COLORS = {
  EARLY: "#4ea8ff",
  SLOW: "#ff4d4d"
};

const SCORE_MAX_WITH_CRITICAL_BONUS = 1100000;

const DIFFICULTY_TINT = {
  Easy: "#2dd36f22",
  Normal: "#4fc3f733",
  Hard: "#ffd54f2e",
  Expert: "#ef535033",
  Master: "#ab47bc33"
};

const app = {
  chartData: null,
  gameState: null,
  chartCatalog: {},
  audio: null,
  audioPath: "",
  config: {
    laneSpeed: 1.0,
    judgeA: 0.0,
    judgeB: 0.0,
    volume: 50,
    judgeTextY: 0.0,
    showCP: false,
    difficulty: "Normal"
  }
};

const ui = {
  menu: document.getElementById("menu"),
  game: document.getElementById("game"),
  result: document.getElementById("result"),
  chartSelect: document.getElementById("chartSelect"),
  difficultySelect: document.getElementById("difficultySelect"),
  laneSpeed: document.getElementById("laneSpeed"),
  judgeA: document.getElementById("judgeA"),
  judgeB: document.getElementById("judgeB"),
  volume: document.getElementById("volume"),
  judgeTextY: document.getElementById("judgeTextY"),
  showCP: document.getElementById("showCP"),
  startButton: document.getElementById("startButton"),
  backButton: document.getElementById("backButton"),
  menuStatus: document.getElementById("menuStatus"),
  scoreText: document.getElementById("scoreText"),
  comboText: document.getElementById("comboText"),
  hpBar: document.getElementById("hpBar"),
  readyOverlay: document.getElementById("readyOverlay"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  resultScore: document.getElementById("resultScore"),
  resultCombo: document.getElementById("resultCombo"),
  rCP: document.getElementById("rCP"),
  rP: document.getElementById("rP"),
  rG: document.getElementById("rG"),
  rGo: document.getElementById("rGo"),
  rMiss: document.getElementById("rMiss"),
  rBad: document.getElementById("rBad"),
  rDmg: document.getElementById("rDmg"),
  specials: document.getElementById("specials"),
  canvas: document.getElementById("gameCanvas")
};

const ctx = ui.canvas.getContext("2d");
const pressedLanes = new Set();

// Performance optimization: cache for lane lines
let laneLinesCache = {
  width: 0,
  height: 0,
  trackX: 0,
  trackWidth: 0,
  judgeY: 0,
  paths: []
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("ja-JP");
}

function logGame(tag, payload) {
  // Performance optimization: console logging disabled
  // if (!ENABLE_CONSOLE_LOG) return;
  // console.log(`[YukkURHYTHM][${tag}]`, payload);
}

function applyDifficultyTint() {
  const color = DIFFICULTY_TINT[app.config.difficulty] || "#00bcd400";
  document.documentElement.style.setProperty("--difficulty-tint", color);
}

function saveSettings() {
  const data = {
    laneSpeed: app.config.laneSpeed,
    judgeA: app.config.judgeA,
    judgeB: app.config.judgeB,
    volume: app.config.volume,
    judgeTextY: app.config.judgeTextY,
    difficulty: app.config.difficulty,
    showCP: app.config.showCP
  };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // ignore storage errors
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.laneSpeed === "number" && data.laneSpeed > 0) app.config.laneSpeed = data.laneSpeed;
    if (typeof data.judgeA === "number") app.config.judgeA = clamp(data.judgeA, -5, 5);
    if (typeof data.judgeB === "number") app.config.judgeB = clamp(data.judgeB, -5, 5);
    if (typeof data.volume === "number") app.config.volume = clamp(Math.round(data.volume), 0, 100);
    if (typeof data.judgeTextY === "number") app.config.judgeTextY = clamp(data.judgeTextY, -5, 5);
    if (typeof data.showCP === "boolean") app.config.showCP = data.showCP;
    if (typeof data.difficulty === "string" && Object.prototype.hasOwnProperty.call(DIFFICULTY_DAMAGE_RATE, data.difficulty)) {
      app.config.difficulty = data.difficulty;
    }
  } catch (error) {
    // ignore parse/storage errors
  }
}

function applyConfigToUI() {
  ui.laneSpeed.value = app.config.laneSpeed.toFixed(1);
  ui.judgeA.value = app.config.judgeA.toFixed(1);
  ui.judgeB.value = app.config.judgeB.toFixed(1);
  ui.volume.value = String(app.config.volume);
  ui.judgeTextY.value = app.config.judgeTextY.toFixed(1);
  ui.showCP.checked = app.config.showCP;
  ui.difficultySelect.value = app.config.difficulty;
}

function beatToSecFactory(bpmObjects) {
  const bpms = [...bpmObjects].sort((a, b) => a.beat - b.beat);
  const segments = [];
  let currentSec = 0;

  for (let i = 0; i < bpms.length; i += 1) {
    const now = bpms[i];
    const next = bpms[i + 1];
    segments.push({
      fromBeat: now.beat,
      bpm: now.bpm,
      secAtBeat: currentSec
    });
    if (next) {
      const beatDelta = next.beat - now.beat;
      currentSec += beatDelta * (60 / now.bpm);
    }
  }

  return (beat) => {
    let seg = segments[0];
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].fromBeat <= beat) {
        seg = segments[i];
      } else {
        break;
      }
    }
    return seg.secAtBeat + (beat - seg.fromBeat) * (60 / seg.bpm);
  };
}

function laneWidthCount(size) {
  return clamp(Math.round((size || 1.5) * 2), 1, 12);
}

function getLaneSpan(lane, size) {
  const widthCount = laneWidthCount(size);
  const laneCenter = Number(lane ?? 0) + 5.5;
  const rawStart = Math.round(laneCenter - widthCount / 2);
  const maxStart = Math.max(0, 12 - widthCount);
  const start = clamp(rawStart, 0, maxStart);
  return {
    start,
    widthCount,
    end: start + widthCount - 1
  };
}

function laneStartIndex(lane, size = 1.5) {
  return getLaneSpan(lane, size).start;
}

function getEffectiveChartOffsetSec(chart) {
  const raw = Number(chart?.usc?.offset || 0);
  return raw;
}

function interpolateSlidePointAtBeat(points, beat) {
  if (!points.length) {
    return { lane: 0, size: 1.5 };
  }
  if (beat <= points[0].beat) {
    return { lane: points[0].lane, size: points[0].size || 1.5 };
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (beat <= b.beat) {
      const span = Math.max(1e-6, b.beat - a.beat);
      const t = clamp((beat - a.beat) / span, 0, 1);
      const ease = b.ease || "linear";
      const e = easeLerp(t, ease);
      const lane = a.lane + (b.lane - a.lane) * e;
      const size = (a.size || 1.5) + ((b.size || 1.5) - (a.size || 1.5)) * t;
      return { lane, size };
    }
  }
  const last = points[points.length - 1];
  return { lane: last.lane, size: last.size || 1.5 };
}

function buildJudgeItems(chart) {
  const objects = chart.usc.objects || [];
  const bpms = objects.filter((o) => o.type === "bpm");
  const tsg = objects.filter((o) => o.type === "timeScaleGroup");

  if (!bpms.length || !tsg.length) {
    throw new Error("譜面が破損しています: bpm/timeScaleGroup が不足しています");
  }

  const beatToSec = beatToSecFactory(bpms);
  const chartOffsetSec = getEffectiveChartOffsetSec(chart);

  const timeScaleAt = (groupIndex, beat) => {
    const group = tsg[groupIndex] || tsg[0];
    // Performance optimization: avoid spread operator
    const changes = (group.changes || []).slice().sort((a, b) => a.beat - b.beat);
    let scale = 1;
    for (const c of changes) {
      if (c.beat <= beat) {
        scale = c.timeScale;
      } else {
        break;
      }
    }
    return scale;
  };

  const judgeItems = [];
  const drawObjects = [];
  const slideStates = new Map();
  let slideSeq = 0;

  for (const obj of objects) {
    if (obj.type === "single") {
      const time = beatToSec(obj.beat) + chartOffsetSec;
      judgeItems.push({
        id: `single-${judgeItems.length}`,
        type: "single",
        time,
        beat: obj.beat,
        lane: obj.lane,
        size: obj.size,
        trace: !!obj.trace,
        critical: !!obj.critical,
        direction: !!obj.direction,
        judged: false,
        comboValue: 1,
        timeScale: timeScaleAt(obj.timeScaleGroup || 0, obj.beat)
      });
      drawObjects.push({ type: "single", ref: obj, time });
    }

    if (obj.type === "damage") {
      const time = beatToSec(obj.beat) + chartOffsetSec;
      judgeItems.push({
        id: `damage-${judgeItems.length}`,
        type: "damage",
        time,
        beat: obj.beat,
        lane: obj.lane,
        size: obj.size,
        judged: false,
        touched: false,
        timeScale: timeScaleAt(obj.timeScaleGroup || 0, obj.beat)
      });
      drawObjects.push({ type: "damage", ref: obj, time });
    }

    if (obj.type === "slide") {
      const conns = obj.connections || [];
      const points = [];
      const slideId = `slide-${slideSeq}`;
      slideSeq += 1;

      for (const c of conns) {
        const time = beatToSec(c.beat) + chartOffsetSec;
        points.push({ ...c, time, parentCritical: !!obj.critical });

        const visibleTick = c.type !== "tick" || Object.prototype.hasOwnProperty.call(c, "critical");
        if (visibleTick) {
          const comboValue = 1;
          judgeItems.push({
            id: `slide-${judgeItems.length}`,
            type: "slide",
            slideId,
            pointType: c.type,
            time,
            beat: c.beat,
            lane: c.lane,
            size: c.size,
            critical: !!c.critical || !!obj.critical,
            trace: c.type === "tick" || c.judgeType === "trace",
            direction: !!c.direction,
            judged: false,
            comboValue,
            timeScale: timeScaleAt(c.timeScaleGroup || 0, c.beat)
          });
        }
      }

      const startPoint = points.find((p) => p.type === "start");
      const endPoint = [...points].reverse().find((p) => p.type === "end");
      const startTime = startPoint ? startPoint.time : 0;
      const endTime = endPoint ? endPoint.time : startTime;

      slideStates.set(slideId, {
        active: false,
        started: false,
        finished: false,
        startTime,
        endTime
      });

      if (startPoint && endPoint) {
        for (let beat = startPoint.beat + 1.0; beat <= endPoint.beat - 1.0 + 1e-6; beat += 0.5) {
          const p = interpolateSlidePointAtBeat(points, beat);
          judgeItems.push({
            id: `slide-pulse-${judgeItems.length}`,
            type: "slidePulse",
            slideId,
            time: beatToSec(beat) + chartOffsetSec,
            beat,
            lane: p.lane,
            size: p.size,
            critical: false,
            trace: false,
            direction: false,
            judged: false,
            comboValue: 1,
            timeScale: timeScaleAt(startPoint.timeScaleGroup || 0, beat)
          });
        }
      }

      drawObjects.push({ type: "slide", slideId, points, startTime, endTime, startCritical: !!obj.critical });
    }

    if (obj.type === "guide") {
      const points = (obj.midpoints || []).map((m) => ({ ...m, time: beatToSec(m.beat) + chartOffsetSec }));
      drawObjects.push({ type: "guide", points, fade: obj.fade || "out" });
    }
  }

  judgeItems.sort((a, b) => a.time - b.time);

  const directionReleaseComboCount = judgeItems.filter(
    (n) => n.type !== "damage" && n.direction && (n.type === "single" || (n.type === "slide" && n.pointType === "end"))
  ).length;

  const totalCombo =
    judgeItems
      .filter((n) => n.type !== "damage")
      .reduce((sum, n) => sum + n.comboValue, 0) +
    directionReleaseComboCount;

  const criticalCount = judgeItems.filter((n) => n.critical && n.type !== "damage").length || 1;
  const damageCount = judgeItems.filter((n) => n.type === "damage").length;

  const guideEndTime = drawObjects.reduce((maxTime, obj) => {
    if (obj.type !== "guide") return maxTime;
    const points = obj.points || [];
    if (!points.length) return maxTime;
    const objEnd = Math.max(...points.map((p) => p.time));
    return Math.max(maxTime, objEnd);
  }, 0);
  const noteEndTime = Math.max(...judgeItems.map((n) => n.time), 0);
  const endTime = Math.max(noteEndTime, guideEndTime) + 2;

  logGame("CHART_ANALYZE", {
    totalNotes: judgeItems.length,
    totalCombo,
    criticalCount,
    damageCount,
    basePerCombo: totalCombo > 0 ? 1000000 / totalCombo : 0,
    criticalBonusUnit: criticalCount > 0 ? 100000 / criticalCount : 0,
    theoreticalMax: SCORE_MAX_WITH_CRITICAL_BONUS
  });

  return {
    judgeItems,
    drawObjects,
    slideStates,
    totalCombo,
    criticalCount,
    damageCount,
    hasGuide: drawObjects.some((obj) => obj.type === "guide"),
    endTime
  };
}

function setPanel(panel) {
  ui.menu.classList.remove("visible");
  ui.game.classList.remove("visible");
  ui.result.classList.remove("visible");
  panel.classList.add("visible");
}

function laneRect(lane, size, laneLeft, laneWidth, judgeY) {
  const span = getLaneSpan(lane, size);
  const x = laneLeft + span.start * laneWidth;
  const w = span.widthCount * laneWidth;
  return { x, w, y: judgeY };
}

function noteWithinLane(note, laneIdx) {
  const span = getLaneSpan(note.lane, note.size);
  return laneIdx >= span.start && laneIdx <= span.end;
}

function scoreRateForJudge(judge, critical) {
  const normalTable = {
    "C-Perfect": 1,
    Perfect: 1,
    Great: 0.8,
    Good: 0.5,
    Miss: 0,
    Bad: 0
  };

  const criticalTable = {
    "C-Perfect": 1,
    Perfect: 1,
    Great: 0.6,
    Good: 0.4,
    Miss: 0,
    Bad: 0
  };

  const table = critical ? criticalTable : normalTable;
  return table[judge] ?? 0;
}

function bonusRateForJudge(judge, isTraceCritical) {
  if (isTraceCritical) {
    return judge === "C-Perfect" ? 1 : 0;
  }
  if (judge === "C-Perfect") return 1;
  if (judge === "Perfect") return 0.8;
  if (judge === "Great") return 0.3;
  return 0;
}

function judgeByDelta(deltaMs, critical, directionTap = false) {
  const abs = Math.abs(deltaMs);
  if (abs <= 25) return "C-Perfect";
  if (abs <= 50) return "Perfect";
  if (abs <= 75) return "Great";
  if (directionTap) return "Miss";
  if (abs <= 100) return "Good";
  return "Miss";
}

function pushJudgeText(gs, label, x, y) {
  gs.judgeTexts.push({
    label,
    x,
    y,
    born: performance.now() / 1000
  });
}

function shouldShowTimingHint(judge) {
  if (app.config.showCP) {
    return judge === "Perfect" || judge === "Great" || judge === "Good" || judge === "Bad";
  }
  return judge === "Great" || judge === "Good" || judge === "Bad";
}

function timingHintLabel(deltaMs) {
  if (deltaMs < 0) return "EARLY";
  if (deltaMs > 0) return "SLOW";
  return "";
}

function registerJudge(gs, note, judge, laneIdx, deltaMs = 0) {
  const now = gs.elapsed;
  note.judged = true;
  note.judge = judge;

  if (note.type === "damage") {
    if (judge === "DAMAGE") {
      gs.damageCount += 1;
      gs.noDamageBroken = true;
      const totalDamage = Math.max(gs.damageCountAll, 1);
      const raw = ((gs.hpMax * DAMAGE_BASE_MULTIPLIER) / totalDamage) * DIFFICULTY_DAMAGE_RATE[app.config.difficulty];
      const damage = Math.max(1, raw);
      if (gs.hp - damage <= 0 && !gs.damageOneTimeGuardUsed) {
        gs.hp = 1;
        gs.damageOneTimeGuardUsed = true;
      } else {
        gs.hp = clamp(gs.hp - damage, 0, gs.hpMax);
      }
      if (gs.hp <= 0) {
        gs.gameOver = true;
        gs.gameOverAt = now;
        ui.gameOverOverlay.classList.remove("hidden");
      }
    }
    gs.counts[judge] = (gs.counts[judge] || 0) + 1;

    const judgeBaseY = gs.judgeY > 0 ? gs.judgeY : ui.canvas.height * 0.9;
    const trackWidth = gs.trackWidth > 0 ? gs.trackWidth : ui.canvas.width * 0.8;
    const trackX = gs.trackWidth > 0 ? gs.trackX : ui.canvas.width * 0.1;
    const x = laneCenterX(note.lane, note.size, { trackX, trackWidth });
    pushJudgeText(gs, judge, x, judgeBaseY + app.config.judgeTextY * JUDGE_TEXT_Y_SCALE_PX);

    logGame("JUDGE_DAMAGE", {
      judge,
      laneIdx,
      deltaMs,
      hp: gs.hp,
      combo: gs.combo,
      score: gs.score
    });

    return;
  }

  const value = note.comboValue || 1;
  const rate = scoreRateForJudge(judge, !!note.critical);
  gs.score += gs.basePerCombo * value * rate;

  if (note.critical) {
    const judgeBonusNumber = bonusRateForJudge(judge, !!note.trace) * 10;
    const bonus = (100000 / Math.max(gs.criticalCount, 1)) * (judgeBonusNumber / 10);
    gs.score += bonus;
  }

  gs.score = Math.min(gs.score, SCORE_MAX_WITH_CRITICAL_BONUS);

  const comboContinue = judge === "C-Perfect" || judge === "Perfect" || judge === "Great" || judge === "Good" || judge === "Bad";
  if (comboContinue) {
    const prevCombo = gs.combo;
    gs.combo += value;
    gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
    const prevMilestones = Math.floor(prevCombo / COMBO_HEAL_INTERVAL);
    const nextMilestones = Math.floor(gs.combo / COMBO_HEAL_INTERVAL);
    const milestoneGain = Math.max(0, nextMilestones - prevMilestones);
    if (milestoneGain > 0) {
      gs.hp = clamp(gs.hp + milestoneGain * COMBO_HEAL_AMOUNT, 0, gs.hpMax);
    }
  } else {
    gs.combo = 0;
    gs.comboBroken = true;
  }

  if (judge === "C-Perfect" && app.config.showCP === false) {
    gs.counts.Perfect += 1;
  } else {
    gs.counts[judge] = (gs.counts[judge] || 0) + 1;
  }

  const trackWidth = gs.trackWidth > 0 ? gs.trackWidth : ui.canvas.width * 0.8;
  const trackX = gs.trackWidth > 0 ? gs.trackX : ui.canvas.width * 0.1;
  const x = laneCenterX(note.lane, note.size, { trackX, trackWidth });
  pushJudgeText(gs, judge, x, gs.judgeY + app.config.judgeTextY * JUDGE_TEXT_Y_SCALE_PX);

  if (note.type !== "damage" && shouldShowTimingHint(judge)) {
    const hint = timingHintLabel(deltaMs);
    if (hint) {
      gs.judgeTexts.push({
        label: hint,
        x,
        y: gs.judgeY + app.config.judgeTextY * JUDGE_TEXT_Y_SCALE_PX + 24,
        born: performance.now() / 1000,
        customColor: TIMING_HINT_COLORS[hint]
      });
    }
  }

  logGame("JUDGE_NOTE", {
    noteType: note.type,
    pointType: note.pointType || "",
    judge,
    laneIdx,
    deltaMs,
    critical: !!note.critical,
    combo: gs.combo,
    score: gs.score,
    hp: gs.hp
  });

  if (note.type === "slide") {
    const state = gs.slideStates.get(note.slideId);
    if (state) {
      if (note.pointType === "start" || note.pointType === "tick") {
        state.started = true;
        state.active = judge !== "Miss";
      }
      if (note.pointType === "attach") {
        state.started = true;
      }
      if (note.pointType === "end") {
        state.finished = true;
        if (note.direction) {
          state.active = judge !== "Miss";
        }
      }
    }
  }

  if (note.type === "slidePulse" && judge === "Miss") {
    const state = gs.slideStates.get(note.slideId);
    if (state) {
      state.active = false;
    }
  }

  if (judge !== "C-Perfect") {
    gs.allCriticalPossible = false;
  }
  if (!(judge === "C-Perfect" || judge === "Perfect" || judge === "Great" || judge === "Good")) {
    gs.allPerfectPossible = false;
  }
  if (!(judge === "C-Perfect" || judge === "Perfect" || judge === "Great" || judge === "Good")) {
    gs.fullComboPossible = false;
  }
  if (!(judge === "C-Perfect" || judge === "Perfect")) {
    gs.allPerfectPossible = false;
  }
}

function findBestTarget(gs, laneIdx, now, keyUp = false) {
  const window = 0.14;
  let best = null;

  for (const note of gs.notes) {
    if (note.judged || note.type === "damage" || note.type === "slidePulse") continue;
    if (note.type === "slide" && note.pointType === "end" && !note.direction) continue;
    if (note.type === "single" && note.direction && keyUp) continue;
    if (!noteWithinLane(note, laneIdx)) continue;
    const dt = now - note.time;
    if (Math.abs(dt) > window) continue;

    if (!best || Math.abs(dt) < Math.abs(now - best.time)) {
      best = note;
    }
  }
  return best;
}

function findAllTargetsAtSameTime(gs, laneIdx, now, keyUp = false) {
  const window = 0.14;
  const targets = [];
  let bestTime = null;

  // まず最も近いノーツのタイミングを見つける
  for (const note of gs.notes) {
    if (note.judged || note.type === "damage" || note.type === "slidePulse") continue;
    if (note.type === "slide" && note.pointType === "end" && !note.direction) continue;
    if (note.type === "single" && note.direction && keyUp) continue;
    if (!noteWithinLane(note, laneIdx)) continue;
    const dt = now - note.time;
    if (Math.abs(dt) > window) continue;

    if (bestTime === null || Math.abs(dt) < Math.abs(now - bestTime)) {
      bestTime = note.time;
    }
  }

  if (bestTime === null) return targets;

  // 同じタイミングのノーツをすべて集める
  for (const note of gs.notes) {
    if (note.judged || note.type === "damage" || note.type === "slidePulse") continue;
    if (note.type === "slide" && note.pointType === "end" && !note.direction) continue;
    if (note.type === "single" && note.direction && keyUp) continue;
    if (!noteWithinLane(note, laneIdx)) continue;
    if (note.time === bestTime) {
      targets.push(note);
    }
  }

  return targets;
}

function onKeyDown(ev) {
  const idx = KEY_BIND.indexOf(ev.key.toLowerCase());
  if (idx < 0) return;
  ev.preventDefault();
  pressedLanes.add(idx);

  const gs = app.gameState;
  if (!gs || !gs.playing) return;

  const now = gs.elapsed - app.config.judgeB * JUDGE_ADJUST_UNIT_SEC;
  const targets = findAllTargetsAtSameTime(gs, idx, now, false);
  if (targets.length === 0) return;

  // 同じタイミングの全ノーツを処理（traceは除く）
  for (const target of targets) {
    if (target.trace) {
      continue;
    }

    const deltaMs = (now - target.time) * 1000;
    const judge = judgeByDelta(deltaMs, target.critical, target.direction);
    registerJudge(gs, target, judge, idx, deltaMs);

    if (target.direction && judge !== "Miss") {
      gs.pendingDirection.set(target.id, {
        note: target,
        laneIdx: idx,
        time: target.time,
        resolved: false
      });
    }
  }
}

function onKeyUp(ev) {
  const idx = KEY_BIND.indexOf(ev.key.toLowerCase());
  if (idx < 0) return;
  ev.preventDefault();
  pressedLanes.delete(idx);

  const gs = app.gameState;
  if (!gs || !gs.playing) return;

  for (const pending of gs.pendingDirection.values()) {
    if (pending.resolved || pending.laneIdx !== idx) continue;
    const deltaMs = Math.abs((gs.elapsed - pending.time) * 1000);
    const judge = deltaMs <= 200 ? "C-Perfect" : "Good";
    pending.resolved = true;

    const releaseNote = {
      ...pending.note,
      id: `${pending.note.id}-release`,
      critical: false,
      comboValue: 1,
      judged: false,
      type: "single",
      trace: false
    };
    registerJudge(gs, releaseNote, judge, idx, (gs.elapsed - pending.time) * 1000);
    break;
  }
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

function setupSteppers() {
  document.querySelectorAll(".stepper").forEach((wrap) => {
    wrap.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const target = wrap.dataset.target;
      const step = Number(btn.dataset.step);
      let min = -5;
      let max = 5;
      if (target === "laneSpeed") {
        min = 0.1;
        max = Number.POSITIVE_INFINITY;
      }
      if (target === "volume") {
        min = 0;
        max = 100;
      }
      if (target === "judgeTextY") {
        min = -5;
        max = 5;
      }
      const rawNext = app.config[target] + step;
      const next = target === "laneSpeed" ? Math.max(min, rawNext) : clamp(rawNext, min, max);
      app.config[target] = Math.round(next * 10) / 10;
      if (target === "volume") {
        app.config.volume = clamp(Math.round(app.config.volume), 0, 100);
        ui.volume.value = String(app.config.volume);
        if (app.audio) {
          app.audio.volume = clamp(app.config.volume / 100, 0, 1);
        }
      } else {
        ui[target].value = app.config[target].toFixed(1);
      }
      saveSettings();
    });
  });
}

function isChartFile(path) {
  const lower = path.toLowerCase();
  return lower.endsWith(".usc");
}

function normalizeChartsRelativePath(path) {
  const decoded = decodeURIComponent(String(path || "")).replace(/\\/g, "/");
  const marker = "Charts/";
  const markerIdx = decoded.indexOf(marker);
  if (markerIdx >= 0) {
    return decoded.slice(markerIdx).replace(/^\/+/, "");
  }
  return decoded.replace(/^\/+/, "");
}

function toDifficultyKey(uiValue) {
  return String(uiValue || "").toUpperCase();
}

function toDifficultyLabel(diffKey) {
  const key = String(diffKey || "").toUpperCase();
  if (key === "EASY") return "Easy";
  if (key === "NORMAL") return "Normal";
  if (key === "HARD") return "Hard";
  if (key === "EXPERT") return "Expert";
  if (key === "MASTER") return "Master";
  return "Normal";
}

function parseChartMeta(path) {
  const normalizedPath = normalizeChartsRelativePath(path);
  const parts = normalizedPath.split("/");
  const fileName = parts[parts.length - 1] || "";
  const noExt = fileName.replace(/\.usc$/i, "");
  const diffKey = noExt.toUpperCase();
  if (!DIFFICULTY_KEYS.includes(diffKey)) return null;
  const song = parts.length >= 3 ? parts[1] : noExt;
  return { song, diffKey, path: normalizedPath };
}

function syncDifficultyOptions() {
  const song = ui.chartSelect.value;
  const byDiff = app.chartCatalog[song] || {};

  let firstEnabled = null;
  for (const op of Array.from(ui.difficultySelect.options)) {
    const key = toDifficultyKey(op.value);
    const enabled = Boolean(byDiff[key]);
    op.disabled = !enabled;
    if (enabled && firstEnabled === null) {
      firstEnabled = op.value;
    }
  }

  const selectedKey = toDifficultyKey(ui.difficultySelect.value);
  if (!byDiff[selectedKey]) {
    ui.difficultySelect.value = firstEnabled || "Normal";
  }

  app.config.difficulty = ui.difficultySelect.value;
  applyDifficultyTint();
  saveSettings();
}

function resolveSelectedChartPath() {
  const song = ui.chartSelect.value;
  const diffKey = toDifficultyKey(ui.difficultySelect.value);
  return app.chartCatalog[song]?.[diffKey] || null;
}

function resolveAudioPath(chartPath) {
  const normalizedPath = normalizeChartsRelativePath(chartPath);
  const parts = normalizedPath.split("/");
  if (parts.length < 3) return null;
  const song = parts[1];
  const folder = parts.slice(0, -1).join("/");
  return `${folder}/${song}.mp3`;
}

function stopAudio() {
  if (!app.audio) return;
  app.audio.pause();
  app.audio.currentTime = 0;
  app.audio = null;
  app.audioPath = "";
}

function primeAudioPlayback(chartPath) {
  const audioPath = resolveAudioPath(chartPath);
  if (!audioPath) return;

  if (app.audio && app.audioPath === audioPath) {
    return;
  }

  stopAudio();
  const audio = new Audio(toFetchUrl(audioPath));
  audio.preload = "auto";
  audio.volume = clamp(app.config.volume / 100, 0, 1);
  audio.muted = true;
  app.audio = audio;
  app.audioPath = audioPath;

  audio.play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    })
    .catch(() => {
      audio.muted = false;
    });
}

function playChartAudio(chartPath) {
  const audioPath = resolveAudioPath(chartPath);
  if (!audioPath) return;

  let audio = app.audio;
  if (!audio || app.audioPath !== audioPath) {
    stopAudio();
    audio = new Audio(toFetchUrl(audioPath));
    audio.preload = "auto";
    audio.volume = clamp(app.config.volume / 100, 0, 1);
    app.audio = audio;
    app.audioPath = audioPath;
  }
  audio.volume = clamp(app.config.volume / 100, 0, 1);

  const safePlay = () => {
    audio.play().catch(() => {
      ui.menuStatus.textContent = "音声の再生に失敗しました。クリック後に再試行してください";
    });
  };

  safePlay();
}

function toFetchUrl(relPath) {
  return relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function crawlChartsFromDirectoryListing(rootDir) {
  const visited = new Set();
  const found = new Set();

  async function walk(dirPath) {
    const normalizedDir = normalizeChartsRelativePath(dirPath);
    if (visited.has(normalizedDir)) return;
    visited.add(normalizedDir);

    const res = await fetch(toFetchUrl(normalizedDir));
    if (!res.ok) return;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    const baseUrl = new URL(toFetchUrl(normalizedDir), window.location.href);

    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href || href === "../" || href.startsWith("#") || href.startsWith("?")) continue;

      const url = new URL(href, baseUrl);
      if (url.origin !== window.location.origin) continue;

      const decodedPath = normalizeChartsRelativePath(url.pathname);
      if (!decodedPath.startsWith("Charts/")) continue;

      if (decodedPath.endsWith("/")) {
        await walk(decodedPath);
      } else if (isChartFile(decodedPath)) {
        found.add(decodedPath);
      }
    }
  }

  await walk(rootDir);
  return Array.from(found).sort((a, b) => a.localeCompare(b, "ja"));
}

async function discoverFallbackSongsFromChartsRoot() {
  let res;
  try {
    res = await fetch(toFetchUrl("Charts/"));
  } catch (error) {
    return [];
  }
  if (!res.ok) return [];

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const baseUrl = new URL(toFetchUrl("Charts/"), window.location.href);
  const songs = new Set();

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href || href === "../" || href.startsWith("#") || href.startsWith("?")) continue;

    let url;
    try {
      url = new URL(href, baseUrl);
    } catch (error) {
      continue;
    }
    if (url.origin !== window.location.origin) continue;

    const normalizedPath = normalizeChartsRelativePath(url.pathname);
    if (!normalizedPath.startsWith("Charts/")) continue;

    const rel = normalizedPath.slice("Charts/".length).replace(/\/+$/, "");
    if (!rel || rel.includes("/")) continue;
    songs.add(rel);
  }

  return Array.from(songs).sort((a, b) => a.localeCompare(b, "ja"));
}

async function discoverFallbackSongs() {
  const songs = await discoverFallbackSongsFromChartsRoot();
  if (songs.length) {
    return songs;
  }
  return [...LAST_RESORT_CHART_SONGS];
}

async function discoverFallbackCharts() {
  const candidates = [];
  const songs = await discoverFallbackSongs();

  for (const song of songs) {
    for (const diffKey of DIFFICULTY_KEYS) {
      const chartPath = `Charts/${song}/${diffKey}.usc`;
      let res;
      try {
        res = await fetch(toFetchUrl(chartPath), { method: "HEAD" });
      } catch (error) {
        continue;
      }

      if (!res.ok && (res.status === 405 || res.status === 501)) {
        try {
          res = await fetch(toFetchUrl(chartPath));
        } catch (error) {
          continue;
        }
      }

      if (res.ok) {
        candidates.push(chartPath);
      }
    }
  }

  if (!candidates.length) {
    return [...LAST_RESORT_CHART_FILES];
  }

  return candidates;
}

async function loadChartsList() {
  ui.chartSelect.innerHTML = "";

  let files = [];
  try {
    files = await crawlChartsFromDirectoryListing("Charts/");
  } catch (error) {
    files = [];
  }

  if (!files.length) {
    files = await discoverFallbackCharts();
  }

  const catalog = {};
  for (const file of files) {
    const meta = parseChartMeta(file);
    if (!meta) continue;
    if (!catalog[meta.song]) {
      catalog[meta.song] = {};
    }
    catalog[meta.song][meta.diffKey] = meta.path;
  }
  app.chartCatalog = catalog;

  for (const song of Object.keys(catalog).sort((a, b) => a.localeCompare(b, "ja"))) {
    const op = document.createElement("option");
    op.value = song;
    op.textContent = song;
    ui.chartSelect.appendChild(op);
  }

  syncDifficultyOptions();
}

async function loadChart(path) {
  const res = await fetch(toFetchUrl(path));
  if (!res.ok) {
    throw new Error(`譜面の読み込みに失敗: ${path}`);
  }
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`譜面のJSON解析に失敗: ${path}`);
  }
  if (!json.usc || !Array.isArray(json.usc.objects)) {
    throw new Error("譜面形式が正しくありません");
  }
  return json;
}

function drawNoteRect(note, y, color, gs, strokeColor = "", strokeWidth = 2) {
  const laneW = gs.trackWidth / 12;
  const rect = laneRect(note.lane, note.size, gs.trackX, laneW, gs.judgeY);
  const h = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  const r = 7;
  ctx.moveTo(rect.x + r, y);
  ctx.lineTo(rect.x + rect.w - r, y);
  ctx.quadraticCurveTo(rect.x + rect.w, y, rect.x + rect.w, y + r);
  ctx.lineTo(rect.x + rect.w, y + h - r);
  ctx.quadraticCurveTo(rect.x + rect.w, y + h, rect.x + rect.w - r, y + h);
  ctx.lineTo(rect.x + r, y + h);
  ctx.quadraticCurveTo(rect.x, y + h, rect.x, y + h - r);
  ctx.lineTo(rect.x, y + r);
  ctx.quadraticCurveTo(rect.x, y, rect.x + r, y);
  ctx.fill();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  if (note.direction) {
    ctx.fillStyle = "#ffffff";
    const cx = rect.x + rect.w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + 3);
    ctx.lineTo(cx - 6, y + 13);
    ctx.lineTo(cx + 6, y + 13);
    ctx.closePath();
    ctx.fill();
  }
}

function easeLerp(t, ease) {
  if (ease === "in") return t * t;
  if (ease === "out") return 1 - (1 - t) * (1 - t);
  return t;
}

function laneCenterX(lane, size, gs) {
  const laneW = gs.trackWidth / 12;
  const span = getLaneSpan(lane, size || 1.5);
  return gs.trackX + (span.start + span.widthCount / 2) * laneW;
}

function drawPathObjects(gs, h, speedPx) {
  for (const obj of gs.drawObjects) {
    if (obj.type !== "slide" && obj.type !== "guide") continue;
    const points = obj.points || [];
    if (points.length < 2) continue;

    const samples = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const yA = gs.judgeY - (a.time - gs.elapsed) * speedPx;
      const yB = gs.judgeY - (b.time - gs.elapsed) * speedPx;
      if ((yA < -60 && yB < -60) || (yA > h + 60 && yB > h + 60)) continue;

      const xA = laneCenterX(a.lane, a.size, gs);
      const xB = laneCenterX(b.lane, b.size, gs);
      const wA = laneWidthCount(a.size || 1.5) * (gs.trackWidth / 12);
      const wB = laneWidthCount(b.size || 1.5) * (gs.trackWidth / 12);
      const ease = b.ease || "linear";
      for (let s = 0; s <= 8; s += 1) {
        const t = s / 8;
        const e = easeLerp(t, ease);
        const x = xA + (xB - xA) * e;
        const y = yA + (yB - yA) * t + 8;
        const w = wA + (wB - wA) * t;
        samples.push({ x, y, halfW: w / 2 });
      }
    }

    if (samples.length < 2) continue;

    let fill = "#5dade299";
    if (obj.type === "guide") {
      fill = "#65d18a66";
    }
    if (obj.type === "slide") {
      const s = gs.slideStates.get(obj.slideId);
      const inWindow = gs.elapsed >= obj.startTime && gs.elapsed <= obj.endTime;
      if (inWindow && s && !s.active) {
        fill = "#5dade280";
      } else if (obj.startCritical) {
        fill = "#d4af37aa";
      }
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(samples[0].x - samples[0].halfW, samples[0].y);
    for (let i = 1; i < samples.length; i += 1) {
      ctx.lineTo(samples[i].x - samples[i].halfW, samples[i].y);
    }
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(samples[i].x + samples[i].halfW, samples[i].y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawScene(gs) {
  const w = ui.canvas.width;
  const h = ui.canvas.height;
  ctx.clearRect(0, 0, w, h);

  gs.trackX = w * 0.05;
  gs.trackWidth = w * 0.9;
  gs.judgeY = h * 0.9;

  const laneW = gs.trackWidth / 12;

  // Performance optimization: cache lane lines
  const needsRebuild = laneLinesCache.width !== w ||
    laneLinesCache.height !== h ||
    laneLinesCache.trackX !== gs.trackX ||
    laneLinesCache.trackWidth !== gs.trackWidth ||
    laneLinesCache.judgeY !== gs.judgeY;

  if (needsRebuild) {
    laneLinesCache = {
      width: w,
      height: h,
      trackX: gs.trackX,
      trackWidth: gs.trackWidth,
      judgeY: gs.judgeY,
      paths: []
    };

    for (let i = 0; i <= 12; i += 1) {
      const x = gs.trackX + i * laneW;
      const path = new Path2D();
      path.moveTo(x, h * 0.05);
      path.lineTo(x, gs.judgeY + 20);
      laneLinesCache.paths.push({
        path,
        color: i % 2 === 0 ? "#2e5675" : "#23445f"
      });
    }
  }

  // Draw cached lane lines
  for (const { path, color } of laneLinesCache.paths) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.stroke(path);
  }

  // Draw judge line
  ctx.strokeStyle = "#7fe6c4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gs.trackX, gs.judgeY);
  ctx.lineTo(gs.trackX + gs.trackWidth, gs.judgeY);
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    if (!pressedLanes.has(i)) continue;
    const x = gs.trackX + i * laneW;
    ctx.fillStyle = "#4dd0e140";
    ctx.fillRect(x, gs.judgeY - 24, laneW, 28);
  }

  const speedPx = 100 * app.config.laneSpeed;
  drawPathObjects(gs, h, speedPx);

  // Performance optimization: draw only visible notes
  for (const note of gs.notes) {
    if (note.judged) continue;
    if (note.type === "slidePulse") continue;
    const dt = note.time - gs.elapsed;
    const y = gs.judgeY - dt * speedPx * (note.timeScale || 1);
    if (y < -40 || y > h + 40) continue;

    if (note.type === "damage") {
      const laneR = laneRect(note.lane, note.size, gs.trackX, laneW, gs.judgeY);
      ctx.fillStyle = "#ff5252";
      ctx.beginPath();
      ctx.ellipse(laneR.x + laneR.w / 2, y + 8, laneR.w / 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Performance optimization: simplified color selection
    let color;
    if (note.direction) {
      color = "#ff70a6";
    } else if (note.critical) {
      color = "#ffd54a";
    } else if (note.trace) {
      color = "#7bdff2";
    } else if (note.type === "slide") {
      color = "#5dade2";
    } else {
      color = "#ff9f1c";
    }

    let strokeColor = "";
    let strokeWidth = 2;
    if (note.type === "slide" && (note.pointType === "tick" || note.pointType === "attach")) {
      strokeColor = "#ff9f1c";
      strokeWidth = 4;
    }

    drawNoteRect(note, y, color, gs, strokeColor, strokeWidth);
  }

  for (const t of gs.judgeTexts) {
    const age = gs.nowSec - t.born;
    if (age > 0.6) continue;
    const p = age / 0.6;
    const yy = t.y - p * 28;
    const alpha = 1 - p;
    ctx.globalAlpha = alpha;
    ctx.font = "bold 26px Orbitron";
    ctx.textAlign = "center";
    ctx.fillStyle = t.customColor || JUDGE_COLORS[t.label] || "#fff";
    const text = t.label === "C-Perfect" && !app.config.showCP ? "Perfect" : t.label;
    if (text === "Miss") {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(text, t.x, yy);
    }
    ctx.fillText(text, t.x, yy);
    ctx.globalAlpha = 1;
  }

  // Performance optimization: in-place removal of expired texts
  let writeIdx = 0;
  for (let i = 0; i < gs.judgeTexts.length; i += 1) {
    if (gs.nowSec - gs.judgeTexts[i].born <= 0.6) {
      gs.judgeTexts[writeIdx] = gs.judgeTexts[i];
      writeIdx += 1;
    }
  }
  gs.judgeTexts.length = writeIdx;
}

function updateAutoJudge(gs) {
  const now = gs.elapsed - app.config.judgeB * JUDGE_ADJUST_UNIT_SEC;

  // Performance optimization: early exit for future notes
  const maxLookAhead = 0.2; // Maximum judge window

  for (const note of gs.notes) {
    if (note.judged) continue;

    // Early skip for future notes beyond judge window
    if (now < note.time - maxLookAhead) break;

    if (note.type === "slidePulse") {
      if (now >= note.time) {
        const state = gs.slideStates.get(note.slideId);
        const active = !!(state && state.active);
        registerJudge(gs, note, active ? "C-Perfect" : "Miss", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
      }
      continue;
    }

    if (note.type === "slide" && note.pointType === "end" && !note.direction) {
      if (now >= note.time) {
        const state = gs.slideStates.get(note.slideId);
        const active = !!(state && state.active);
        registerJudge(gs, note, active ? "C-Perfect" : "Miss", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
        if (state) {
          state.active = false;
          state.finished = true;
        }
      }
      continue;
    }

    if (note.type === "slide" && note.pointType === "attach") {
      if (now >= note.time) {
        const state = gs.slideStates.get(note.slideId);
        const active = !!(state && state.active);
        registerJudge(gs, note, active ? "C-Perfect" : "Miss", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
      }
      continue;
    }

    if (note.type === "damage") {
      if (Math.abs(now - note.time) <= 0.05) {
        for (const laneIdx of pressedLanes) {
          if (noteWithinLane(note, laneIdx)) {
            note.touched = true;
          }
        }
      }
      if (now > note.time + 0.05) {
        registerJudge(gs, note, note.touched ? "DAMAGE" : "SAFE", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
      }
      continue;
    }

    if (note.trace) {
      if (note.fastSnapTouched && now >= note.time - FAST_JUDGE_SNAP_SEC) {
        const laneIdx = Number.isInteger(note.fastSnapLane) ? note.fastSnapLane : laneStartIndex(note.lane, note.size);
        registerJudge(gs, note, "C-Perfect", laneIdx, 0);
        continue;
      }

      if (Math.abs(now - note.time) <= 0.125) {
        for (const laneIdx of pressedLanes) {
          if (noteWithinLane(note, laneIdx)) {
            if (now < note.time - FAST_JUDGE_SNAP_SEC) {
              note.fastSnapTouched = true;
              note.fastSnapLane = laneIdx;
            } else {
              const snappedDeltaMs = clamp((now - note.time) * 1000, -FAST_JUDGE_SNAP_SEC * 1000, FAST_JUDGE_SNAP_SEC * 1000);
              registerJudge(gs, note, "C-Perfect", laneIdx, snappedDeltaMs);
            }
            break;
          }
        }
      } else if (now > note.time + 0.125) {
        registerJudge(gs, note, "Miss", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
      }
      continue;
    }

    if (now > note.time + 0.1) {
      registerJudge(gs, note, "Miss", laneStartIndex(note.lane, note.size), (now - note.time) * 1000);
    }
  }

  for (const pending of gs.pendingDirection.values()) {
    if (pending.resolved) continue;
    if (now > pending.time + 0.1) {
      pending.resolved = true;
      const releaseNote = {
        ...pending.note,
        id: `${pending.note.id}-release-timeout`,
        critical: false,
        comboValue: 1,
        judged: false,
        type: "single",
        trace: false
      };
      registerJudge(gs, releaseNote, "Good", pending.laneIdx, (now - pending.time) * 1000);
    }
  }
}

function updateHud(gs) {
  ui.scoreText.textContent = formatNumber(gs.score);
  ui.comboText.textContent = formatNumber(gs.combo);

  const hpRate = gs.hp / gs.hpMax;
  ui.hpBar.style.width = `${(hpRate * 100).toFixed(2)}%`;
  if (hpRate <= 0.25) ui.hpBar.style.background = "#ef476f";
  else if (hpRate <= 0.5) ui.hpBar.style.background = "#ffd166";
  else ui.hpBar.style.background = "#2dd36f";
}

function computeSpecials(gs) {
  const specials = [];
  if (gs.hp >= gs.hpMax) specials.push("FULL HEALTH");
  if (!gs.noDamageBroken) specials.push("NO DAMAGE");

  if (gs.allCriticalPossible && gs.hasCritical) specials.push("ALL CRITICAL");
  else if (gs.allPerfectPossible) specials.push("ALL PERFECT");
  else if (gs.fullComboPossible) specials.push("FULL COMBO");

  return specials;
}

function showResult(gs) {
  stopAudio();
  setPanel(ui.result);

  ui.resultScore.textContent = formatNumber(gs.score);
  ui.resultCombo.textContent = formatNumber(gs.maxCombo);
  ui.rCP.textContent = String(gs.counts["C-Perfect"] || 0);
  ui.rP.textContent = String(gs.counts.Perfect || 0);
  ui.rG.textContent = String(gs.counts.Great || 0);
  ui.rGo.textContent = String(gs.counts.Good || 0);
  ui.rMiss.textContent = String(gs.counts.Miss || 0);
  ui.rBad.textContent = String(gs.counts.Bad || 0);
  ui.rDmg.textContent = String(gs.counts.DAMAGE || 0);

  ui.specials.innerHTML = "";
  for (const s of computeSpecials(gs)) {
    const chip = document.createElement("span");
    chip.textContent = s;
    ui.specials.appendChild(chip);
  }

  logGame("RESULT", {
    score: gs.score,
    maxCombo: gs.maxCombo,
    counts: gs.counts,
    hp: gs.hp,
    specials: computeSpecials(gs)
  });
}

function tick() {
  const gs = app.gameState;
  if (!gs || !gs.playing) return;

  gs.nowSec = performance.now() / 1000;
  gs.elapsed = gs.nowSec - gs.startAt + app.config.judgeA * JUDGE_ADJUST_UNIT_SEC;

  updateAutoJudge(gs);
  drawScene(gs);
  updateHud(gs);

  const allJudged = gs.notes.every((n) => n.judged);
  const finishedByTime = gs.elapsed > gs.endTime;
  const finishedByJudged = allJudged && (!gs.hasGuide || gs.elapsed > gs.endTime);

  if ((finishedByJudged || finishedByTime) && !gs.gameOver) {
    gs.playing = false;
    showResult(gs);
    return;
  }

  if (gs.gameOver && gs.nowSec - gs.gameOverAt > 2) {
    gs.playing = false;
    showResult(gs);
    return;
  }

  requestAnimationFrame(tick);
}

async function startGame() {
  if (!ui.chartSelect.value) {
    ui.menuStatus.textContent = "譜面が見つかりませんでした";
    return;
  }

  const selectedChartPath = resolveSelectedChartPath();
  if (!selectedChartPath) {
    ui.menuStatus.textContent = "選択した難易度の譜面が存在しません";
    return;
  }

  ui.menuStatus.textContent = "譜面ロード中...";

  app.config.difficulty = toDifficultyLabel(toDifficultyKey(ui.difficultySelect.value));
  app.config.showCP = ui.showCP.checked;
  saveSettings();
  applyDifficultyTint();

  logGame("START_REQUEST", {
    chart: selectedChartPath,
    difficulty: app.config.difficulty,
    laneSpeed: app.config.laneSpeed,
    judgeA: app.config.judgeA,
    judgeB: app.config.judgeB,
    judgeTextY: app.config.judgeTextY,
    volume: app.config.volume,
    showCP: app.config.showCP
  });

  let chart;
  try {
    chart = await loadChart(selectedChartPath);
  } catch (error) {
    ui.menuStatus.textContent = error.message;
    return;
  }

  let built;
  try {
    built = buildJudgeItems(chart);
  } catch (error) {
    ui.menuStatus.textContent = error.message;
    return;
  }

  setPanel(ui.game);
  ui.readyOverlay.classList.add("hidden");
  ui.gameOverOverlay.classList.add("hidden");

  const hpMax = 100;
  primeAudioPlayback(selectedChartPath);
  const gs = {
    chartPath: selectedChartPath,
    notes: built.judgeItems,
    drawObjects: built.drawObjects,
    slideStates: built.slideStates,
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: {
      "C-Perfect": 0,
      Perfect: 0,
      Great: 0,
      Good: 0,
      Miss: 0,
      Bad: 0,
      DAMAGE: 0,
      SAFE: 0
    },
    hp: hpMax,
    hpMax,
    basePerCombo: built.totalCombo > 0 ? 1000000 / built.totalCombo : 0,
    criticalBonusUnit: built.criticalCount > 0 ? 100000 / built.criticalCount : 0,
    criticalCount: built.criticalCount,
    damageCountAll: built.damageCount,
    noDamageBroken: false,
    fullComboPossible: true,
    allPerfectPossible: true,
    allCriticalPossible: true,
    comboBroken: false,
    hasCritical: built.judgeItems.some((n) => n.critical),
    pendingDirection: new Map(),
    judgeTexts: [],
    hasGuide: built.hasGuide,
    endTime: built.endTime,
    playing: false,
    gameOver: false,
    damageCount: 0,
    damageOneTimeGuardUsed: false,
    nowSec: 0,
    elapsed: 0,
    trackX: 0,
    trackWidth: 0,
    judgeY: 0
  };

  app.gameState = gs;
  updateHud(gs);

  setTimeout(() => {
    ui.readyOverlay.classList.remove("hidden");
    setTimeout(() => {
      ui.readyOverlay.classList.add("hidden");
      setTimeout(() => {
        gs.playing = true;
        gs.startAt = performance.now() / 1000;
        playChartAudio(gs.chartPath);
        requestAnimationFrame(tick);
      }, 3000);
    }, 2000);
  }, 0);
}

function backToMenu() {
  stopAudio();
  app.gameState = null;
  setPanel(ui.menu);
  ui.menuStatus.textContent = "";
}

async function init() {
  loadSettings();
  applyConfigToUI();
  applyDifficultyTint();

  ui.startButton.disabled = true;
  ui.menuStatus.textContent = "譜面一覧を取得中...";

  await loadChartsList();

  if (!ui.chartSelect.value) {
    ui.menuStatus.textContent = "譜面一覧を取得できませんでした";
  } else {
    ui.menuStatus.textContent = `${ui.chartSelect.options.length}件の譜面を読み込みました`;
    ui.startButton.disabled = false;
  }

  setupSteppers();
  ui.chartSelect.addEventListener("change", syncDifficultyOptions);
  ui.difficultySelect.addEventListener("change", () => {
    app.config.difficulty = ui.difficultySelect.value;
    applyDifficultyTint();
    saveSettings();
  });
  ui.showCP.addEventListener("change", () => {
    app.config.showCP = ui.showCP.checked;
    saveSettings();
  });
  ui.startButton.addEventListener("click", startGame);
  ui.backButton.addEventListener("click", backToMenu);
}

init();
