// game.js
import { loadChart, beatToMs } from './chart.js';
import * as UI from './ui.js';

const canvas = document.getElementById('playfield');
const ctx = canvas.getContext('2d');

let chart = null;
let audio = null;
let startTime = 0;
let score = 0;
let combo = 0;
let hp = 1.0;
let totalCombo = 0;
let critCount = 0;

let laneSpeed = 1.0;
let offsetA = 0.0;
let offsetB = 0.0;

// mapping keys to lanes (1..12)
const keyMap = {
    'a':1,'s':2,'d':3,'f':4,'g':5,'h':6,'j':7,'k':8,'l':9,';':10,':':11,']':12
};

let activeNotes = [];

async function init() {
    populateSongList();
    bindMenuControls();
    canvas.width = 800;
    canvas.height = 600;
    document.getElementById('menu').style.display = 'block'; // show selection UI initially
}

function populateSongList() {
    // currently we only support the demo files shipped with the repo
    const demos = [
        'demo','demo_1','demo_2','demo_3','demo_4','demo_5','demo6','demo7','demo_8'
    ];
    const sel = document.getElementById('song-select');
    demos.forEach(s=>{
        const opt = document.createElement('option'); opt.value=s; opt.textContent=s; sel.appendChild(opt);
    });
    // difficulty is embedded in filename for demos, so we don't use a difficulty select
    const sel2 = document.getElementById('difficulty-select');
    sel2.style.display='none';
}

function bindMenuControls() {
    document.getElementById('speed-inc').addEventListener('click',()=>{
        laneSpeed = Math.min(5, laneSpeed+0.1);
        document.getElementById('speed-val').textContent=laneSpeed.toFixed(1);
    });
    document.getElementById('speed-dec').addEventListener('click',()=>{
        laneSpeed = Math.max(0.1, laneSpeed-0.1);
        document.getElementById('speed-val').textContent=laneSpeed.toFixed(1);
    });
    document.getElementById('speed-plusplus').addEventListener('click',()=>{
        laneSpeed = Math.min(5, laneSpeed+1.0);
        document.getElementById('speed-val').textContent=laneSpeed.toFixed(1);
    });
    document.getElementById('speed-minusminus').addEventListener('click',()=>{
        laneSpeed = Math.max(0.1, laneSpeed-1.0);
        document.getElementById('speed-val').textContent=laneSpeed.toFixed(1);
    });
    document.getElementById('offsetA-inc').addEventListener('click',()=>{
        offsetA = Math.min(5, offsetA+0.1);
        document.getElementById('offsetA-val').textContent=offsetA.toFixed(1);
    });
    document.getElementById('offsetA-dec').addEventListener('click',()=>{
        offsetA = Math.max(-5, offsetA-0.1);
        document.getElementById('offsetA-val').textContent=offsetA.toFixed(1);
    });
    document.getElementById('offsetB-inc').addEventListener('click',()=>{
        offsetB = Math.min(5, offsetB+0.1);
        document.getElementById('offsetB-val').textContent=offsetB.toFixed(1);
    });
    document.getElementById('offsetB-dec').addEventListener('click',()=>{
        offsetB = Math.max(-5, offsetB-0.1);
        document.getElementById('offsetB-val').textContent=offsetB.toFixed(1);
    });

    document.getElementById('start-button').addEventListener('click',startGame);
}

async function startGame() {
    document.getElementById('menu').style.display='none';
    const song = document.getElementById('song-select').value;
    // demos are stored at Charts/<name>.json
    chart = await loadChart(`../Charts/${song}.json`);
    // audio load (not provided for demos) - optional
    try {
        const head = await fetch(`../Charts/${song}.mp3`, { method: 'HEAD' });
        if (head.ok) {
            audio = new Audio(`../Charts/${song}.mp3`);
            try {
                await audio.load();
            } catch (e) {
                console.warn('audio failed to load, continuing without it', e);
                audio = null;
            }
        } else {
            audio = null;
        }
    } catch(e) {
        console.warn('could not check audio existence', e);
        audio = null;
    }
    window._tookDamage = false;
    score=0;combo=0;hp=1;totalCombo=0;critCount=0;
    UI.updateScore(0); UI.updateCombo(0); UI.updateHp(1);
    showReadyAndStart();
}

function showReadyAndStart() {
    UI.showReady(true);
    setTimeout(()=>{
        UI.showReady(false);
        setTimeout(()=>{
            beginPlay();
        },3000);
    },2000);
}

function beginPlay() {
    startTime = performance.now();
    if (audio) {
        audio.currentTime = (chart.offset||0)/1000;
        audio.play().catch(e=>{
            console.warn('audio play failed', e);
            audio = null;
        });
    }
    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(gameLoop);
}

function handleKey(e) {
    const key = e.key;
    if (!keyMap[key]) return;
    judgeInput(keyMap[key]);
}

function judgeInput(laneIndex) {
    // convert key index (1..12) to chart coordinate (-5.5..+5.5)
    const inputCoord = -5.5 + (laneIndex - 1);
    // find closest active note within judgement window by time and horizontal distance
    let now = performance.now() - startTime + offsetB;
    let best = null;
    let bestDt = Infinity;
    activeNotes.forEach(n=>{
        // determine if input matches note horizontally considering size
        const halfWidth = (n.size || 1) / 2;
        if (inputCoord < n.lane - halfWidth || inputCoord > n.lane + halfWidth) return;
        let dt = now - n.time;
        if (Math.abs(dt) < Math.abs(bestDt)) {
            best = n;
            bestDt = dt;
        }
    });
    if (best) {
        evaluateNote(best, bestDt);
    }
}

