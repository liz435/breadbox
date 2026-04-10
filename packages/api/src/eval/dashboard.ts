// ── Dashboard HTML Generator ────────────────────────────────────────────
//
// Generates a single-file HTML dashboard with inline CSS + JS.
// Fetches data from /api/eval/* endpoints.

export function generateDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dreamer Agent Eval</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 20px; }
  h1 { font-size: 1.5rem; margin-bottom: 4px; }
  h2 { font-size: 1.1rem; margin: 24px 0 12px; color: #a3a3a3; border-bottom: 1px solid #262626; padding-bottom: 6px; }
  .subtitle { color: #737373; font-size: 0.85rem; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: #171717; border: 1px solid #262626; border-radius: 8px; padding: 16px; }
  .card-label { font-size: 0.75rem; color: #737373; text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 1.8rem; font-weight: 700; margin-top: 4px; }
  .card-detail { font-size: 0.75rem; color: #525252; margin-top: 4px; }
  .green { color: #22c55e; } .red { color: #ef4444; } .yellow { color: #eab308; } .blue { color: #3b82f6; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { text-align: left; padding: 8px; color: #737373; font-weight: 500; border-bottom: 1px solid #262626; }
  td { padding: 8px; border-bottom: 1px solid #1a1a1a; }
  tr:hover { background: #1a1a1a; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  .badge-green { background: #052e16; color: #22c55e; }
  .badge-red { background: #2a0a0a; color: #ef4444; }
  .badge-yellow { background: #2a2200; color: #eab308; }
  .badge-blue { background: #0a1a2a; color: #3b82f6; }
  .run-row { cursor: pointer; }
  .run-detail { display: none; background: #111; }
  .run-detail.open { display: table-row; }
  .trace { padding: 12px 16px; }
  .trace-step { display: flex; gap: 8px; padding: 4px 0; border-left: 2px solid #262626; padding-left: 12px; margin-left: 8px; }
  .trace-step.tool_call { border-color: #3b82f6; }
  .trace-step.tool_result.success { border-color: #22c55e; }
  .trace-step.tool_result.error { border-color: #ef4444; }
  .trace-step.text { border-color: #525252; }
  .trace-num { color: #525252; font-size: 0.7rem; min-width: 20px; }
  .trace-type { font-size: 0.7rem; font-weight: 600; min-width: 70px; }
  .trace-body { font-size: 0.75rem; color: #a3a3a3; word-break: break-all; }
  .trace-body pre { background: #1a1a1a; padding: 4px 8px; border-radius: 4px; overflow-x: auto; margin-top: 2px; font-size: 0.7rem; }
  .score-bar { height: 6px; border-radius: 3px; background: #262626; overflow: hidden; margin-top: 4px; }
  .score-fill { height: 100%; border-radius: 3px; }
  .refresh-btn { background: #262626; color: #a3a3a3; border: 1px solid #333; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
  .refresh-btn:hover { background: #333; color: #e5e5e5; }
  .loading { color: #525252; padding: 40px; text-align: center; }
  #error { color: #ef4444; padding: 8px; display: none; }
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center;">
  <div><h1>Agent Eval Dashboard</h1><p class="subtitle">Dreamer Arduino Simulator</p></div>
  <button class="refresh-btn" onclick="refresh()">Refresh</button>
</div>
<div id="error"></div>
<div id="content"><div class="loading">Loading...</div></div>

<script>
const API = window.location.origin;

async function refresh() {
  document.getElementById('content').innerHTML = '<div class="loading">Evaluating runs...</div>';
  try {
    await fetch(API + '/api/eval/refresh', { method: 'POST' });
    await loadDashboard();
  } catch(e) {
    showError(e.message);
  }
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

function scoreColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

async function loadDashboard() {
  try {
    const res = await fetch(API + '/api/eval/summary');
    if (!res.ok) { showError('No eval data — click Refresh'); return; }
    const summary = await res.json();
    renderSummary(summary);
  } catch(e) {
    document.getElementById('content').innerHTML = '<div class="loading">No eval data yet. Click Refresh to evaluate all runs.</div>';
  }
}

function renderSummary(s) {
  const models = Object.entries(s.byModel).map(([m,d]) =>
    '<tr><td>' + m + '</td><td>' + d.runs + '</td><td>' + d.avgScore + '</td><td>' + d.totalTokens.toLocaleString() + '</td><td>$' + d.totalCost.toFixed(4) + '</td></tr>'
  ).join('');

  const issues = s.topIssues.map(i => '<tr><td>' + i.issue + '</td><td>' + i.count + '</td></tr>').join('');

  const worst = s.worstRuns.map(r =>
    '<tr class="run-row" onclick="toggleRun(this,\\'' + r.runId + '\\')"><td style="font-family:monospace;font-size:0.7rem;">' + r.runId.slice(0,8) + '</td><td><span style="color:' + scoreColor(r.score) + '">' + r.score + '</span></td><td style="color:#737373">' + r.issue.slice(0,80) + '</td></tr><tr class="run-detail" id="detail-' + r.runId + '"><td colspan="3"><div class="trace" id="trace-' + r.runId + '">Loading...</div></td></tr>'
  ).join('');

  document.getElementById('content').innerHTML = [
    '<div class="grid">',
    card('Total Runs', s.totalRuns, ''),
    card('Avg Score', s.avgScore + '/100', '', scoreColor(s.avgScore)),
    card('Avg Tokens/Run', s.avgTokensPerRun.toLocaleString(), ''),
    card('Tool Error Rate', (s.avgToolErrorRate * 100).toFixed(0) + '%', '', s.avgToolErrorRate > 0.1 ? '#ef4444' : '#22c55e'),
    card('Hallucination Rate', s.hallucationRate + '%', '', s.hallucationRate > 10 ? '#ef4444' : '#22c55e'),
    card('propose_circuit', s.proposeCircuitAdoption + '%', 'adoption rate', s.proposeCircuitAdoption > 50 ? '#22c55e' : '#eab308'),
    '</div>',

    '<h2>By Model</h2>',
    '<table><tr><th>Model</th><th>Runs</th><th>Avg Score</th><th>Total Tokens</th><th>Cost</th></tr>' + models + '</table>',

    '<h2>Top Issues</h2>',
    issues ? '<table><tr><th>Issue</th><th>Count</th></tr>' + issues + '</table>' : '<p style="color:#525252;font-size:0.8rem">No issues detected</p>',

    '<h2>Worst Runs</h2>',
    worst ? '<table><tr><th>Run</th><th>Score</th><th>Issue</th></tr>' + worst + '</table>' : '<p style="color:#525252;font-size:0.8rem">No runs to show</p>',

    '<h2>All Runs</h2><div id="all-runs"><button class="refresh-btn" onclick="loadAllRuns()">Load all runs</button></div>',
  ].join('');
}

function card(label, value, detail, color) {
  return '<div class="card"><div class="card-label">' + label + '</div><div class="card-value" style="color:' + (color||'#e5e5e5') + '">' + value + '</div>' + (detail ? '<div class="card-detail">' + detail + '</div>' : '') + '</div>';
}

async function toggleRun(row, runId) {
  const detail = document.getElementById('detail-' + runId);
  if (detail.classList.contains('open')) {
    detail.classList.remove('open');
    return;
  }
  detail.classList.add('open');
  try {
    const res = await fetch(API + '/api/eval/run/' + runId);
    const eval_ = await res.json();
    document.getElementById('trace-' + runId).innerHTML = renderRunDetail(eval_);
  } catch(e) {
    document.getElementById('trace-' + runId).innerHTML = '<span style="color:#ef4444">Failed to load</span>';
  }
}

function renderRunDetail(e) {
  const traceHtml = e.path.trace.map(s => {
    const cls = s.type + (s.succeeded === false ? ' error' : s.succeeded === true ? ' success' : '');
    let body = '';
    if (s.type === 'tool_call') {
      const inputStr = JSON.stringify(s.toolInput, null, 2);
      body = '<strong>' + s.toolName + '</strong><pre>' + inputStr.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
    } else if (s.type === 'tool_result') {
      const icon = s.succeeded ? '✓' : '✗';
      const color = s.succeeded ? '#22c55e' : '#ef4444';
      const resultStr = s.error || JSON.stringify(s.toolResult, null, 2);
      body = '<span style="color:' + color + '">' + icon + '</span><pre>' + resultStr.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
    } else if (s.type === 'text') {
      body = '<span style="color:#a3a3a3">' + (s.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
    }
    return '<div class="trace-step ' + cls + '"><span class="trace-num">' + s.step + '</span><span class="trace-type">' + s.type.replace('_', ' ') + '</span><span class="trace-body">' + body + '</span></div>';
  }).join('');

  return [
    '<div style="display:flex;gap:24px;margin-bottom:12px;">',
    '<div><span class="card-label">Score</span><div style="font-size:1.2rem;color:' + scoreColor(e.score.total) + '">' + e.score.total + '/100</div></div>',
    '<div><span class="card-label">Accuracy</span><div>' + e.score.breakdown.accuracy + '/25</div></div>',
    '<div><span class="card-label">Efficiency</span><div>' + e.score.breakdown.efficiency + '/25</div></div>',
    '<div><span class="card-label">Quality</span><div>' + e.score.breakdown.quality + '/25</div></div>',
    '<div><span class="card-label">Completeness</span><div>' + e.score.breakdown.completeness + '/25</div></div>',
    '<div><span class="card-label">Model</span><div style="font-size:0.8rem">' + e.tokens.model + '</div></div>',
    '<div><span class="card-label">Tokens</span><div>' + e.tokens.totalTokens.toLocaleString() + '</div></div>',
    '<div><span class="card-label">Cost</span><div>$' + e.tokens.estimatedCost.toFixed(4) + '</div></div>',
    '</div>',
    e.prompt ? '<div style="margin-bottom:8px;font-size:0.8rem;color:#525252">Prompt: ' + e.prompt.slice(0, 150) + '</div>' : '',
    e.path.hallucinations.length > 0 ? '<div style="margin-bottom:8px"><span class="badge badge-red">HALLUCINATIONS: ' + e.path.hallucinations.length + '</span></div>' : '',
    '<div style="font-size:0.75rem;color:#525252;margin-bottom:8px">' + e.path.stepCount + ' tool calls, ' + e.path.retryCount + ' retries' + (e.path.usedProposeCircuit ? ', used propose_circuit' : '') + '</div>',
    '<h2 style="margin-top:8px">Execution Trace</h2>',
    traceHtml,
    e.circuit ? '<h2 style="margin-top:12px">Circuit Quality</h2><div style="font-size:0.8rem">' + (e.circuit.issues.length === 0 ? '<span class="green">No issues</span>' : e.circuit.issues.map(i => '<div style="color:#eab308;margin:2px 0">⚠ ' + i + '</div>').join('')) + '</div>' : '',

    // Components placed
    e.circuit && e.circuit.components && e.circuit.components.length > 0 ?
      '<h2 style="margin-top:12px">Components Placed (' + e.circuit.components.length + ')</h2>' +
      '<table style="font-size:0.75rem"><tr><th>Name</th><th>Type</th><th>Position</th><th>Properties</th></tr>' +
      e.circuit.components.map(c =>
        '<tr><td>' + c.name + '</td><td><span class="badge badge-blue">' + c.type + '</span></td>' +
        '<td>row=' + c.y + ' col=' + c.x + '</td>' +
        '<td style="color:#525252">' + (Object.keys(c.properties || {}).length > 0 ? JSON.stringify(c.properties) : '-') + '</td></tr>'
      ).join('') + '</table>' : '',

    // Wires
    e.circuit && e.circuit.wires && e.circuit.wires.length > 0 ?
      '<h2 style="margin-top:12px">Wires (' + e.circuit.wires.length + ')</h2>' +
      '<table style="font-size:0.75rem"><tr><th>From</th><th>To</th><th>Color</th></tr>' +
      e.circuit.wires.map(w =>
        '<tr><td>' + w.fromLabel + '</td><td>' + w.toLabel + '</td>' +
        '<td><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:' + w.color + ';vertical-align:middle;margin-right:4px"></span>' + w.color + '</td></tr>'
      ).join('') + '</table>' : '',

    // Sketch code with compilation status
    e.circuit && e.circuit.sketch ?
      '<h2 style="margin-top:12px">Sketch Code ' +
      (e.circuit.sketchCompiles
        ? '<span class="badge badge-green">compiles</span>'
        : '<span class="badge badge-red">errors</span>') +
      '</h2>' +
      '<pre style="background:#1a1a1a;padding:12px;border-radius:6px;font-size:0.7rem;overflow-x:auto;max-height:300px;color:#a3a3a3">' +
      e.circuit.sketch.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>' : '',

    e.tokens.wasteDetails.length > 0 ? '<h2 style="margin-top:12px">Token Waste</h2><div style="font-size:0.8rem">' + e.tokens.wasteDetails.map(w => '<div style="color:#737373;margin:2px 0">• ' + w + '</div>').join('') + '</div>' : '',
  ].join('');
}

async function loadAllRuns() {
  const res = await fetch(API + '/api/eval/summary');
  const summary = await res.json();
  // Re-read all run evals
  const el = document.getElementById('all-runs');
  el.innerHTML = '<div class="loading">Loading...</div>';

  // Just re-trigger batch and reload
  await fetch(API + '/api/eval/refresh', { method: 'POST' });
  const res2 = await fetch(API + '/api/eval/all');
  const all = await res2.json();

  let rows = all.map(e =>
    '<tr class="run-row" onclick="toggleRun(this,\\'' + e.runId + '\\')"><td style="font-family:monospace;font-size:0.7rem">' + e.runId.slice(0,8) + '</td><td>' + e.agent + '</td><td style="color:' + scoreColor(e.score.total) + '">' + e.score.total + '</td><td>' + e.tokens.model.replace('claude-','').slice(0,10) + '</td><td>' + e.tokens.totalTokens.toLocaleString() + '</td><td>' + e.path.stepCount + '</td><td>' + (e.path.hallucinations.length > 0 ? '<span class="badge badge-red">'+e.path.hallucinations.length+'</span>' : '-') + '</td><td style="color:#525252;font-size:0.7rem">' + (e.prompt||'').slice(0,40) + '</td></tr><tr class="run-detail" id="detail-' + e.runId + '"><td colspan="8"><div class="trace" id="trace-' + e.runId + '">Loading...</div></td></tr>'
  ).join('');

  el.innerHTML = '<table><tr><th>Run</th><th>Agent</th><th>Score</th><th>Model</th><th>Tokens</th><th>Steps</th><th>Halluc.</th><th>Prompt</th></tr>' + rows + '</table>';
}

loadDashboard();
</script>
</body>
</html>`;
}
