// ── Agent Debug Tool ─────────────────────────────────────────────────────
//
// Replaces the original eval dashboard with an interactive agent-flow
// debug tool. Two modes:
//   • Overview    — heat-map of all runs across the flow diagram + aggregate stats
//   • Individual  — single run path overlay + trace / token details
//
// The flow diagram is rendered via mermaid. Node colours are derived from
// RunEval data at runtime — no hardcoded run IDs.

import { AGENT_VERSION } from "../agents/version"

export function generateDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Debug — Dreamer</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--surface:#1e293b;--surface2:#0f172a;
  --border:#334155;--text:#e2e8f0;--muted:#64748b;--dim:#475569;
  --blue:#3b82f6;--green:#22c55e;--amber:#f59e0b;--red:#ef4444;
}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;font-size:13px;display:flex;flex-direction:column;overflow:hidden}

/* header */
#hdr{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--surface2);flex-shrink:0;flex-wrap:wrap}
#hdr h1{font-size:.85rem;font-weight:600;letter-spacing:-.01em}
.vtag{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:.68rem;color:var(--muted);font-family:monospace}
#vsel{background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:3px 8px;font-size:.72rem;min-width:124px}
#vcmp{background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:3px 8px;font-size:.72rem;min-width:124px}
.tabs{display:flex;gap:2px}
.tab{padding:3px 11px;border-radius:5px;cursor:pointer;font-size:.75rem;color:var(--muted);border:1px solid transparent;background:transparent}
.tab:hover{color:var(--text);background:var(--surface)}
.tab.on{background:var(--surface);color:var(--text);border-color:var(--border)}
#rsel{background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:3px 8px;font-size:.75rem;max-width:260px}
.sp{flex:1}
.btn{background:var(--surface);border:1px solid var(--border);color:var(--muted);padding:3px 10px;border-radius:5px;cursor:pointer;font-size:.72rem}
.btn:hover{color:var(--text)}

/* legend */
#leg{display:flex;gap:12px;padding:5px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface2);flex-wrap:wrap}
.li{display:flex;align-items:center;gap:4px;font-size:.67rem;color:var(--muted)}
.ld{width:9px;height:9px;border-radius:2px;flex-shrink:0}

/* layout */
#app{display:flex;flex:1;overflow:hidden}
#diag{flex:1;overflow:hidden;padding:14px;cursor:grab;position:relative;user-select:none}
#diag svg{max-width:none;height:auto}
#dc{transform-origin:0 0;transition:transform .12s ease;display:inline-block}

/* sidebar */
#sb{width:370px;flex-shrink:0;border-left:1px solid var(--border);overflow-y:auto}
#sbi{padding:12px}

