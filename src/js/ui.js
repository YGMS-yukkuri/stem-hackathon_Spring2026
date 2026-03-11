// ui.js
// Handles updating score, combo, hp bar and judgment effects

const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const hpFillEl = document.getElementById('hp-bar-fill');
const judgeEl = document.getElementById('judge-effect');
const readyScreen = document.getElementById('ready-screen');
const resultScreen = document.getElementById('result-screen');

export function updateScore(v) {
    scoreEl.textContent = numberWithCommas(v);
}

export function updateCombo(v) {
    comboEl.textContent = numberWithCommas(v);
}

export function updateHp(pct) {
    hpFillEl.style.width = pct * 100 + '%';
    if (pct > 0.5) hpFillEl.style.background = 'green';
    else if (pct > 0.25) hpFillEl.style.background = 'yellow';
    else hpFillEl.style.background = 'red';
}

export function showJudge(text, color) {
    judgeEl.textContent = text;
    judgeEl.style.color = color;
    judgeEl.classList.add('visible');
    setTimeout(() => judgeEl.classList.remove('visible'), 300);
}

export function showReady(show) {
    console.log('showReady', show);
    readyScreen.classList.toggle('visible', show);
}

export function showResult(html) {
    resultScreen.innerHTML = html;
    resultScreen.classList.add('visible');
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
