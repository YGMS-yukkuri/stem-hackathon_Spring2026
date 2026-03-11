// chart.js
// Responsible for loading .usc (JSON) files and providing structured note data

export async function loadChart(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`failed to fetch chart ${path}`);
    const data = await res.json();
    validateChart(data);
    return data.usc;
}

function validateChart(data) {
    if (!data.usc || !data.usc.objects) {
        throw new Error('invalid chart format');
    }
    // additional validation could be added
}

// helper to convert beat/time to ms using bpm changes
export function beatToMs(beat, chart) {
    // simple linear assuming constant bpm for now
    // advanced: track bpm changes
    let currentBpm = 120;
    let lastBeat = 0;
    let timeMs = 0;
    for (const obj of chart.objects) {
        if (obj.type === 'bpm' && obj.beat <= beat) {
            const deltaBeat = obj.beat - lastBeat;
            timeMs += (60000 / currentBpm) * deltaBeat;
            lastBeat = obj.beat;
            currentBpm = obj.bpm;
        }
    }
    // remaining portion
    timeMs += (60000 / currentBpm) * (beat - lastBeat);
    return timeMs;
}
