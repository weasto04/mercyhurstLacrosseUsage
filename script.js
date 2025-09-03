// Minimal front-end app: load CSV, filter by season, draw scatter, perform k-NN regression.

const CSV_PATH = 'mercyhurst_lacrosse.csv';

const svg = document.getElementById('chart');
const tooltip = document.getElementById('tooltip');
const seasonSelect = document.getElementById('seasonSelect');
const shotsInput = document.getElementById('shotsInput');
const kSelect = document.getElementById('kSelect');
const predValue = document.getElementById('predValue');

let rawData = [];
let filtered = [];

function parseCSV(text){
  // Parse CSV with support for quoted fields that may contain commas (e.g. "Last, First").
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (ch === '"'){
      // handle escaped quotes "" inside quoted field
      if (inQuotes && text[i+1] === '"'){
        cur += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes){
      row.push(cur);
      cur = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes){
      // handle CRLF \r\n by checking next char
      if (ch === '\r' && text[i+1] === '\n') { i++; }
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += ch;
  }
  // push remaining
  if (cur !== '' || row.length > 0){
    row.push(cur);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const hdr = rows.shift().map(h=>String(h).trim().toLowerCase());
  return rows.map(cols=>{
    // convert columns to object by header index
    const obj = {};
    for (let i = 0; i < hdr.length; i++){
      const key = hdr[i];
      let val = cols[i] ?? '';
      // remove surrounding quotes and trim
      val = String(val).trim();
      if (val.startsWith('"') && val.endsWith('"')){
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      obj[key] = val;
    }
    // normalize fields: header may be 'g' and 'sh' in this CSV
    const goalsVal = obj.g ?? obj.goals ?? obj['g'] ?? obj['G'] ?? obj['G'.toLowerCase()];
    const shotsVal = obj.sh ?? obj.shots ?? obj['sh'] ?? obj['SH'] ?? obj['SH'.toLowerCase()];
    return {
      year: String(obj.year),
      player: obj.player,
      goals: Number(goalsVal),
      shots: Number(shotsVal),
      usage: obj.usage
    };
  });
}

function fetchData(){
  return fetch(CSV_PATH).then(r=>r.text()).then(parseCSV);
}

function extent(arr, key){
  const vals = arr.map(d=>d[key]);
  return [Math.min(...vals), Math.max(...vals)];
}

function clearSvg(){
  while(svg.firstChild) svg.removeChild(svg.firstChild);
}

function createSvg(tag, attrs){
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function draw(){
  clearSvg();
  const padding = {l:60, r:20, t:20, b:60};
  const W = svg.clientWidth || 800;
  const H = svg.clientHeight || 500;
  const innerW = W - padding.l - padding.r;
  const innerH = H - padding.t - padding.b;

  const [minX, maxX] = extent(filtered, 'shots');
  const [minY, maxY] = extent(filtered, 'goals');
  const xPad = Math.max(5, Math.round((maxX-minX)*0.08));
  const yPad = Math.max(1, Math.round((maxY-minY)*0.08));
  const x0 = minX - xPad, x1 = maxX + xPad;
  const y0 = Math.max(0, minY - yPad), y1 = maxY + yPad;

  const xScale = s => padding.l + ((s - x0) / (x1 - x0)) * innerW;
  const yScale = g => padding.t + innerH - ((g - y0) / (y1 - y0)) * innerH;

  // axes
  const xAxis = createSvg('line', {x1:padding.l, y1:padding.t+innerH, x2:padding.l+innerW, y2:padding.t+innerH, stroke:'#999'});
  svg.appendChild(xAxis);
  const yAxis = createSvg('line', {x1:padding.l, y1:padding.t, x2:padding.l, y2:padding.t+innerH, stroke:'#999'});
  svg.appendChild(yAxis);

  // ticks and labels (simple)
  for(let i=0;i<=5;i++){
    const t = x0 + (i/5)*(x1-x0);
    const x = xScale(t);
    const tick = createSvg('line',{x1:x, x2:x, y1:padding.t+innerH, y2:padding.t+innerH+6, stroke:'#666'});
    svg.appendChild(tick);
    const lab = createSvg('text',{x:x, y:padding.t+innerH+20, 'text-anchor':'middle', 'font-size':12, fill:'#333'});
    lab.textContent = Math.round(t);
    svg.appendChild(lab);
  }
  for(let i=0;i<=5;i++){
    const t = y0 + (i/5)*(y1-y0);
    const y = yScale(t);
    const tick = createSvg('line',{x1:padding.l-6, x2:padding.l, y1:y, y2:y, stroke:'#666'});
    svg.appendChild(tick);
    const lab = createSvg('text',{x:padding.l-10, y:y+4, 'text-anchor':'end', 'font-size':12, fill:'#333'});
    lab.textContent = Math.round(t);
    svg.appendChild(lab);
  }

  // axis titles
  const xLab = createSvg('text',{x:padding.l+innerW/2, y:padding.t+innerH+44, 'text-anchor':'middle', 'font-size':13, fill:'#111'});
  xLab.textContent = 'Shots'; svg.appendChild(xLab);
  const yLab = createSvg('text',{x:padding.l-44, y:padding.t+innerH/2, 'text-anchor':'middle', transform:`rotate(-90 ${padding.l-44} ${padding.t+innerH/2})`, 'font-size':13, fill:'#111'});
  yLab.textContent = 'Goals'; svg.appendChild(yLab);

  // points
  filtered.forEach(d=>{
    const cx = xScale(d.shots);
    const cy = yScale(d.goals);
    const c = createSvg('circle',{cx, cy, r:6, class:'point'});
    c.dataset.player = d.player;
    c.dataset.shots = d.shots;
    c.dataset.goals = d.goals;
    c.addEventListener('mousemove', ev=>{
      tooltip.classList.remove('hidden');
      tooltip.style.left = (ev.clientX + 10) + 'px';
      tooltip.style.top = (ev.clientY + 10) + 'px';
      tooltip.innerHTML = `<strong>${d.player}</strong><br/>shots: ${d.shots}<br/>goals: ${d.goals}`;
    });
    c.addEventListener('mouseleave', ()=> tooltip.classList.add('hidden'));
    svg.appendChild(c);
  });

  // query point & neighbors
  const queryShots = Number(shotsInput.value) || 0;
  const k = Number(kSelect.value) || 3;
  // draw query only if within a reasonable range
  const qx = xScale(queryShots);
  const qy = yScale(0); // placeholder vertical; we'll compute predicted goals soon

  // compute distances by shots only (1D on shots)
  const distances = filtered.map(d=>({d, dist:Math.abs(d.shots - queryShots)}));
  distances.sort((a,b)=>a.dist - b.dist);
  const neighbors = distances.slice(0, Math.min(k, distances.length));

  // mark neighbors visually
  neighbors.forEach(n=>{
    const cx = xScale(n.d.shots);
    const cy = yScale(n.d.goals);
    const el = createSvg('circle',{cx, cy, r:8, class:'neighbor', opacity:0.9});
    // attach data so hover shows the player's info even when highlighted
    el.dataset.player = n.d.player;
    el.dataset.shots = n.d.shots;
    el.dataset.goals = n.d.goals;
    el.addEventListener('mousemove', ev=>{
      tooltip.classList.remove('hidden');
      tooltip.style.left = (ev.clientX + 10) + 'px';
      tooltip.style.top = (ev.clientY + 10) + 'px';
      tooltip.innerHTML = `<strong>${n.d.player}</strong><br/>shots: ${n.d.shots}<br/>goals: ${n.d.goals}`;
    });
    el.addEventListener('mouseleave', ()=> tooltip.classList.add('hidden'));
    svg.appendChild(el);
  });

  // prediction = mean goals of neighbors
  const pred = neighbors.length ? (neighbors.reduce((s,n)=>s + n.d.goals, 0) / neighbors.length) : 0;
  predValue.textContent = pred.toFixed(2);

  // draw query point at predicted y
  const qp = createSvg('circle',{cx: qx, cy: yScale(pred), r:7, class:'queryPoint'});
  // show predicted shots and goals on hover
  qp.addEventListener('mousemove', ev=>{
    tooltip.classList.remove('hidden');
    tooltip.style.left = (ev.clientX + 10) + 'px';
    tooltip.style.top = (ev.clientY + 10) + 'px';
    const qShots = Number(shotsInput.value) || 0;
    tooltip.innerHTML = `<strong>Query</strong><br/>shots: ${qShots}<br/>predicted goals: ${pred.toFixed(2)}`;
  });
  qp.addEventListener('mouseleave', ()=> tooltip.classList.add('hidden'));
  svg.appendChild(qp);

}

function populateK(){
  // allow k from 1..min(15, n)
  const n = filtered.length || rawData.length || 10;
  kSelect.innerHTML = '';
  const maxk = Math.min(15, n);
  for(let i=1;i<=maxk;i++){
    const opt = document.createElement('option'); opt.value = i; opt.textContent = i; kSelect.appendChild(opt);
  }
}

function updateFiltered(){
  const season = seasonSelect.value;
  filtered = rawData.filter(d=>d.year === season);
  if(filtered.length === 0){
    // if none match, fallback to all
    filtered = rawData.slice();
  }
  populateK();
  draw();
}

seasonSelect.addEventListener('change', ()=> updateFiltered());
shotsInput.addEventListener('input', ()=> draw());
kSelect.addEventListener('change', ()=> draw());

// initialize
fetchData().then(data=>{
  rawData = data;
  updateFiltered();
}).catch(err=>{
  console.error('Failed to load CSV', err);
  alert('Could not load local CSV. Make sure the file exists in this folder and you open the site via a static server.');
});
