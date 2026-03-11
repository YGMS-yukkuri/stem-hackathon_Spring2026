// simple rhythm game engine skeleton based on specification

class Chart {
  constructor(data) {
    this.offset = data.usc.offset || 0;
    this.objects = data.usc.objects || [];
    this.version = data.version || 0;
  }

  // return array of note objects with time in ms
  getNotes() {
    const notes = [];
    // convert beat to ms using bpm changes (simple: assume constant 120bpm if none)
    let currentBpm = 120;
    const bpmMap = [{ beat: 0, bpm: currentBpm }];
    for (const obj of this.objects) {
      if (obj.type === 'bpm') {
        bpmMap.push({ beat: obj.beat, bpm: obj.bpm });
      }
    }
    function beatToMs(beat) {
      // naive: walk through bpmMap
      let time = 0;
      let lastBeat = 0;
      let lastBpm = bpmMap[0].bpm;
      for (let i = 1; i < bpmMap.length; i++) {
        if (beat >= bpmMap[i].beat) {
          const span = bpmMap[i].beat - lastBeat;
          time += (span * 60 * 1000) / lastBpm;
          lastBeat = bpmMap[i].beat;
          lastBpm = bpmMap[i].bpm;
        } else break;
      }
      // remaining
      time += ((beat - lastBeat) * 60 * 1000) / lastBpm;
      return time;
    }
    for (const obj of this.objects) {
      if (['single', 'damage', 'guide', 'slide'].includes(obj.type)) {
        const t = beatToMs(obj.beat) + this.offset;
        notes.push({ ...obj, time: t });
      }
    }
    // sort by time
    notes.sort((a, b) => a.time - b.time);
    return notes;
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chart = null;
    this.notes = [];
    this.startTime = 0;
    this.paused = true;
    this.options = {
      laneSpeed: 1.0,
      judgeOffsetA: 0,
      judgeOffsetB: 0,
    };
    this.laneCount = 12;
    this.keyToLane = {
      KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3,
      KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7,
      KeyL: 8, Semicolon: 9, Quote: 10, BracketRight: 11
    };
    this.activeKeys = {};
    this.score = 0;
    this.combo = 0;
    this.hp = 100;
    this.setupInput();
  }

  // convert chart lane value (which can be negative/float) to 0-based index
  laneToIndex(laneValue) {
    // assume lanes are centered around 0 and span roughly -6..+6
    // map by adding half the count and clamping
    const idx = Math.floor(laneValue + this.laneCount / 2);
    return Math.min(Math.max(idx, 0), this.laneCount - 1);
  }

  async loadChart(url) {
    this.chartUrl = url;
    const resp = await fetch(url);
    const json = await resp.json();
    this.chart = new Chart(json);
    this.notes = this.chart.getNotes();
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      if (this.keyToLane[e.code] !== undefined) {
        this.activeKeys[e.code] = true;
        this.checkHit(e.code);
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (this.keyToLane[e.code] !== undefined) {
        delete this.activeKeys[e.code];
        e.preventDefault();
      }
    });
  }

  start() {
    this.startTime = performance.now();
    this.paused = false;
    this.audio = new Audio();
    // set src according to chart path -- assume mp3 same folder with same song name
    this.audio.src = this.getAudioPath();
    if (this.audio.src) {
      this.audio.play();
    }
    // show HUD
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'block';
    requestAnimationFrame(this.loop.bind(this));
  }

  getAudioPath() {
    if (!this.chartUrl) return '';
    // assume chart URL like Charts/楽曲名/難易度.usc
    const parts = this.chartUrl.split('/');
    if (parts.length >= 2) {
      const song = parts[1];
      return `Charts/${song}/${song}.mp3`;
    }
    return '';
  }

  loop() {
    if (this.paused) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    this.update(elapsed);
    this.render(elapsed);
    requestAnimationFrame(this.loop.bind(this));
  }

  update(elapsed) {
    // simple cull: remove notes that passed far beyond hit window
    this.notes = this.notes.filter(n => n.time + 2000 > elapsed);
    // update HUD values
    const scoreEl = document.getElementById('hud-score');
    const comboEl = document.getElementById('hud-combo');
    const hpEl = document.getElementById('hud-hp');
    if (scoreEl) scoreEl.textContent = this.score;
    if (comboEl) comboEl.textContent = this.combo;
    if (hpEl) hpEl.textContent = this.hp;
  }

  render(elapsed) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    // draw lanes
    const laneWidth = w / this.laneCount;
    ctx.fillStyle = '#333';
    for (let i = 0; i < this.laneCount; i++) {
      ctx.fillRect(i * laneWidth, 0, laneWidth - 1, h);
    }
    // draw notes (flow xuống từ trên xuống dưới)
    ctx.fillStyle = '#0f0';
    const scroll = this.options.laneSpeed * 0.1;
    for (const note of this.notes) {
      // compute vertical position so notes start above and move down
      const y = h - (note.time - elapsed) * scroll;
      if (y < -20 || y > h + 20) continue;
      const lane = this.laneToIndex(note.lane);
      if (lane < 0 || lane >= this.laneCount) continue;
      ctx.fillRect(lane * laneWidth + 2, y, laneWidth - 4, 10);
    }
    // draw judgement line
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, h - 50, w, 2);
  }

  checkHit(code) {
    const lane = this.keyToLane[code];
    const now = performance.now();
    const elapsed = now - this.startTime;
    // find closest note in lane within judge window
    let best = null;
    let bestDiff = 1000;
    for (const note of this.notes) {
      const noteLane = this.laneToIndex(note.lane);
      if (noteLane !== lane) continue;
      const diff = Math.abs(note.time - elapsed);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = note;
      }
    }
    if (best && bestDiff < 100) {
      console.log('hit', best, bestDiff);
      this.combo++;
      this.score++;
      // remove note
      const idx = this.notes.indexOf(best);
      if (idx !== -1) this.notes.splice(idx, 1);
    } else {
      console.log('miss');
      this.combo = 0;
    }
  }
}