/* cards */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:9px}
.cl{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.cv{font-size:1.25rem;font-weight:700;margin-top:2px}
.cs{font-size:.62rem;color:var(--dim);margin-top:1px}

/* section */
.sh{font-size:.67rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 5px;padding-bottom:3px;border-bottom:1px solid var(--border)}

/* run items */
.ri{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:4px;cursor:pointer;border:1px solid transparent}
.ri:hover{background:var(--surface);border-color:var(--border)}
.ri.sel{background:var(--surface);border-color:var(--blue)}
.rid{font-family:monospace;font-size:.67rem;color:var(--muted)}
.rsc{font-weight:600;font-size:.77rem;min-width:26px;text-align:right}
.rpr{font-size:.7rem;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}

/* badges */
.bdg{display:inline-block;padding:1px 5px;border-radius:3px;font-size:.63rem;font-weight:600;vertical-align:middle}
.bg{background:#052e16;color:var(--green)}
.ba{background:#292005;color:var(--amber)}
.br{background:#2a0808;color:var(--red)}
.bb{background:#0a1628;color:var(--blue)}
.bm{background:var(--surface);color:var(--muted)}

/* token bars */
.tbars{display:flex;flex-direction:column;gap:4px;margin-bottom:6px}
.trow{display:flex;align-items:center;gap:5px}
.tlbl{font-size:.65rem;color:var(--muted);min-width:76px}
.twrap{flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden}
.tfill{height:100%;border-radius:2px}
.tval{font-size:.65rem;color:var(--dim);min-width:46px;text-align:right}

/* routing grid */
.rgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px}
.rc{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 7px}
.rk{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.rv{font-size:.75rem;font-weight:500;margin-top:1px}

/* trace */
.trace{display:flex;flex-direction:column;gap:1px}
.ts{display:flex;gap:5px;padding:4px 8px 4px 9px;border-left:2px solid var(--border);font-size:.7rem;line-height:1.4;flex-wrap:wrap}
.ts.call{border-color:#1d4ed8}
.ts.rok{border-color:#15803d}
.ts.rerr{border-color:#b91c1c}
.ts.txt{border-color:var(--dim)}
.tsn{color:var(--dim);min-width:14px;font-family:monospace;font-size:.65rem}
.ttl{color:var(--blue);font-family:monospace;font-size:.65rem}
.tk{display:inline-block;font-size:.58rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:1px 4px;border-radius:3px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);margin-right:5px}
.tsm{width:100%;margin-left:19px;color:var(--muted);font-size:.66rem;line-height:1.35}
.tbd{display:none;width:100%;background:var(--surface2);border-radius:3px;padding:5px 7px;margin-top:2px;font-family:monospace;font-size:.62rem;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:180px;overflow-y:auto}
.tbd.open{display:block}

/* issues */
.irow{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:.7rem;color:var(--muted)}
.icnt{background:var(--surface);border-radius:3px;padding:0 5px;font-size:.63rem;color:var(--amber);font-weight:600;flex-shrink:0}

.loading{color:var(--muted);padding:20px;text-align:center;font-size:.8rem}

/* node tooltip */
#ntip{position:absolute;z-index:200;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:10px 12px;width:270px;max-height:360px;overflow-y:auto;display:none;font-size:.7rem;box-shadow:0 10px 32px rgba(0,0,0,.6);pointer-events:none}
.tip-grid{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-bottom:3px}
.tip-k{font-size:.6rem;color:var(--muted);white-space:nowrap;align-self:center}
.tip-v{font-size:.68rem;font-weight:500;color:var(--text)}
.tip-pill{display:inline-block;background:var(--surface2);border-radius:3px;padding:1px 5px;font-size:.6rem;color:var(--dim);margin:1px 2px 1px 0}
.tip-step{padding:4px 6px;border-radius:3px;background:var(--surface2);margin-top:4px;border-left:2px solid var(--border)}
.tip-ok{border-color:var(--green)}
.tip-err{border-color:var(--red)}
.tip-txt{border-color:var(--dim)}
.tip-tname{font-family:monospace;font-size:.63rem;color:var(--blue)}
.tip-code{font-family:monospace;font-size:.59rem;color:var(--dim);margin-top:3px;word-break:break-all;max-height:70px;overflow-y:auto}
</style>
</head>
<body>

<div id="hdr">
  <h1>Agent Debug</h1>
  <select id="vsel" onchange="onVersionChange()"></select>
  <select id="vcmp" onchange="onCompareChange()"></select>
  <div class="tabs">
    <button class="tab on" id="t-ov" onclick="setMode('overview')">Overview</button>
    <button class="tab"    id="t-in" onclick="setMode('individual')">Individual Run</button>
  </div>
  <div id="rsel-wrap" style="display:none">
    <select id="rsel" onchange="onRun()"><option value="">— select run —</option></select>
  </div>
  <div class="sp"></div>
  <div style="display:flex;align-items:center;gap:4px">
    <button class="btn" onclick="zoomOut()" title="Zoom out">−</button>
    <span id="zlbl" style="font-size:.68rem;color:var(--muted);min-width:34px;text-align:center">100%</span>
    <button class="btn" onclick="zoomIn()" title="Zoom in">+</button>
    <button class="btn" onclick="zoomReset()" title="Reset zoom" style="margin-left:2px">⊡</button>
  </div>
  <button class="btn" onclick="doRefresh()">Refresh</button>
</div>

<div id="leg">
  <span style="font-size:.67rem;color:var(--dim)">Individual:</span>
  <div class="li"><div class="ld" style="background:#1e3a8a;border:1px solid #3b82f6"></div>taken</div>
  <div class="li"><div class="ld" style="background:#78350f;border:1px solid #f59e0b"></div>warn</div>
  <div class="li"><div class="ld" style="background:#7f1d1d;border:1px solid #ef4444"></div>fail</div>
  <div class="li"><div class="ld" style="background:#14532d;border:1px solid #22c55e"></div>ok</div>
  <div class="li"><div class="ld" style="background:#0b3b4a;border:1px solid #22d3ee"></div>new vs compare version</div>
  <span style="font-size:.67rem;color:var(--dim);margin-left:6px">Overview:</span>
  <div class="li"><div class="ld" style="background:#166534;border:1px solid #22c55e"></div>80–100%</div>
  <div class="li"><div class="ld" style="background:#1d4ed8;border:1px solid #3b82f6"></div>40–80%</div>
  <div class="li"><div class="ld" style="background:#292524;border:1px solid #57534e"></div>&lt;20%</div>
  <div class="li"><div class="ld" style="background:#1e293b;border:1px dashed #334155"></div>not taken</div>
</div>

<div id="app">
  <div id="diag"><div id="dc"><div class="loading">Initialising…</div></div><div id="ntip"></div></div>
  <div id="sb"><div id="sbi"><div class="loading">Loading…</div></div></div>
</div>

<script>
// ── Injected from backend ──────────────────────────────────────────────────
var CURRENT_VER = '${AGENT_VERSION}';

// ── State ─────────────────────────────────────────────────────────────────
var mode = 'overview';
var allEvals = [];
var summary  = null;
var selRunId = null;
var selEval  = null;
var diagSeq  = 0;
var selectedDiagramVersion = resolveDiagramVersion(CURRENT_VER);
var compareFromVersion = null;

// ── Pan + Zoom ─────────────────────────────────────────────────────────────
// Uses translate+scale on #dc so pan works in all directions at any zoom level.
// scrollLeft/scrollTop can't reach content outside the layout box after CSS scale.
var zoomLevel = 1.0;
var panX = 0, panY = 0;
var ZOOM_STEP = 0.2;

function applyTransform(){
  var dc = document.getElementById('dc');
  dc.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+zoomLevel.toFixed(2)+')';
  document.getElementById('zlbl').textContent = Math.round(zoomLevel*100)+'%';
}

function zoomToward(nextZoom, originX, originY){
  // originX/Y are in diag-panel coordinates (pixels from top-left of #diag)
  var ratio = nextZoom / zoomLevel;
  panX = originX - ratio * (originX - panX);
  panY = originY - ratio * (originY - panY);
  zoomLevel = nextZoom;
  applyTransform();
}

function zoomIn(){  zoomToward(zoomLevel + ZOOM_STEP, panX, panY); }
function zoomOut(){ zoomToward(Math.max(0.05, zoomLevel - ZOOM_STEP), panX, panY); }
function zoomReset(){ zoomLevel = 1.0; panX = 0; panY = 0; applyTransform(); }

// Ctrl/Cmd + scroll → zoom toward cursor
document.getElementById('diag').addEventListener('wheel', function(ev){
  if(!ev.ctrlKey && !ev.metaKey) return;
  ev.preventDefault();
  var rect = this.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  var my = ev.clientY - rect.top;
  var next = ev.deltaY < 0 ? zoomLevel + ZOOM_STEP : Math.max(0.05, zoomLevel - ZOOM_STEP);
  zoomToward(next, mx, my);
}, { passive: false });

// Pinch-to-zoom (2-finger gesture)
(function(){
  var diag = document.getElementById('diag');
  var pinchStartDist = 0;
  var pinchStartZoom = 1;

  function dist(touches){
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  diag.addEventListener('touchstart', function(ev){
    if(ev.touches.length === 2){
      ev.preventDefault();
      pinchStartDist = dist(ev.touches);
      pinchStartZoom = zoomLevel;
    }
  }, { passive: false });

  diag.addEventListener('touchmove', function(ev){
    if(ev.touches.length === 2){
      ev.preventDefault();
      var d = dist(ev.touches);
      if(pinchStartDist === 0) return;
      var rect = diag.getBoundingClientRect();
      var cx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2 - rect.left;
      var cy = (ev.touches[0].clientY + ev.touches[1].clientY) / 2 - rect.top;
      var next = Math.max(0.05, pinchStartZoom * (d / pinchStartDist));
      zoomToward(next, cx, cy);
    }
  }, { passive: false });

  diag.addEventListener('touchend', function(ev){
    if(ev.touches.length < 2) pinchStartDist = 0;
  });
})();

// Click-and-drag pan (all directions)
// No preventDefault on mousedown — that suppresses click events on SVG child nodes.
// Use a movement threshold (4px) so a static click never triggers panning.
(function(){
  var diag = document.getElementById('diag');
  var armed = false, moved = false;
  var startX = 0, startY = 0;
  var startPanX = 0, startPanY = 0;
  var THRESH = 4;

  diag.addEventListener('mousedown', function(ev){
    if(ev.button !== 0) return;
    armed = true; moved = false;
    startX = ev.clientX; startY = ev.clientY;
    startPanX = panX; startPanY = panY;
  });

  window.addEventListener('mousemove', function(ev){
    if(!armed) return;
    var dx = ev.clientX - startX;
    var dy = ev.clientY - startY;
    if(!moved && Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
    moved = true;
    diag.style.cursor = 'grabbing';
    panX = startPanX + dx;
    panY = startPanY + dy;
    applyTransform();
  });

  window.addEventListener('mouseup', function(){
    if(!armed) return;
    armed = false;
    diag.style.cursor = 'grab';
  });
})();

// ── Utils ──────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n){ return Number(n||0).toLocaleString(); }
function fmtCost(n){ return '$'+Number(n||0).toFixed(4); }
function scoreColor(s){ return s>=75?'#22c55e':s>=50?'#f59e0b':'#ef4444'; }
function runTimestampMs(e){
  var ts = Date.parse(e.runCompletedAt || e.runCreatedAt || e.evaluatedAt || '');
  return isNaN(ts) ? 0 : ts;
}
function parseSemver(v){
  var m = String(v || '').match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
  if(!m) return [0,0,0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function versionAtLeast(v, target){
  var a=parseSemver(v), b=parseSemver(target);
  for(var i=0;i<3;i++){
    if(a[i]>b[i]) return true;
    if(a[i]<b[i]) return false;
  }
  return true;
}
function resolveDiagramVersion(rawVersion){
  var v = String(rawVersion || '').trim();
  if (v === '1.0.0' || v === '1.0.1' || v === '1.0.2' || v === '1.0.3' || v === '1.0.4' || v === '1.0.5' || v === '1.0.6' || v === '1.0.7' || v === '1.0.8' || v === '1.1.0' || v === '1.1.1' || v === '1.2.0' || v === '1.2.1') return v;
  // Default to the latest known diagram, but preserve 1.0.0 if current is old.
  return versionAtLeast(CURRENT_VER, '1.2.1') ? '1.2.1' : versionAtLeast(CURRENT_VER, '1.2.0') ? '1.2.0' : versionAtLeast(CURRENT_VER, '1.1.1') ? '1.1.1' : versionAtLeast(CURRENT_VER, '1.1.0') ? '1.1.0' : versionAtLeast(CURRENT_VER, '1.0.8') ? '1.0.8' : versionAtLeast(CURRENT_VER, '1.0.7') ? '1.0.7' : versionAtLeast(CURRENT_VER, '1.0.6') ? '1.0.6' : versionAtLeast(CURRENT_VER, '1.0.5') ? '1.0.5' : versionAtLeast(CURRENT_VER, '1.0.4') ? '1.0.4' : versionAtLeast(CURRENT_VER, '1.0.3') ? '1.0.3' : versionAtLeast(CURRENT_VER, '1.0.2') ? '1.0.2' : versionAtLeast(CURRENT_VER, '1.0.1') ? '1.0.1' : '1.0.0';
}
function previousDiagramVersion(v){
  var resolved = resolveDiagramVersion(v);
  if (resolved === '1.2.1') return '1.2.0';
  if (resolved === '1.2.0') return '1.1.1';
  if (resolved === '1.1.1') return '1.1.0';
  if (resolved === '1.1.0') return '1.0.8';
  if (resolved === '1.0.8') return '1.0.7';
  if (resolved === '1.0.7') return '1.0.6';
  if (resolved === '1.0.6') return '1.0.5';
  if (resolved === '1.0.5') return '1.0.4';
  if (resolved === '1.0.4') return '1.0.3';
  if (resolved === '1.0.3') return '1.0.2';
  if (resolved === '1.0.2') return '1.0.1';
  if (resolved === '1.0.1') return '1.0.0';
  return null;
}
function introducedNodesForVersion(v){
  var resolved = resolveDiagramVersion(v);
  if (resolved === '1.0.1') return ['SNAP'];
  if (resolved === '1.0.2') return ['PCV'];
  if (resolved === '1.1.0') return ['TMB', 'TMA', 'TME'];
  if (resolved === '1.1.1') return ['WPF'];
  if (resolved === '1.2.0') return ['WPF']; // WPF label changed (max 3 → 5 attempts + schema validation)
  return [];
}
function changedNodesBetween(fromV, toV){
  var from = resolveDiagramVersion(fromV || baselineDiagramVersion());
  var to = resolveDiagramVersion(toV || CURRENT_VER);
  if (!versionAtLeast(to, from)) return [];
  var known = ['1.0.1','1.0.2','1.0.3','1.0.4','1.0.5','1.0.6','1.0.7','1.0.8','1.1.0','1.1.1','1.2.0','1.2.1'];
  var out = [];
  known.forEach(function(v){
    if (versionAtLeast(v, from) && versionAtLeast(to, v) && v !== from) {
      out = out.concat(introducedNodesForVersion(v));
    }
  });
  return Array.from(new Set(out));
}
function baselineDiagramVersion(){
  return '1.0.0';
}
function compareSemverDesc(a, b){
  var aa=parseSemver(a), bb=parseSemver(b);
  for(var i=0;i<3;i++){
    if(aa[i]!==bb[i]) return bb[i]-aa[i];
  }
  return 0;
}
function effectiveRunVersion(e){
  var raw = String((e && e.agentVersion) || '').trim();
  // Historic runs may miss agentVersion; keep them in the baseline bucket.
  if (!raw || raw === 'unknown' || raw === 'null') return baselineDiagramVersion();
  return resolveDiagramVersion(raw);
}
function versionBuckets(evals){
  var bucket={};
  (evals||[]).forEach(function(e){
    var v=effectiveRunVersion(e);
    bucket[v]=(bucket[v]||0)+1;
  });
  return bucket;
}
function latestVersionFromRuns(evals){
  var versions=Object.keys(versionBuckets(evals));
  if(versions.indexOf(resolveDiagramVersion(CURRENT_VER))<0){
    versions.push(resolveDiagramVersion(CURRENT_VER));
  }
  versions.sort(compareSemverDesc);
  return versions[0] || resolveDiagramVersion(CURRENT_VER);
}
function allKnownVersions(evals){
  var versions=Object.keys(versionBuckets(evals||[]));
  var known=['1.0.0','1.0.1','1.0.2','1.0.3','1.0.4','1.0.5','1.0.6','1.0.7','1.0.8','1.1.0','1.1.1','1.2.0','1.2.1'];
  known.forEach(function(v){ if(versions.indexOf(v)<0) versions.push(v); });
  var currentResolved=resolveDiagramVersion(CURRENT_VER);
  if(versions.indexOf(currentResolved)<0) versions.push(currentResolved);
  versions.sort(compareSemverDesc);
  return versions;
}
function filteredEvals(){
  return allEvals.filter(function(e){ return effectiveRunVersion(e)===selectedDiagramVersion; });
}
function toolInventoryForVersion(v){
  var set={};
  allEvals.forEach(function(e){
    if(effectiveRunVersion(e)!==resolveDiagramVersion(v)) return;
    var tools=e&&e.routing&&e.routing.availableTools;
    if(Array.isArray(tools)){
      tools.forEach(function(t){ set[t]=true; });
    }
  });
  return Object.keys(set).sort();
}
function runDurationMs(e){
  if (typeof e.runDurationMs === 'number') return Math.max(0, e.runDurationMs);
  var start = Date.parse(e.runCreatedAt || '');
  var end = Date.parse(e.runCompletedAt || '');
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, end - start);
}
function fmtDuration(ms){
  var n = Number(ms || 0);
  if (!isFinite(n) || n <= 0) return '0s';
  var totalSec = Math.floor(n / 1000);
  var mins = Math.floor(totalSec / 60);
  var secs = totalSec % 60;
  if (mins > 0) return mins + 'm ' + secs + 's';
  return secs + 's';
}
function shortModel(m){
  if(!m) return '?';
  if(m.indexOf('opus')>=0)   return 'Opus';
  if(m.indexOf('sonnet')>=0) return 'Sonnet';
  if(m.indexOf('haiku')>=0)  return 'Haiku';
  return m.slice(0,8);
}

// ── Mermaid ────────────────────────────────────────────────────────────────
mermaid.initialize({
  startOnLoad: false, theme: 'base', securityLevel: 'loose',
  flowchart: { curve:'basis', padding:14, nodeSpacing:36, rankSpacing:44 },
  themeVariables:{
    background:'#0f1117', primaryColor:'#1e293b', primaryTextColor:'#e2e8f0',
    primaryBorderColor:'#334155', lineColor:'#475569',
    edgeLabelBackground:'#0f172a', fontFamily:'system-ui,sans-serif', fontSize:'11px'
  }
});

// ── Flowchart builder ──────────────────────────────────────────────────────
function buildFlowchart(nc, agg, diagramVersion, fromVersion) {
  var resolvedDiagramVersion = resolveDiagramVersion(diagramVersion);
  var isV101 = versionAtLeast(resolvedDiagramVersion, '1.0.1');
  var isV102 = versionAtLeast(resolvedDiagramVersion, '1.0.2');
  var isV110 = versionAtLeast(resolvedDiagramVersion, '1.1.0');
  var changedNodes = changedNodesBetween(fromVersion || previousDiagramVersion(resolvedDiagramVersion), resolvedDiagramVersion);
  function c(id){ return nc[id] ? ':::'+nc[id] : ':::ghost'; }
  var L = [
    '%%{init:{"theme":"base","themeVariables":{"background":"#0f1117","primaryColor":"#1e293b","primaryTextColor":"#e2e8f0","primaryBorderColor":"#334155","lineColor":"#475569","edgeLabelBackground":"#0f172a","fontFamily":"system-ui","fontSize":"11px"}}}%%',
    'flowchart TD',

    '%% ── ENTRY ──────────────────────────────────────────────────────────',
    '  START(["User sends message"])'+c('START'),
    '  START --> HIST["Load prior runs + thread history"]'+c('HIST'),
    '  HIST --> SUMM{{"Thread summary cache?"}}'+c('SUMM'),
    '  SUMM -- "cache hit" --> MERGE',
    '  SUMM -- "cache miss" --> HLIVE["Live summarizer · Haiku"]'+c('HLIVE'),
    '  HLIVE --> MERGE["Merge context window"]'+c('MERGE'),
    '  MERGE --> ROUTER["Router: domain · requestType · complexity · model · toolMode"]'+c('ROUTER'),

    '%% ── DOMAIN ─────────────────────────────────────────────────────────',
    '  ROUTER --> DOM{{"Domain?"}}'+c('DOM'),
    '  DOM -- "breadboard ops" --> DB["breadboard"]'+c('DB'),
    '  DOM -- "graph ops" --> DG["graph"]'+c('DG'),
    '  DOM -- "board + graph ops" --> DM["mixed"]'+c('DM'),
    '  DOM -- "unclear" --> DA["ambiguous"]'+c('DA'),

    '%% ── REQUEST TYPE ───────────────────────────────────────────────────',
    '  DB & DG & DM & DA --> RT{{"Request type?"}}'+c('RT'),
    '  RT -- "debug / error" --> RTD["debug"]'+c('RTD'),
    '  RT -- "add / insert" --> RTA["additive"]'+c('RTA'),
    '  RT -- "change / fix" --> RTS["surgical"]'+c('RTS'),
    '  RT -- "redesign" --> RTR["rebuild"]'+c('RTR'),
    '  RT -- "what / how" --> RTQ["question"]'+c('RTQ'),
    '  RTD & RTR --> CX["complex"]'+c('CX'),
    '  RTQ --> CS["simple"]'+c('CS'),
    '  RTA & RTS --> CXC{{"complexity?"}}'+c('CXC'),
    '  CXC -- "≥3 components · 200+ chars · recent failures" --> CX',
    '  CXC -- "simple signals" --> CS',

    '%% ── MODEL SELECTION ────────────────────────────────────────────────',
    '  CX --> MS["Sonnet · complex / debug / rebuild"]'+c('MS'),
    '  CS --> MSC{{"force escalate?"}}'+c('MSC'),
    '  MSC -- "mixed domain · recent failures" --> MS',
    '  MSC -- "no" --> MH["Haiku · simple / question"]'+c('MH'),

    '%% ── TOOL MODE ───────────────────────────────────────────────────────',
    '  MS & MH --> MSG["Build model messages · sized to model context"]'+c('MSG'),
    '  MSG --> TMC{{"toolMode?"}}'+c('TMC'),
    '  TMC -- "empty board" --> TMB["build · propose_circuit + sketch + delegation"]'+c('TMB'),
    '  TMC -- "rebuild" --> TMA["all · full board CRUD + delegation"]'+c('TMA'),
    '  TMC -- "populated board" --> TME["edit · granular CRUD + delegation"]'+c('TME'),

    '%% ── PLANNING ────────────────────────────────────────────────────────',
    '  TMB & TMA & TME --> PL["generatePlan (async · isDestructive · estimatedToolCalls)"]'+c('PL'),
    '  PL --> CA["Core Agent · max 10 steps · Sonnet or Haiku"]'+c('CA'),

    '%% ── CORE TOOL LOOP ──────────────────────────────────────────────────',
    '  CA --> SL{{"Step loop"}}'+c('SL'),
    '  SL -- "read state" --> RD["get_board_overview · list_components · list_wires\\nget_sketch_code · analyze_power_budget · get_wiring_guide"]'+c('RD'),
    '  RD --> SL',
    '  SL -- "board write" --> WBB["place_component · connect_wire · wire_component_to_pin\\nmove / update / remove component · update_wire · remove_wire"]'+c('WBB'),
    '  WBB --> SL',
    '  SL -- "sketch write" --> WSK["update_sketch / patch_sketch"]'+c('WSK'),
    '  WSK --> SVX{{"sketch validates?"}}'+c('SVX'),
    '  SVX -- "yes" --> SL',
    '  SVX -- "fail attempt 1 · attemptsRemaining=1" --> SL',
    '  SVX -- "fail attempt 2 · abandon" --> SS["Sketch abandoned · explain failure to user"]'+c('SS'),
    '  SL -- "build mode only" --> WPC["propose_circuit · auto-place + auto-wire all components"]'+c('WPC'),
    '  WPC --> SL',

    '%% ── DELEGATION ──────────────────────────────────────────────────────',
    '  SL -- "delegate" --> DEL{{"which specialist?"}}'+c('DEL'),
    '  DEL -- "wiring" --> CIRC["Circuit Agent · Sonnet · max 8 steps · 30s timeout"]'+c('CIRC'),
    '  DEL -- "logic graph" --> GRPH["Graph Agent · Haiku · max 8 steps · 30s timeout"]'+c('GRPH'),
    '  CIRC --> DRET{{"result?"}}'+c('DRET'),
    '  GRPH --> DRET',
    '  DRET -- "success · return ops" --> SL',
    '  DRET -- "transient error · retry (max 2, exponential backoff)" --> DEL',
    '  DRET -- "hard fail / timeout · return partial + error" --> SL',

    '%% ── STEP LIMIT ──────────────────────────────────────────────────────',
    '  SL -- "steps = limit (10)" --> ST["Max steps hit · no further tool calls"]'+c('ST'),

    '%% ── REFLECTION + GUARDRAILS ─────────────────────────────────────────',
    '  ST --> POST',
    '  SS --> POST',
    '  SL -- "done" --> POST["collectResult()"]'+c('POST'),
    '  POST --> REF{{"Reflection · confidence?"}}'+c('REF'),
    '  REF -- "< 0.5 · budget remaining" --> REP["Suggest re-entry · re-enter loop (costs 1 step)"]'+c('REP'),
    '  REP --> PCK',
    '  REF -- "≥ 0.5 or budget exhausted" --> PCK{{"Policy engine · power budget + routing violations"}}'+c('PCK'),
    '  PCK -- "violations found" --> PBL["Discard proposedOps · return blocked text"]'+c('PBL'),
    '  PCK -- "pass" --> SUC["Apply ops · completeRun · background thread summary · stream result"]'+c('SUC'),

    '%% ── OUTCOMES ────────────────────────────────────────────────────────',
    '  PBL --> FPOL["FAIL: policy blocked"]'+c('FPOL'),
    '  SS --> FSKETCH["FAIL: sketch abandoned (2 attempts)"]'+c('FSKETCH'),
    '  SUC --> DONE(["Done · ops applied + token usage streamed"])'+c('DONE'),
  ];
  // v1.0.1+: explicit snapshot-profile resolution node in routing path.
  if (isV101) {
    var domIdx = L.findIndex(function(line){ return line.indexOf('ROUTER --> DOM{{"Domain?"}}') >= 0; });
    if (domIdx >= 0) {
      L.splice(
        domIdx,
        1,
        '  ROUTER --> SNAP["Resolve snapshot profile\\n(new in v1.0.1)"]'+c('SNAP'),
        '  SNAP --> DOM{{"Domain?"}}'+c('DOM'),
      );
    }
  }
  if (isV102) {
    var wpcEdgeIdx = L.findIndex(function(line){ return line === '  WPC --> SL'; });
    if (wpcEdgeIdx >= 0) {
      L.splice(
        wpcEdgeIdx,
        1,
        '  WPC --> PCV{{"Electrical gate\\n(new in v1.0.2)"}}'+c('PCV'),
        '  PCV -- "pass" --> SL',
        '  PCV -- "error · repair and retry" --> SL',
      );
    }
  }
  if (isV110) {
    // v1.1.0: Remove delegation section — specialists removed, core handles everything
    var delLines = ['DEL', 'CIRC', 'GRPH', 'DRET'];
    L = L.filter(function(line) {
      for (var i = 0; i < delLines.length; i++) {
        if (line.indexOf(delLines[i]) >= 0) return false;
      }
      return true;
    });
    // Update tool mode labels — remove "delegation" references
    L = L.map(function(line) {
      if (line.indexOf('TMB[') >= 0) return line.replace('build · propose_circuit + sketch + delegation', 'build · propose_circuit + sketch');
      if (line.indexOf('TMA[') >= 0) return line.replace('all · full board CRUD + delegation', 'all · full board CRUD');
      if (line.indexOf('TME[') >= 0) return line.replace('edit · granular CRUD + delegation', 'edit · granular CRUD');
      return line;
    });
  }
  var isV111 = versionAtLeast(resolvedDiagramVersion, '1.1.1');
  if (isV111) {
    // v1.1.1: Add propose_fix node in the edit-mode tool loop
    var wbbIdx = L.findIndex(function(line){ return line.indexOf('WBB') >= 0 && line.indexOf('-->') >= 0 && line.indexOf('SL') >= 0; });
    if (wbbIdx >= 0) {
      L.splice(
        wbbIdx + 1,
        0,
        '  SL -- "edit mode batch" --> WPF["propose_fix · atomic batch edit\\n(add/remove/move + wires + sketch · max 3 attempts)\\n(new in v1.1.1)"]'+c('WPF'),
        '  WPF --> SL',
      );
    }
    // Update edit tool mode label to mention propose_fix
    L = L.map(function(line) {
      if (line.indexOf('TME[') >= 0 && line.indexOf('granular CRUD') >= 0) {
        return line.replace('edit · granular CRUD', 'edit · propose_fix + granular CRUD');
      }
      return line;
    });
  }
  var isV120 = versionAtLeast(resolvedDiagramVersion, '1.2.0');
  if (isV120) {
    // v1.2.0: raise propose_fix attempt budget 3 → 5, schema failures now count + surface errors
    L = L.map(function(line) {
      if (line.indexOf('WPF[') >= 0) {
        return line
          .replace('max 3 attempts', 'max 5 attempts')
          .replace('(new in v1.1.1)', '(schema + electrical validation · v1.2.0)');
      }
      return line;
    });
  }
  if(!agg){
    L=L.concat([
      '  classDef actual fill:#1e3a8a,stroke:#3b82f6,color:#bfdbfe,font-weight:600',
      '  classDef warn   fill:#78350f,stroke:#f59e0b,color:#fef3c7,font-weight:600',
      '  classDef fail   fill:#7f1d1d,stroke:#ef4444,color:#fecaca,font-weight:600',
      '  classDef ok     fill:#14532d,stroke:#22c55e,color:#bbf7d0,font-weight:600',
      '  classDef delta  fill:#0b3b4a,stroke:#22d3ee,color:#a5f3fc,font-weight:700',
      '  classDef ghost  fill:#1e293b,stroke:#334155,color:#475569,stroke-dasharray:3 3',
    ]);
  } else {
    L=L.concat([
      '  classDef freq4  fill:#166534,stroke:#22c55e,color:#bbf7d0',
      '  classDef freq3  fill:#15803d,stroke:#4ade80,color:#d1fae5',
      '  classDef freq2  fill:#1d4ed8,stroke:#3b82f6,color:#bfdbfe',
      '  classDef freq1  fill:#1e3a8a,stroke:#60a5fa,color:#dbeafe',
      '  classDef freq0  fill:#292524,stroke:#57534e,color:#a8a29e',
      '  classDef delta  fill:#0b3b4a,stroke:#22d3ee,color:#a5f3fc,font-weight:700',
      '  classDef ghost  fill:#1e293b,stroke:#334155,color:#475569,stroke-dasharray:3 3',
    ]);
  }
  if (changedNodes.length) {
    L.push('  class ' + changedNodes.join(',') + ' delta');
  }
  return L.join('\\n');
}

// ── Node classes from a single RunEval ────────────────────────────────────
var READ_T  = ['get_board_overview','list_components','list_wires','get_component_details','get_sketch_code','get_board_state','analyze_power_budget','get_wiring_guide'];
var WRITE_BB= ['place_component','update_component','move_component','remove_component','connect_wire','wire_component_to_pin','remove_wire','update_wire','apply_design'];
var ADD_BB  = ['place_component','connect_wire','wire_component_to_pin','apply_design'];
var WRITE_SK= ['update_sketch','patch_sketch'];

function nodeClasses(e){
  var nc={};
  var r=e.routing; var p=e.path||{};
  var diagramVersion = resolveDiagramVersion((e&&e.agentVersion) || CURRENT_VER);
  var trace=(p.trace)||[];
  var calls=trace.filter(function(s){return s.type==='tool_call';}).map(function(s){return s.toolName;});

  var hasRead  = calls.some(function(t){return READ_T.indexOf(t)>=0;});
  var hasWBB   = calls.some(function(t){return WRITE_BB.indexOf(t)>=0;});
  var hasAddBB = calls.some(function(t){return ADD_BB.indexOf(t)>=0;});
  var hasWSK   = calls.some(function(t){return WRITE_SK.indexOf(t)>=0;});
  var hasProp  = calls.indexOf('propose_circuit')>=0;
  var delegs   = (p.delegations)||[];
  var hasCirc  = delegs.some(function(d){return d==='circuit'||d.indexOf('circuit')>=0;});
  var hasGraph = delegs.some(function(d){return d==='graph'||d.indexOf('graph')>=0;});
  var hitMax   = p.stepCount >= p.stepLimit;
  var onlyRem  = hasWBB && !hasAddBB;
  var lowScore = e.score && e.score.total < 50;
  var goodScore= e.score && e.score.total >= 75;
  var cxIssues = e.circuit && e.circuit.issues && e.circuit.issues.length > 0;
  var badOut   = onlyRem || hitMax || cxIssues || lowScore;

  // Always-traversed infrastructure nodes
  ['START','HIST','SUMM','MERGE','POST','PCK','REF'].forEach(function(id){nc[id]='actual';});
  if(e.status==='completed') nc['DONE']='ok';

  if(!r){
    if(e.status==='completed') nc['SUC']=goodScore?'ok':badOut?'warn':'actual';
    else nc['FSKETCH']='fail';
    return nc;
  }

  ['ROUTER','DOM','RT','MSG','TMC','CA','PL','SL'].forEach(function(id){nc[id]='actual';});
  if (versionAtLeast(diagramVersion, '1.0.1')) nc['SNAP']='actual';

  var domMap={breadboard:'DB',graph:'DG',mixed:'DM',ambiguous:'DA'};
  if(domMap[r.domain]) nc[domMap[r.domain]]='actual';

  var rtMap={debug:'RTD',additive:'RTA',surgical:'RTS',rebuild:'RTR',question:'RTQ'};
  if(rtMap[r.requestType]) nc[rtMap[r.requestType]]='actual';

  if(r.complexity==='complex') nc['CX']='actual'; else nc['CS']='actual';
  if(r.requestType==='additive'||r.requestType==='surgical') nc['CXC']='actual';

  var isHaiku=r.model&&r.model.indexOf('haiku')>=0;
  nc[isHaiku?'MH':'MS']='actual';
  if(isHaiku) nc['MSC']='actual';

  var modeMap={build:'TMB',edit:'TME',all:'TMA',circuit:'TME'};
  if(modeMap[r.toolMode]) nc[modeMap[r.toolMode]]='actual';

  if(hasRead)  nc['RD']='actual';
  if(hasWBB)   nc['WBB']=onlyRem?'warn':'actual';
  if(hasWSK)   {nc['WSK']='actual'; nc['SVX']='actual';}
  if(hasProp)  {
    nc['WPC']='actual';
    if (versionAtLeast(diagramVersion, '1.0.2')) {
      nc['PCV'] = (e.electrical && e.electrical.errors > 0) ? 'warn' : 'actual';
    }
  }

  if(hasCirc||hasGraph) { nc['DEL']='actual'; nc['DRET']='actual'; }
  if(hasCirc) nc['CIRC']=cxIssues?'warn':'actual';
  if(hasGraph) nc['GRPH']='actual';

  if(hitMax) nc['ST']='warn';

  if(e.status==='completed') nc['SUC']=goodScore?'ok':badOut?'warn':'actual';
  else nc['FSKETCH']='fail';

  return nc;
}

// ── Aggregate frequency ────────────────────────────────────────────────────
function aggClasses(evals){
  var counts={}; var total=evals.length||1;
  evals.forEach(function(e){
    var nc=nodeClasses(e);
    Object.keys(nc).forEach(function(id){
      if(nc[id]!=='ghost') counts[id]=(counts[id]||0)+1;
    });
  });
  var res={_counts:counts,_total:total};
  Object.keys(counts).forEach(function(id){
    var p=counts[id]/total;
    res[id]=p>=.8?'freq4':p>=.6?'freq3':p>=.4?'freq2':p>=.2?'freq1':'freq0';
  });
  return res;
}

// ── Interactive diagram helpers ────────────────────────────────────────────

var NODE_LABELS = {
  START:'User sends message', HIST:'Load thread history', SUMM:'Thread summary cache',
  HLIVE:'Live summarizer · Haiku', MERGE:'Merge context window', ROUTER:'Router decision',
  SNAP:'Resolve snapshot profile',
  DOM:'Domain classification', DB:'breadboard', DG:'graph', DM:'mixed', DA:'ambiguous',
  RT:'Request type', RTD:'debug', RTA:'additive', RTS:'surgical', RTR:'rebuild', RTQ:'question',
  CX:'complex', CS:'simple', CXC:'Complexity check', MSC:'Force escalate?',
  MS:'Sonnet', MH:'Haiku', MSG:'Build model messages', TMC:'Tool mode selection',
  TMB:'build mode', TMA:'all mode', TME:'edit mode',
  PL:'generatePlan', CA:'Core Agent',
  SL:'Step loop', RD:'Read tools', WBB:'Board write tools', WSK:'Sketch write',
  WPC:'propose_circuit', PCV:'Electrical gate', SVX:'Sketch validates?', SS:'Sketch abandoned',
  DEL:'Delegate to specialist', CIRC:'Circuit Agent', GRPH:'Graph Agent', DRET:'Delegation result',
  ST:'Max steps hit', POST:'collectResult', REF:'Reflection check', REP:'Suggest re-entry',
  PCK:'Policy engine', PBL:'Ops discarded', SUC:'Apply + complete', DONE:'Done',
  FPOL:'FAIL: policy blocked', FSKETCH:'FAIL: sketch abandoned',
};

// Build a map of nodeId → relevant trace steps (+ synthetic routing/score entries)
function buildTraceMap(e) {
  var trace = (e.path && e.path.trace) || [];
  var diagramVersion = resolveDiagramVersion((e&&e.agentVersion) || CURRENT_VER);
  var map = {};
  function add(id, s) { if (!map[id]) map[id]=[]; map[id].push(s); }

  // Routing pseudo-step for all routing nodes
  var r = e.routing;
  if (r) {
    var rs = {type:'routing', routing:r};
    ['ROUTER','DOM','RT','MSG','TMC'].forEach(function(id){ add(id,rs); });
    if (versionAtLeast(diagramVersion, '1.0.1')) add('SNAP', rs);
    var dm={breadboard:'DB',graph:'DG',mixed:'DM',ambiguous:'DA'};
    if (dm[r.domain]) add(dm[r.domain],rs);
    var rm={debug:'RTD',additive:'RTA',surgical:'RTS',rebuild:'RTR',question:'RTQ'};
    if (rm[r.requestType]) add(rm[r.requestType],rs);
    if (r.requestType==='additive'||r.requestType==='surgical') add('CXC',rs);
    add(r.complexity==='complex'?'CX':'CS', rs);
    var ih=r.model&&r.model.indexOf('haiku')>=0;
    if (ih) add('MSC',rs);
    add(ih?'MH':'MS', rs);
    var mm={build:'TMB',edit:'TME',all:'TMA',circuit:'TME'};
    if (mm[r.toolMode]) add(mm[r.toolMode],rs);
  }

  // Tool call steps
  trace.forEach(function(s) {
    if (s.type==='tool_call') {
      var t = s.toolName||'';
      if (READ_T.indexOf(t)>=0) add('RD',s);
      else if (WRITE_BB.indexOf(t)>=0) add('WBB',s);
      else if (WRITE_SK.indexOf(t)>=0) { add('WSK',s); add('SVX',s); }
      else if (t==='propose_circuit') { add('WPC',s); if (versionAtLeast(diagramVersion, '1.0.2')) add('PCV', s); }
      else if (t.toLowerCase().indexOf('graph')>=0) { add('DEL',s); add('GRPH',s); add('DRET',s); }
      else if (t.toLowerCase().indexOf('circuit')>=0||t.toLowerCase().indexOf('delegate')>=0) { add('DEL',s); add('CIRC',s); add('DRET',s); }
    } else if (s.type==='text') {
      add('CA',s);
    }
  });

  // Score/intent pseudo-step for outcome nodes
  if (e.score||e.intent) {
    var ss2 = {type:'score', score:e.score, intent:e.intent, status:e.status};
    ['POST','REF','PCK','SUC','DONE'].forEach(function(id){ add(id,ss2); });
  }
  if (e.electrical&&e.electrical.issues&&e.electrical.issues.length) {
    add('PCK',{type:'electrical', issues:e.electrical.issues});
    if (versionAtLeast(diagramVersion, '1.0.2')) add('PCV',{type:'electrical', issues:e.electrical.issues});
  }

  return map;
}

// Compute sequential visit order for each active node
function computeNodeOrder(e, nc) {
  var order = {};
  var n = 0;
  var diagramVersion = resolveDiagramVersion((e&&e.agentVersion) || CURRENT_VER);
  function mark(id) {
    if (nc[id]&&nc[id]!=='ghost'&&order[id]==null) order[id]=++n;
  }
  ['START','HIST','SUMM','MERGE'].forEach(mark);
  var r = e.routing;
  ['ROUTER'].forEach(mark);
  if (versionAtLeast(diagramVersion, '1.0.1')) mark('SNAP');
  ['DOM'].forEach(mark);
  if (r) {
    var dm={breadboard:'DB',graph:'DG',mixed:'DM',ambiguous:'DA'};
    if (dm[r.domain]) mark(dm[r.domain]);
    mark('RT');
    var rm={debug:'RTD',additive:'RTA',surgical:'RTS',rebuild:'RTR',question:'RTQ'};
    if (rm[r.requestType]) mark(rm[r.requestType]);
    if (r.requestType==='additive'||r.requestType==='surgical') mark('CXC');
    mark(r.complexity==='complex'?'CX':'CS');
    var ih=r.model&&r.model.indexOf('haiku')>=0;
    if (ih) mark('MSC');
    mark(ih?'MH':'MS');
  }
  ['MSG','TMC'].forEach(mark);
  if (r) { var mm={build:'TMB',edit:'TME',all:'TMA',circuit:'TME'}; if(mm[r.toolMode]) mark(mm[r.toolMode]); }
  ['PL','CA','SL'].forEach(mark);
  // Tool loop — in trace order so numbers reflect actual execution sequence
  var trace = (e.path&&e.path.trace)||[];
  trace.forEach(function(s) {
    if (s.type!=='tool_call') return;
    var t=s.toolName||'';
    if (READ_T.indexOf(t)>=0) mark('RD');
    else if (WRITE_BB.indexOf(t)>=0) mark('WBB');
    else if (WRITE_SK.indexOf(t)>=0) { mark('WSK'); mark('SVX'); }
    else if (t==='propose_circuit') { mark('WPC'); if (versionAtLeast(diagramVersion, '1.0.2')) mark('PCV'); }
    else if (t.toLowerCase().indexOf('graph')>=0) { mark('DEL'); mark('GRPH'); mark('DRET'); }
    else if (t.toLowerCase().indexOf('circuit')>=0||t.toLowerCase().indexOf('delegate')>=0) { mark('DEL'); mark('CIRC'); mark('DRET'); }
  });
  ['ST','SS','POST','REF','REP','PCK','PBL','SUC','DONE','FPOL','FSKETCH'].forEach(mark);
  return order;
}

// Show tooltip near a clicked SVG node group
function showNodeTip(nodeId, e, traceMap, svgGroup) {
  var tip = document.getElementById('ntip');
  var html = [];

  html.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'+
    '<div style="font-weight:600;font-size:.75rem;color:var(--text)">'+esc(NODE_LABELS[nodeId]||nodeId)+'</div>'+
    '<span style="font-family:monospace;font-size:.58rem;color:var(--dim)">'+nodeId+'</span>'+
  '</div>');

  var steps = traceMap[nodeId]||[];
  steps.forEach(function(s) {
    if (s.type==='routing') {
      var r=s.routing;
      html.push('<div class="tip-grid">');
      [['domain',r.domain],['requestType',r.requestType],['complexity',r.complexity],
       ['model',shortModel(r.model)],['toolMode',r.toolMode],
       ['boardComps',r.signals&&r.signals.boardComponentCount],
       ['promptLen',r.signals&&r.signals.promptLength]
      ].forEach(function(kv){ if(kv[1]!=null) html.push('<div class="tip-k">'+kv[0]+'</div><div class="tip-v">'+esc(String(kv[1]))+'</div>'); });
      html.push('</div>');
      if (r.reasons&&r.reasons.length) {
        html.push('<div style="margin-top:4px">');
        r.reasons.forEach(function(x){ html.push('<span class="tip-pill">'+esc(x)+'</span>'); });
        html.push('</div>');
      }
    } else if (s.type==='tool_call') {
      var ok=s.succeeded!==false;
      html.push('<div class="tip-step '+(ok?'tip-ok':'tip-err')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center">'+
          '<span class="tip-tname">'+esc(s.toolName||'')+'</span>'+
          '<span style="font-size:.58rem;color:var(--dim)">step '+s.step+'</span>'+
        '</div>');
      if (s.error) html.push('<div style="color:var(--red);font-size:.62rem;margin-top:2px">'+esc(s.error)+'</div>');
      if (s.toolInput&&Object.keys(s.toolInput).length) {
        var inp=JSON.stringify(s.toolInput);
        html.push('<div class="tip-code">'+esc(inp.length>240?inp.slice(0,240)+'\u2026':inp)+'</div>');
      }
      html.push('</div>');
    } else if (s.type==='text') {
      html.push('<div class="tip-step tip-txt">'+
        '<span style="font-size:.58rem;color:var(--dim)">text · step '+s.step+'</span>');
      if (s.text) html.push('<div style="margin-top:2px;color:var(--muted);font-size:.64rem">'+esc((s.text||'').trim().slice(0,140))+(s.text.length>140?'\u2026':'')+'</div>');
      html.push('</div>');
    } else if (s.type==='score') {
      if (s.score) {
        var sc=s.score;
        html.push('<div class="tip-grid">');
        [['total',sc.total],['accuracy',sc.breakdown.accuracy],['efficiency',sc.breakdown.efficiency],
         ['quality',sc.breakdown.quality],['completeness',sc.breakdown.completeness]].forEach(function(kv){
          html.push('<div class="tip-k">'+kv[0]+'</div><div class="tip-v" style="color:'+scoreColor(kv[1])+'">'+kv[1]+'</div>');
        });
        html.push('</div>');
      }
      if (s.intent) {
        html.push('<div class="tip-grid" style="margin-top:4px">');
        html.push('<div class="tip-k">intentSatisfied</div><div class="tip-v" style="color:'+(s.intent.intentSatisfied?'var(--green)':'var(--red)')+'">'+String(s.intent.intentSatisfied)+'</div>');
        if (s.intent.repeatedToolFailureLoops) html.push('<div class="tip-k">retryLoops</div><div class="tip-v" style="color:var(--amber)">'+s.intent.repeatedToolFailureLoops+'</div>');
        if (s.intent.partialSuccessWithoutIntent) html.push('<div class="tip-k">partialSuccess</div><div class="tip-v" style="color:var(--amber)">true</div>');
        html.push('</div>');
      }
    } else if (s.type==='electrical') {
      html.push('<div style="margin-top:4px">');
      s.issues.slice(0,4).forEach(function(iss){ html.push('<span class="tip-pill" style="color:var(--red)">'+esc(iss)+'</span>'); });
      html.push('</div>');
    }
  });

  if (!steps.length) html.push('<div style="color:var(--dim);font-size:.65rem">No trace data for this node</div>');

  tip.innerHTML = html.join('');
  tip.style.display = 'block';
  tip.style.transform = 'translateY(-100%) translateY(-8px)';

  // Position using actual rendered rect (accounts for zoom/pan transform)
  var gRect = svgGroup.getBoundingClientRect();
  var diagRect = document.getElementById('diag').getBoundingClientRect();
  var lx = gRect.left - diagRect.left + gRect.width / 2;
  var ly = gRect.top  - diagRect.top;
  tip.style.left = Math.max(4, Math.min(lx - 135, diagRect.width - 278)) + 'px';
  tip.style.top  = ly + 'px';
}

function hideNodeTip() { document.getElementById('ntip').style.display = 'none'; }

// Overlay step-number badges and click handlers on the rendered SVG
function decorateDiag(nc, evalData) {
  hideNodeTip();
  var svg = document.querySelector('#dc svg');
  if (!svg || !evalData) return;

  var traceMap = buildTraceMap(evalData);
  var order    = computeNodeOrder(evalData, nc);

  // Mermaid v11 uses the render-call ID as prefix: "d1-START-0", "d2-ROUTER-1", etc.
  // Older versions used "flowchart-START-0". We find the first dash-separated segment
  // that is all-uppercase and present in nc — works for any prefix.
  function nodeIdFromSvgId(svgId) {
    if (!svgId) return null;
    var parts = svgId.split('-');
    for (var i = 0; i < parts.length; i++) {
      if (/^[A-Z][A-Z0-9]*$/.test(parts[i]) && nc[parts[i]]) return parts[i];
    }
    return null;
  }

  // Use broadest selector: any <g> with an id attribute (nodes, edges, clusters)
  // then filter by whether the id resolves to one of our known nodes.
  svg.querySelectorAll('g[id]').forEach(function(g) {
    var nodeId = nodeIdFromSvgId(g.id);
    if (!nodeId || nc[nodeId]==='ghost') return;

    // Click → tooltip
    g.style.cursor = 'pointer';
    g.addEventListener('click', function(ev) {
      ev.stopPropagation();
      showNodeTip(nodeId, evalData, traceMap, g);
    });

    // Step-number badge
    var stepNum = order[nodeId];
    if (stepNum == null) return;
    var shape = g.querySelector('rect,circle,ellipse,polygon,path');
    if (!shape) return;
    var bbox; try { bbox = shape.getBBox(); } catch(err) { return; }

    var cls = nc[nodeId];
    var fill   = cls==='ok'?'#166534':cls==='warn'?'#78350f':cls==='fail'?'#7f1d1d':'#1e3a8a';
    var stroke = cls==='ok'?'#22c55e':cls==='warn'?'#f59e0b':cls==='fail'?'#ef4444':'#3b82f6';

    var badge = document.createElementNS('http://www.w3.org/2000/svg','g');
    badge.setAttribute('class','nd-badge');
    badge.style.pointerEvents = 'none';

    var cx = bbox.x + bbox.width - 1, cy = bbox.y + 1;
    var circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circ.setAttribute('cx',cx); circ.setAttribute('cy',cy); circ.setAttribute('r','9');
    circ.setAttribute('fill',fill); circ.setAttribute('stroke',stroke); circ.setAttribute('stroke-width','1.5');

    var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('x',cx); txt.setAttribute('y',cy+3.5);
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('fill','#fff'); txt.setAttribute('font-size','8');
    txt.setAttribute('font-weight','700'); txt.setAttribute('font-family','system-ui,sans-serif');
    txt.textContent = String(stepNum);

    badge.appendChild(circ); badge.appendChild(txt);
    g.appendChild(badge);
  });
}

// Dismiss tooltip when clicking diagram background
document.getElementById('diag').addEventListener('click', hideNodeTip);

// ── Render diagram ─────────────────────────────────────────────────────────
async function renderDiag(nc, agg, evalData){
  var diagramVersion = agg
    ? resolveDiagramVersion(selectedDiagramVersion || CURRENT_VER)
    : resolveDiagramVersion((evalData && evalData.agentVersion) || CURRENT_VER);
  var fromVersion = agg
    ? (compareFromVersion || previousDiagramVersion(diagramVersion))
    : (compareFromVersion || previousDiagramVersion(diagramVersion));
  var src=buildFlowchart(nc,agg,diagramVersion,fromVersion);
  var id='d'+(++diagSeq);
  try{
    var r=await mermaid.render(id,src);
    document.getElementById('dc').innerHTML=r.svg;
    if(!agg && evalData) decorateDiag(nc, evalData);
  }catch(err){
    document.getElementById('dc').innerHTML='<pre style="color:#ef4444;font-size:.7rem;padding:12px">'+esc(String(err))+'</pre>';
  }
}

// ── Mode switch ────────────────────────────────────────────────────────────
function setMode(m){
  mode=m;
  document.getElementById('t-ov').classList.toggle('on',m==='overview');
  document.getElementById('t-in').classList.toggle('on',m==='individual');
  document.getElementById('rsel-wrap').style.display=m==='individual'?'block':'none';
  if(m==='overview') showOverview();
  else if(selRunId) showRun(selRunId);
  else document.getElementById('sbi').innerHTML='<div class="loading">Select a run above</div>';
}

function onRun(){
  var id=document.getElementById('rsel').value;
  if(id){selRunId=id; setMode('individual');}
}
function populateVersionSelector(){
  var sel=document.getElementById('vsel');
  var buckets=versionBuckets(allEvals);
  var versions=allKnownVersions(allEvals);
  if(versions.indexOf(selectedDiagramVersion)<0){
    selectedDiagramVersion=versions[0]||resolveDiagramVersion(CURRENT_VER);
  }
  sel.innerHTML='';
  versions.forEach(function(v){
    var o=document.createElement('option');
    o.value=v;
    o.textContent='v'+v+' ('+(buckets[v]||0)+')';
    if(v===selectedDiagramVersion) o.selected=true;
    sel.appendChild(o);
  });
}
function populateCompareSelector(){
  var sel=document.getElementById('vcmp');
  var versions=allKnownVersions(allEvals)
    .filter(function(v){ return versionAtLeast(selectedDiagramVersion, v) && v !== selectedDiagramVersion; });
  if (!versions.length) {
    sel.innerHTML='<option value="">vs none</option>';
    compareFromVersion=null;
    return;
  }
  if(!compareFromVersion || versions.indexOf(compareFromVersion)<0){
    compareFromVersion=versions[versions.length-1] || versions[0] || null;
  }
  sel.innerHTML='';
  versions.forEach(function(v){
    var o=document.createElement('option');
    o.value=v;
    o.textContent='vs v'+v;
    if(v===compareFromVersion) o.selected=true;
    sel.appendChild(o);
  });
}
function onVersionChange(){
  var sel=document.getElementById('vsel');
  selectedDiagramVersion=resolveDiagramVersion(sel.value||selectedDiagramVersion);
  populateCompareSelector();
  selEval=null;
  var active=filteredEvals();
  if(active.every(function(e){ return e.runId!==selRunId; })){
    selRunId=null;
  }
  populateRunSelector();
  if(mode==='overview') showOverview();
  else if(selRunId) showRun(selRunId);
  else document.getElementById('sbi').innerHTML='<div class="loading">Select a run above</div>';
}
function onCompareChange(){
  var sel=document.getElementById('vcmp');
  compareFromVersion=sel.value?resolveDiagramVersion(sel.value):null;
  if(mode==='overview') showOverview();
  else if(selRunId) showRun(selRunId);
  else document.getElementById('sbi').innerHTML='<div class="loading">Select a run above</div>';
}
function populateRunSelector(){
  var sel=document.getElementById('rsel');
  sel.innerHTML='<option value="">— select run —</option>';
  filteredEvals()
    .slice()
    .sort(function(a,b){ return runTimestampMs(b)-runTimestampMs(a); })
    .forEach(function(e){
      var o=document.createElement('option');
      o.value=e.runId;
      var sc=e.score?e.score.total:'?';
      o.textContent=e.runId.slice(0,8)+'  ['+sc+']  '+fmtDuration(runDurationMs(e))+'  '+(e.prompt||'').slice(0,22);
      if(e.runId===selRunId) o.selected=true;
      sel.appendChild(o);
    });
}

// ── Overview ───────────────────────────────────────────────────────────────
async function showOverview(){
  if(!allEvals.length) await loadAll();
  var active=filteredEvals();
  var nc=aggClasses(active);
  await renderDiag(nc,true,null);
  renderOverSidebar(nc, active);
}

function statCard(lbl,val,sub,col){
  return '<div class="card"><div class="cl">'+lbl+'</div><div class="cv" style="color:'+(col||'var(--text)')+'">'+val+'</div>'+(sub?'<div class="cs">'+sub+'</div>':'')+'</div>';
}

function renderOverSidebar(nc, activeEvals){
  var s=summary;
  var runs=activeEvals||[];
  var html=[];

  if(runs.length===0){
    document.getElementById('sbi').innerHTML='<div class="loading">No runs for v'+esc(selectedDiagramVersion)+'</div>';
    return;
  }

  if(compareFromVersion){
    html.push('<div style="font-size:.68rem;color:var(--dim);margin-bottom:8px">Comparing diagram <b style="color:var(--text)">v'+esc(selectedDiagramVersion)+'</b> against <b style="color:var(--text)">v'+esc(compareFromVersion)+'</b>.</div>');
    var targetTools = toolInventoryForVersion(selectedDiagramVersion);
    var baseTools = toolInventoryForVersion(compareFromVersion);
    var baseSet = {};
    var targetSet = {};
    baseTools.forEach(function(t){ baseSet[t]=true; });
    targetTools.forEach(function(t){ targetSet[t]=true; });
    var addedTools = targetTools.filter(function(t){ return !baseSet[t]; });
    var removedTools = baseTools.filter(function(t){ return !targetSet[t]; });
    html.push('<div class="sh">Tool Delta</div>');
    html.push('<div style="font-size:.67rem;color:var(--muted);margin-bottom:6px">Current: '+targetTools.length+' tools · Baseline: '+baseTools.length+' tools</div>');
    if(addedTools.length===0 && removedTools.length===0){
      html.push('<div class="irow"><span>No tool-surface change detected between these versions.</span></div>');
    } else {
      addedTools.slice(0,10).forEach(function(t){
        html.push('<div class="irow"><span style="color:#22c55e">+ '+esc(t)+'</span></div>');
      });
      removedTools.slice(0,10).forEach(function(t){
        html.push('<div class="irow"><span style="color:#ef4444">- '+esc(t)+'</span></div>');
      });
      if(addedTools.length>10 || removedTools.length>10){
        html.push('<div style="font-size:.64rem;color:var(--dim);margin-top:4px">Showing first 10 changes per side.</div>');
      }
    }
  }

  var sameAsAll = runs.length === allEvals.length;
  if(!sameAsAll){
    var scored = runs.filter(function(e){ return !!(e.score && typeof e.score.total==='number'); });
    var avgScore = scored.length
      ? Math.round(scored.reduce(function(acc,e){ return acc+e.score.total; },0)/scored.length)
      : 0;
    var avgTokens = runs.length
      ? Math.round(runs.reduce(function(acc,e){ return acc+((e.tokens&&e.tokens.totalTokens)||0); },0)/runs.length)
      : 0;
    var avgDuration = runs.length
      ? Math.round(runs.reduce(function(acc,e){ return acc+runDurationMs(e); },0)/runs.length)
      : 0;
    html.push('<div class="cards">'+
      statCard('Runs',runs.length,'version '+selectedDiagramVersion)+
      statCard('Avg Score',avgScore+'/100','',scoreColor(avgScore))+
      statCard('Avg Tokens',fmt(avgTokens),'filtered runs')+
      statCard('Avg Run Time',fmtDuration(avgDuration),'')+
    '</div>');
  }

  if(s && sameAsAll){
    html.push('<div class="cards">'+
      statCard('Runs',s.totalRuns,'')+
      statCard('Avg Score',s.avgScore+'/100','',scoreColor(s.avgScore))+
      statCard('Avg Tokens',fmt(s.avgTokensPerRun),'top-level runs')+
      statCard('Error Rate',(s.avgToolErrorRate*100).toFixed(0)+'%','',s.avgToolErrorRate>.1?'#ef4444':'#22c55e')+
      statCard('Halluc. Rate',s.hallucinationRate+'%','',s.hallucinationRate>10?'#ef4444':'#22c55e')+
      statCard('Total Cost',fmtCost(s.categories.topLevel.totalCost+s.categories.template.totalCost),'')+
    '</div>');

    // Category breakdown
    html.push('<div class="sh">By Category</div>');
    [['Top-level',s.categories.topLevel],['Template',s.categories.template],['Delegated',s.categories.delegated],['Specialist',s.categories.specialist]].forEach(function(p){
      var lbl=p[0]; var a=p[1];
      html.push('<div class="ri">'+
        '<span style="min-width:68px;font-size:.72rem">'+lbl+'</span>'+
        '<span class="rsc" style="color:'+scoreColor(a.avgScore)+'">'+a.avgScore+'</span>'+
        '<span style="color:var(--muted);font-size:.65rem;min-width:40px">'+a.runs+' runs</span>'+
        '<span style="color:var(--dim);font-size:.63rem">'+fmt(a.avgTokensPerRun)+'tk</span>'+
      '</div>');
    });

    // Model breakdown
    html.push('<div class="sh">By Model</div>');
    Object.keys(s.byModel).forEach(function(m){
      var md=s.byModel[m];
      html.push('<div class="ri">'+
        '<span style="min-width:68px;font-size:.72rem">'+esc(shortModel(m))+'</span>'+
        '<span class="rsc" style="color:'+scoreColor(md.avgScore)+'">'+md.avgScore+'</span>'+
        '<span style="color:var(--muted);font-size:.65rem;min-width:40px">'+md.runs+' runs</span>'+
        '<span style="color:var(--dim);font-size:.63rem">'+fmtCost(md.totalCost)+'</span>'+
      '</div>');
    });
  }

  // Node frequency
  if(nc._counts){
    var freqs=Object.keys(nc._counts).map(function(id){return{id:id,ct:nc._counts[id],p:Math.round(nc._counts[id]/nc._total*100)};});
    freqs.sort(function(a,b){return b.ct-a.ct;});
    html.push('<div class="sh">Node Traversal Frequency</div><div class="tbars">');
    freqs.slice(0,14).forEach(function(f){
      html.push('<div class="trow"><span class="tlbl">'+esc(f.id)+'</span>'+
        '<div class="twrap"><div class="tfill" style="width:'+f.p+'%;background:#3b82f6"></div></div>'+
        '<span class="tval">'+f.p+'%</span></div>');
    });
    html.push('</div>');
  }

  // Top issues
  if(s && sameAsAll && s.topIssues && s.topIssues.length){
    html.push('<div class="sh">Top Issues</div>');
    s.topIssues.slice(0,8).forEach(function(i){
      html.push('<div class="irow"><span>'+esc(i.issue)+'</span><span class="icnt">'+i.count+'</span></div>');
    });
  }

  // Worst runs
  if(s && sameAsAll && s.worstRuns && s.worstRuns.length){
    html.push('<div class="sh">Worst Runs</div>');
    s.worstRuns.forEach(function(r){
      html.push('<div class="ri" data-id="'+r.runId+'" onclick="goRun(this.dataset.id)">'+
        '<div class="rdot" style="background:#ef4444"></div>'+
        '<span class="rid">'+r.runId.slice(0,8)+'</span>'+
        '<span class="rsc" style="color:'+scoreColor(r.score)+'">'+r.score+'</span>'+
        '<span class="rpr">'+esc((r.issue||'').slice(0,48))+'</span>'+
      '</div>');
    });
  }

  // All runs
  html.push('<div class="sh">All Runs v'+esc(selectedDiagramVersion)+' ('+runs.length+')</div>');
  var sorted=runs.slice().sort(function(a,b){
    return runTimestampMs(b)-runTimestampMs(a);
  });
  sorted.forEach(function(e){
    var sc=e.score?e.score.total:null;
    var dot=e.status==='completed'?(sc>=75?'#22c55e':sc>=50?'#f59e0b':'#ef4444'):'#ef4444';
    html.push('<div class="ri" id="ri-'+e.runId+'" data-id="'+e.runId+'" onclick="goRun(this.dataset.id)">'+
      '<div class="rdot" style="background:'+dot+'"></div>'+
      '<span class="rid">'+e.runId.slice(0,8)+'</span>'+
      '<span class="rsc" style="color:'+(sc!==null?scoreColor(sc):'var(--dim)')+'">'+  (sc!==null?sc:'n/a')+'</span>'+
      '<span class="rpr">'+esc((e.prompt||'').slice(0,24))+'</span>'+
      '<span style="color:var(--dim);font-size:.63rem;min-width:38px;text-align:right">'+esc(fmtDuration(runDurationMs(e)))+'</span>'+
    '</div>');
  });

  document.getElementById('sbi').innerHTML=html.join('');
}

// ── Individual run ─────────────────────────────────────────────────────────
async function showRun(runId){
  selRunId=runId;
  document.getElementById('sbi').innerHTML='<div class="loading">Loading run…</div>';
  document.querySelectorAll('.ri').forEach(function(el){el.classList.toggle('sel',el.id==='ri-'+runId);});

  var e=(selEval&&selEval.runId===runId)?selEval:null;
  if(!e){
    try{
      var res=await fetch('/api/eval/run/'+runId);
      if(res.ok){e=await res.json(); selEval=e;}
    }catch(err){}
  }
  if(!e){
    document.getElementById('sbi').innerHTML='<div class="loading" style="color:#ef4444">Failed to load</div>';
    return;
  }
  await renderDiag(nodeClasses(e),false,e);
  renderRunSidebar(e);
}

function tokenRow(lbl,val,max,col){
  var pct=Math.max(0,Math.min(100,Math.round((val/max)*100)));
  return '<div class="trow"><span class="tlbl">'+lbl+'</span>'+
    '<div class="twrap"><div class="tfill" style="width:'+pct+'%;background:'+col+'"></div></div>'+
    '<span class="tval">'+fmt(Math.max(0,val))+'</span></div>';
}
function rcell(k,v){return '<div class="rc"><div class="rk">'+esc(k)+'</div><div class="rv">'+esc(v)+'</div></div>';}
function clippedText(value, max){
  var text = String(value || '');
  return text.length > max ? text.slice(0, max) + '…' : text;
}
function summarizeToolCall(step){
  var input = step.toolInput || {};
  if (step.toolName === 'propose_circuit') {
    var compCount = Array.isArray(input.components) ? input.components.length : 0;
    var wireCount = Array.isArray(input.wires) ? input.wires.length : 0;
    var hasSketch = typeof input.sketch === 'string' && input.sketch.trim().length > 0;
    return 'Requested circuit proposal (' + compCount + ' components, ' + wireCount + ' wires, sketch: ' + (hasSketch ? 'yes' : 'no') + ').';
  }
  var keys = Object.keys(input);
  return keys.length ? 'Args: ' + keys.slice(0, 5).join(', ') + (keys.length > 5 ? '…' : '') + '.' : 'No arguments.';
}
function summarizeToolResult(step){
  var result = step.toolResult || {};
  if (result && typeof result.error === 'string') {
    return 'Tool error: ' + clippedText(result.error, 180);
  }
  if (step.toolName === 'propose_circuit') {
    var comps = typeof result.componentsPlaced === 'number' ? result.componentsPlaced : 0;
    var wires = typeof result.wiresCreated === 'number' ? result.wiresCreated : 0;
    var sketchUpdated = result.sketchUpdated === true ? 'yes' : 'no';
    return 'Proposal applied (' + comps + ' components placed, ' + wires + ' wires created, sketch updated: ' + sketchUpdated + ').';
  }
  var keys = Object.keys(result);
  return keys.length ? 'Result keys: ' + keys.slice(0, 6).join(', ') + (keys.length > 6 ? '…' : '') + '.' : 'No structured output.';
}
function summarizeTraceStep(step){
  if (step.type === 'tool_call') return summarizeToolCall(step);
  if (step.type === 'tool_result') return summarizeToolResult(step);
  return 'Assistant response: ' + clippedText(step.text || '', 180);
}
function estimateToolTokenBreakdown(e){
  var trace=(e.path&&e.path.trace)||[];
  var byTool={};
  var nonToolBytes=0;

  trace.forEach(function(s){
    if(s.type==='tool_call'){
      var tool=s.toolName||'unknown';
      if(!byTool[tool]) byTool[tool]={tool:tool,calls:0,bytes:0};
      byTool[tool].calls += 1;
      var rawIn = s.toolInput ? JSON.stringify(s.toolInput) : '';
      byTool[tool].bytes += Math.min(60000, rawIn.length) + 220;
    } else if(s.type==='tool_result'){
      var rtool=s.toolName||'unknown';
      if(!byTool[rtool]) byTool[rtool]={tool:rtool,calls:0,bytes:0};
      var rawOut = '';
      if (s.toolResult) rawOut = JSON.stringify(s.toolResult);
      else if (s.error) rawOut = String(s.error);
      byTool[rtool].bytes += Math.min(60000, rawOut.length) + 140;
    } else if(s.type==='text'){
      nonToolBytes += (s.text||'').length + 120;
    }
  });

  var rows=Object.keys(byTool).map(function(k){ return byTool[k]; });
  var toolBytes=rows.reduce(function(acc,r){ return acc+r.bytes; },0);
  var totalBytes=Math.max(1, toolBytes + nonToolBytes);
  var parentTokens=Math.max(0, (e.tokens&&e.tokens.totalTokens||0) - (e.tokens&&e.tokens.childTokens||0) - (e.tokens&&e.tokens.overheadTokens||0));

  rows.forEach(function(r){
    r.tokens = Math.round(parentTokens * (r.bytes / totalBytes));
  });
  rows.sort(function(a,b){ return b.tokens-a.tokens; });

  var attributed=rows.reduce(function(acc,r){ return acc+r.tokens; },0);
  var unattributed=Math.max(0, parentTokens-attributed);

  return {
    source: 'estimate',
    rows: rows,
    parentTokens: parentTokens,
    unattributed: unattributed,
  };
}
function getToolTokenBreakdown(e){
  var explicit = e.tokens && e.tokens.toolBreakdown;
  if(explicit && Array.isArray(explicit.rows) && explicit.rows.length){
    return {
      source: explicit.source || 'workflow',
      attribution: explicit.attribution,
      rows: explicit.rows,
      parentTokens: explicit.parentTokens || 0,
      unattributed: explicit.unattributed || 0,
    };
  }
  return estimateToolTokenBreakdown(e);
}
function toolSuccessRate(e){
  var total=(e.tools&&e.tools.totalCalls)||0;
  var errors=(e.tools&&e.tools.errors)||0;
  if(total<=0) return 'n/a';
  var ok=Math.max(0,total-errors);
  return Math.round((ok/total)*100)+'% ('+ok+'/'+total+')';
}
function electricalStatus(e){
  if(!e.electrical) return {label:'n/a', color:'var(--muted)', detail:'No electrical eval'};
  var err=e.electrical.errors||0;
  var warn=e.electrical.warnings||0;
  if(err>0) return {label:'Fail', color:'#ef4444', detail:err+' error'+(err===1?'':'s')+', '+warn+' warning'+(warn===1?'':'s')};
  if(warn>0) return {label:'Warn', color:'#f59e0b', detail:warn+' warning'+(warn===1?'':'s')};
  return {label:'Pass', color:'#22c55e', detail:'No electrical issues'};
}
function wiringStatus(e){
  if(!e.circuit) return {label:'n/a', color:'var(--muted)', detail:'No circuit eval'};
  var floating=e.circuit.floatingComponents||0;
  var shorts=e.circuit.busShorts||0;
  var missing=e.circuit.missingResistors||0;
  var total=floating+shorts+missing;
  if(total===0) return {label:'Pass', color:'#22c55e', detail:'No wiring faults detected'};
  return {label:'Issues', color:'#ef4444', detail:'floating:'+floating+' · shorts:'+shorts+' · missing R:'+missing};
}
function outputSummary(e){
  if(e.circuit) return (e.circuit.componentsPlaced||0)+' components · '+(e.circuit.wiresCreated||0)+' wires';
  if(e.graph) return (e.graph.nodesPlaced||0)+' nodes · '+(e.graph.edgesCreated||0)+' edges';
  return ((e.path&&e.path.stepCount)||0)+' tool steps';
}

function renderRunSidebar(e){
  var p=e.path; var t=e.tokens; var r=e.routing; var sc=e.score;
  var diagramVersion = resolveDiagramVersion(e.agentVersion || CURRENT_VER);
  var hitMax=p.stepCount>=p.stepLimit;
  var verMismatch=e.agentVersion&&e.agentVersion!=='unknown'&&e.agentVersion!==CURRENT_VER;
  var html=[];

  // Header row
  var sBadge=e.status==='completed'?'<span class="bdg bg">completed</span>':'<span class="bdg br">failed</span>';
  var vBadge='<span class="bdg '+(verMismatch?'ba':'bm')+'" title="Agent version when run was created">v'+esc(e.agentVersion||'?')+(verMismatch?' \u26a0':'')+' </span>';
  var dBadge='<span class="bdg bb" title="Diagram snapshot used for rendering">diagram v'+esc(diagramVersion)+'</span>';
  var cBadge = compareFromVersion ? '<span class="bdg bm" title="Comparison baseline">vs v'+esc(compareFromVersion)+'</span>' : '';
  html.push('<div style="display:flex;align-items:center;gap:5px;margin-bottom:9px;flex-wrap:wrap">'+sBadge+' '+vBadge+' '+dBadge+' '+cBadge+'<span style="font-family:monospace;font-size:.63rem;color:var(--dim)">'+esc(e.runId)+'</span></div>');

  // Prompt
  if(e.prompt) html.push('<div style="font-size:.77rem;color:var(--muted);margin-bottom:9px;padding:7px;background:var(--surface);border-radius:4px;border:1px solid var(--border)">'+esc(e.prompt)+'</div>');

  // Version mismatch warning
  if(verMismatch) html.push('<div style="padding:5px 8px;background:#292005;border:1px solid #f59e0b;border-radius:4px;font-size:.7rem;color:#f59e0b;margin-bottom:9px">Run produced by agent v'+esc(e.agentVersion)+' — current is v'+esc(CURRENT_VER)+'. Diagram layout may differ.</div>');

  // Score cards
  var intentOk = !!(e.intent&&e.intent.intentSatisfied);
  var elec = electricalStatus(e);
  var wire = wiringStatus(e);
  html.push('<div class="cards">'+
    statCard('Outcome',intentOk?'Intent met':'Intent missed','',intentOk?'#22c55e':'#ef4444')+
    statCard('Electrical',elec.label,elec.detail,elec.color)+
    statCard('Wiring',wire.label,wire.detail,wire.color)+
    statCard('Tool Reliability',toolSuccessRate(e),(e.tools&&e.tools.totalCalls?('errors: '+(e.tools.errors||0)):'No tool calls'))+
    statCard('Produced',outputSummary(e),'')+
    statCard('Run Time',fmtDuration(runDurationMs(e)),'')+
    statCard('Steps',p.stepCount+'/'+p.stepLimit,hitMax?'Reached step limit':'',hitMax?'#f59e0b':'var(--text)')+
    statCard('Score (legacy)',sc?(sc.total+'/100'):'n/a','kept for continuity',sc?scoreColor(sc.total):'var(--muted)')+
  '</div>');
  if(!sc){
    html.push('<div style="font-size:.75rem;color:var(--muted);margin-bottom:9px">'+esc(e.notEvaluableReason||'Not evaluable')+'</div>');
  }

  // Routing
  html.push('<div class="sh">Routing</div>');
  if(r){
    html.push('<div class="rgrid">'+
      rcell('Domain',r.domain)+rcell('Request',r.requestType)+
      rcell('Complexity',r.complexity)+rcell('Model',shortModel(r.model))+
      rcell('Tool Mode',r.toolMode)+rcell('Board Comps',r.signals.boardComponentCount)+
    '</div>');
    if(r.reasons&&r.reasons.length){
      html.push('<div style="font-size:.65rem;color:var(--dim);margin-bottom:8px">'+r.reasons.map(function(x){return '\u2022 '+esc(x);}).join('  ')+'</div>');
    }
  } else {
    html.push('<span style="font-size:.75rem;color:var(--muted)">Not routed (template/specialist)</span>');
  }

  // Tokens
  html.push('<div class="sh">Tokens</div><div class="tbars">');
  var mx=t.totalTokens||1;
  var cache=Math.max(0,t.totalTokens-t.inputTokens-t.outputTokens-t.childTokens-t.overheadTokens);
  html.push(tokenRow('Input',t.inputTokens,mx,'#3b82f6'));
  html.push(tokenRow('Output',t.outputTokens,mx,'#22c55e'));
  html.push(tokenRow('Cache reads',cache,mx,'#8b5cf6'));
  html.push(tokenRow('Children',t.childTokens,mx,'#f59e0b'));
  html.push(tokenRow('Overhead',t.overheadTokens,mx,'#6b7280'));
  html.push('</div><div style="display:flex;gap:10px;margin-top:4px;font-size:.68rem;color:var(--muted)">'+
    '<span>Total: <b style="color:var(--text)">'+fmt(t.totalTokens)+'</b></span>'+
    '<span>Model: <b style="color:var(--text)">'+esc(shortModel(t.model))+'</b></span>'+
    '<span>Cost: <b style="color:var(--text)">'+fmtCost(t.estimatedCost)+'</b></span>'+
  '</div>');

  // Token attribution by tool (prefer recorded workflow; fallback to estimate)
  var tb=getToolTokenBreakdown(e);
  var tbTitle = tb.source==='workflow' ? 'Token Breakdown By Tool (Workflow)' : 'Token Breakdown By Tool (Estimated)';
  html.push('<div class="sh">'+tbTitle+'</div>');
  if(tb.rows.length){
    var mxTool=Math.max(1, tb.rows[0].tokens);
    html.push('<div class="tbars">');
    tb.rows.slice(0,8).forEach(function(rw){
      html.push(tokenRow(rw.tool+' ×'+rw.calls, rw.tokens, mxTool, '#60a5fa'));
    });
    html.push('</div>');
    var methodNote = tb.source==='workflow'
      ? 'Recorded from step usage ('+esc(tb.attribution||'step_usage_allocation')+').'
      : 'Estimated from trace payload sizes.';
    var unattribLine = tb.unattributed > 0 ? ' · Unattributed: '+fmt(tb.unattributed) : '';
    html.push('<div style="font-size:.66rem;color:var(--dim)">Parent tokens: '+fmt(tb.parentTokens)+unattribLine+' · '+methodNote+'</div>');
  } else {
    html.push('<div style="font-size:.7rem;color:var(--muted)">No tool calls in this run.</div>');
  }

  // Delegations
  if(p.delegations&&p.delegations.length){
    html.push('<div class="sh">Delegation</div><div style="margin-bottom:7px">'+
      p.delegations.map(function(d){return '<span class="bdg bb">'+esc(d)+'</span> ';}).join('')+
    '</div>');
  }

  // Hallucinations
  if(p.hallucinations&&p.hallucinations.length){
    html.push('<div style="margin-bottom:7px"><span class="bdg br">HALLUCINATIONS: '+p.hallucinations.length+'</span></div>');
  }

  // Issues
  var issues=[];
  if(e.circuit&&e.circuit.issues) issues=issues.concat(e.circuit.issues);
  if(e.graph&&e.graph.issues) issues=issues.concat(e.graph.issues);
  if(e.electrical&&e.electrical.issues) issues=issues.concat(e.electrical.issues);
  if(t.wasteDetails&&t.wasteDetails.length) issues=issues.concat(t.wasteDetails.map(function(w){return 'waste: '+w;}));
  if(issues.length){
    html.push('<div class="sh">Issues</div>');
    issues.forEach(function(i){html.push('<div class="irow"><span>'+esc(i)+'</span></div>');});
  }

  // Sketch
  if(e.circuit&&e.circuit.sketch){
    html.push('<div class="sh">Sketch '+(e.circuit.sketchCompiles?'<span class="bdg bg">compiles</span>':'<span class="bdg br">errors</span>')+'</div>'+
      '<pre style="background:var(--surface2);padding:7px;border-radius:4px;font-size:.62rem;color:var(--muted);overflow-x:auto;max-height:160px;white-space:pre-wrap">'+
      esc((e.circuit.sketch||'').slice(0,2000))+((e.circuit.sketch||'').length>2000?'\\n\u2026':'')+
      '</pre>');
  }

  // Trace — build per-tool token-per-call map for step cost annotations
  var tb = getToolTokenBreakdown(e);
  // tokPerCall: tool name → average tokens per invocation
  var tokPerCall = {};
  // Also cover pseudo-rows like [prompt/system], [reasoning], [final_response]
  var pseudoTokByLabel = {};
  (tb.rows || []).forEach(function(r) {
    if (r.tool && r.tool.charAt(0) === '[') {
      pseudoTokByLabel[r.tool] = r.tokens || 0;
    } else if (r.calls > 0) {
      tokPerCall[r.tool] = Math.round((r.tokens || 0) / r.calls);
    }
  });

  // Assign step tokens: tool_call steps get their per-call estimate;
  // text steps get their pseudo-label tokens (split across all text steps of same category).
  var textStepCount = (p.trace || []).filter(function(s) { return s.type === 'text'; }).length;
  var reasoningPerStep = textStepCount > 1 ? Math.round((pseudoTokByLabel['[reasoning]'] || 0) / Math.max(1, textStepCount - 1)) : 0;
  var promptTok = pseudoTokByLabel['[prompt/system]'] || 0;
  var finalTok = pseudoTokByLabel['[final_response]'] || 0;
  var textStepsSeen = 0;

  var cumulative = 0;
  var traceEvents = (p.trace || []).length;
  html.push('<div class="sh">Trace ('+traceEvents+' events, '+p.stepCount+' tool steps)</div><div class="trace">');
  p.trace.forEach(function(s,idx){
    var cls=s.type==='tool_call'?'call':s.type==='tool_result'?(s.succeeded?'rok':'rerr'):'txt';
    var kindLabel=s.type==='tool_call'?'call':s.type==='tool_result'?'result':'assistant';
    var desc='';
    if(s.type==='tool_call') desc='<span class="ttl">'+esc(s.toolName)+'</span>';
    else if(s.type==='tool_result') desc='<span class="ttl">'+esc(s.toolName)+'</span> '+(s.succeeded?'<span style="color:#22c55e">\u2713</span>':'<span style="color:#ef4444">\u2717</span>');
    else desc='<span style="color:var(--muted)">'+esc((s.text||'').slice(0,70))+((s.text||'').length>70?'\u2026':'')+'</span>';
    var summaryLine = summarizeTraceStep(s);

    // Compute step token cost
    var stepTok = 0;
    if (s.type === 'tool_call') {
      stepTok = tokPerCall[s.toolName] || 0;
    } else if (s.type === 'text') {
      textStepsSeen++;
      stepTok = textStepsSeen === 1 ? promptTok
              : (idx === p.trace.length - 1 || s.step === p.stepCount) ? finalTok
              : reasoningPerStep;
    }
    // tool_result carries no new model cost — shown as 0
    cumulative += stepTok;

    var tokBadge = '';
    if (stepTok > 0 || s.type === 'tool_call' || s.type === 'text') {
      var stepStr = stepTok > 0 ? fmt(stepTok) : '—';
      var cumStr = cumulative > 0 ? fmt(cumulative) : '—';
      tokBadge = '<span style="margin-left:auto;font-family:monospace;font-size:.6rem;color:var(--dim);white-space:nowrap" title="step tokens / cumulative">'+stepStr+' / '+cumStr+'</span>';
    }

    var bid='tb-'+e.runId+'-'+idx;
    var raw='';
    if(s.type==='tool_call'&&s.toolInput) raw=JSON.stringify(s.toolInput,null,2);
    else if(s.type==='tool_result'&&s.toolResult) raw=JSON.stringify(s.toolResult,null,2);
    else if(s.text) raw=s.text;

    var toggle=raw?' <span data-bid="'+bid+'" onclick="togB(this.dataset.bid)" style="color:var(--dim);cursor:pointer;font-size:.63rem">[raw]</span>':'';
    html.push('<div class="ts '+cls+'" style="align-items:baseline">'+
      '<span class="tsn">'+s.step+'</span><span class="tk">'+kindLabel+'</span>'+desc+toggle+tokBadge+
      '<div class="tsm">'+esc(summaryLine)+'</div>'+
      (raw?'<div class="tbd" id="'+bid+'">'+esc(raw.slice(0,1200))+(raw.length>1200?'\\n\u2026':'')+'</div>':'')+
    '</div>');
  });
  html.push('</div>');

  document.getElementById('sbi').innerHTML=html.join('');
}

function togB(id){var el=document.getElementById(id);if(el)el.classList.toggle('open');}
function goRun(id){setMode('individual');document.getElementById('rsel').value=id;showRun(id);}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadAll(){
  try{ var r=await fetch('/api/eval/all'); if(r.ok) allEvals=await r.json(); }catch(e){}
  try{ var r2=await fetch('/api/eval/summary'); if(r2.ok) summary=await r2.json(); }catch(e){}
  selectedDiagramVersion = latestVersionFromRuns(allEvals);
  populateVersionSelector();
  populateCompareSelector();
  populateRunSelector();
}

async function doRefresh(){
  document.getElementById('sbi').innerHTML='<div class="loading">Re-evaluating…</div>';
  try{
    await fetch('/api/eval/refresh',{method:'POST'});
    allEvals=[]; summary=null; selEval=null;
    document.getElementById('rsel').innerHTML='<option value="">— select run —</option>';
    await showOverview();
  }catch(err){}
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init(){
  await loadAll();
  await showOverview();
}
init();
<\/script>
</body>
</html>`;
}