function evaluateNote(note, dt) {
    // simple judgement using spec
    let jud = 'Miss';
    let color = '#fff';
    const abs = Math.abs(dt);
    if (note.type === 'damage') {
        if (abs <= 50) {
            jud = 'DAMAGE'; hp -= computeDamage();
            color='red';
            window._tookDamage = true;
        } else {
            jud='SAFE'; hp = Math.min(1,hp+0.1); color='gold';
        }
    } else {
        // assume single for now
        if (abs <= 25) { jud='C-Perfect'; color='gold'; }
        else if (abs <= 50) { jud='Perfect'; color='yellow'; }
        else if (abs <= 75) { jud='Great'; color='orange'; }
        else if (abs <= 100) { jud='Good'; color='green'; }
        else { jud='Miss'; color='black'; }
        if (jud!=='Miss') {
            combo++; totalCombo++; score += computeScore(jud);
        } else { combo=0; }
    }
    UI.updateScore(score); UI.updateCombo(combo); UI.updateHp(Math.max(0,hp));
    UI.showJudge(jud, color);
    // remove note
    const idx = activeNotes.indexOf(note);
    if (idx>=0) activeNotes.splice(idx,1);
}

function computeScore(jud) {
    // placeholder: weighting
    switch(jud) {
        case 'C-Perfect': return 100;
        case 'Perfect': return 100;
        case 'Great': return 80;
        case 'Good': return 50;
        default: return 0;
    }
}

function computeDamage() {
    // simple example
    return 0.1;
}

function gameLoop(ts) {
    const elapsed = ts - startTime;
    draw(elapsed);
    if (hp <= 0) {
        endGame(); return;
    }
    if (audio && !audio.paused) {
        requestAnimationFrame(gameLoop);
    } else if (!audio) {
        // no audio means rely on time elapsed; keep looping until audio would have ended
        requestAnimationFrame(gameLoop);
    } else {
        endGame();
    }
}

function draw(elapsed) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw notes
    const now = elapsed - offsetA*16;
    // spawn notes
    chart.objects.forEach(o=>{
        if (o.type === 'single' || o.type==='damage') {
            const noteTime = beatToMs(o.beat, chart);
            if (noteTime < now + 3000 && !o.spawned) {
                activeNotes.push({time:noteTime, lane:o.lane, size:o.size||1, type:o.type});
                o.spawned=true;
            }
        } else if (o.type === 'slide') {
            // spawn subnotes for start and tick
            o.connections.forEach(conn=>{
                if (conn.type === 'start' || conn.type === 'tick' || conn.type==='end') {
                    const noteTime = beatToMs(conn.beat, chart);
                    if (noteTime < now + 3000 && !conn.spawned) {
                        activeNotes.push({time:noteTime, lane:conn.lane, size:conn.size||1, type:'single'});
                        conn.spawned=true;
                    }
                }
            });
        }
    });
    // iterate active and draw, also mark misses
    const toRemove = [];
    // draw hit line
    const scrollTime = 3000; // milliseconds from spawn to hit line
    const hitY = canvas.height * 0.8; // judgment line position
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(canvas.width, hitY);
    ctx.stroke();

    // draw active notes with proper downward motion
    activeNotes.forEach(n=>{
        // compute vertical position: when n.time==now -> at hitY
        // when n.time == now + scrollTime -> at top (0)
        const y = hitY - ((n.time - now) / scrollTime) * hitY;
        // lane coordinates range -5.5..+5.5 -> map to canvas width
        const laneRange = 11.0; // distance from -5.5 to +5.5
        const laneWidth = canvas.width / laneRange;
        const noteWidth = (n.size || 1) * laneWidth;
        const x = (n.lane + 5.5) * laneWidth - noteWidth/2;
        ctx.fillStyle = n.type==='damage' ? 'red' : 'white';
        ctx.fillRect(x, y, noteWidth, 20);
        // if note passed beyond late judgement and wasn't hit
        if (now - n.time > 100) {
            if (n.type !== 'damage') {
                combo = 0;
                UI.updateCombo(combo);
            }
            toRemove.push(n);
        }
    });
    toRemove.forEach(n=>{
        const idx = activeNotes.indexOf(n);
        if (idx>=0) activeNotes.splice(idx,1);
    });
}

function endGame() {
    document.removeEventListener('keydown', handleKey);
    // evaluate special conditions
    const results = [];
    if (hp === 1) results.push('FULL HEALTH');
    // no damage: check if any DAMAGE judgement occurred
    // track via global variable
    if (!window._tookDamage) results.push('NO DAMAGE');
    if (totalCombo > 0 && combo === totalCombo) results.push('FULL COMBO');
    // ALL PERFECT / ALL CRITICAL are not calculated exactly in this simple implementation
    let html = `<h2>Result</h2><p>Score: ${score}</p><p>Combo: ${totalCombo}</p>`;
    if (results.length) {
        html += '<p>Special: ' + results.join(', ') + '</p>';
    }
    UI.showResult(html);
}

init();
