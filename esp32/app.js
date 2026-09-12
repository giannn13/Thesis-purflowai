// ════════════════════════════════
// SENSOR DATA
// ════════════════════════════════
const SENSORS = [
  { id: 'flow',      name: 'Water Flow',  model: 'YF-S201', unit: 'L/min', min: 0,   max: 30,   safeMin: 2,   safeMax: 25,  color: '#38bdf8', desc: 'Flow rate through main pipe' },
  { id: 'temp',      name: 'Temperature', model: 'DS18B20', unit: '°C',    min: 0,   max: 100,  safeMin: 5,   safeMax: 40,  color: '#fb923c', desc: 'Water temperature reading' },
  { id: 'turbidity', name: 'Turbidity', model: 'SEN0554', unit: '%',     min: 0,   max: 100,  safeMin: 0,   safeMax: 35,  color: '#a78bfa', desc: '0% = Clean, 100% = Dirty' },
  { id: 'tds',       name: 'TDS',         model: 'SEN0244', unit: 'ppm',   min: 0,   max: 1000, safeMin: 0,   safeMax: 500, color: '#34d399', desc: 'Total dissolved solids' },
  { id: 'ph',        name: 'pH Level',    model: 'SEN0161', unit: 'pH',    min: 0,   max: 14,   safeMin: 6.5, safeMax: 8.5, color: '#f472b6', desc: 'Acidity / alkalinity level' },
];

const HISTORY_LEN = 30;
let sensorValues = SENSORS.map(() => null);
let sensorHistories = SENSORS.map(() => []);

// ════════════════════════════════
// HELPERS
// ════════════════════════════════
function getStatus(v, s) {
  if (typeof v !== 'number') return 'unknown';
  if (v < s.safeMin || v > s.safeMax) return 'critical';
  
  const pct = (v - s.safeMin) / (s.safeMax - s.safeMin);
  
  // Warn if it's getting close to the DANGEROUS HIGH limit (top 15%)
  if (pct > 0.85) return 'warning';
  
  // Warn if it's getting close to the LOW limit, BUT ONLY if the low limit isn't zero
  if (s.safeMin > 0 && pct < 0.15) return 'warning';
  
  return 'healthy';
}

const STATUS_LABEL = { healthy: 'Healthy', warning: 'Warning', critical: 'Critical', unknown: 'No Data' };

function fmt(v, s) {
  if (typeof v !== 'number') return '--';
  return (s.unit === 'pH' || s.unit === '%') ? v.toFixed(1) : Math.round(v);
}

// ════════════════════════════════
// SPARKLINE
// ════════════════════════════════
function makeSpark(history, s) {
  if (!history.length) return '<div class="sc-unit">No history</div>';
  const W = 200, H = 40, pad = 2;
  const range = s.max - s.min || 1;
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * (W - pad * 2) + pad;
    const y = H - pad - ((v - s.min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const safeY1 = H - pad - ((s.safeMax - s.min) / range) * (H - pad * 2);
  const safeY2 = H - pad - ((s.safeMin - s.min) / range) * (H - pad * 2);
  return `
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <rect x="0" y="${safeY1}" width="${W}" height="${safeY2 - safeY1}" fill="${s.color}" opacity="0.08"/>
      <polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
}

// ════════════════════════════════
// SENSOR CARD HTML
// ════════════════════════════════
function sensorCardHTML(s, v, hist) {
  const status = getStatus(v, s);
  const pct = typeof v === 'number'
    ? Math.max(0, Math.min(100, ((v - s.min) / (s.max - s.min)) * 100))
    : 0;
  return `
    <div class="sensor-card ${status}" style="--c:${s.color}">
      <div class="sc-header">
        <div>
          <div class="sc-model">${s.model}</div>
        </div>
        <div class="sc-badge badge-${status}">${STATUS_LABEL[status]}</div>
      </div>
      <div class="sc-value">${fmt(v, s)}</div>
      <div class="sc-unit">${s.unit}</div>
      <div class="sc-bar-wrap"><div class="sc-bar" style="width:${pct}%"></div></div>
      <div class="sparkline-wrap">${makeSpark(hist, s)}</div>
      <div class="sc-footer">
        <span>Safe: ${s.safeMin}–${s.safeMax} ${s.unit}</span>
        <span>${s.desc}</span>
      </div>
    </div>`;
}

// ════════════════════════════════
// RENDER: SENSORS
// ════════════════════════════════
function renderSensors() {
  const home   = document.getElementById('home-sensor-grid');
  const detail = document.getElementById('sensor-detail-grid');
  let html = '';
  SENSORS.forEach((s, i) => {
    html += sensorCardHTML(s, sensorValues[i], sensorHistories[i]);
  });
  home.innerHTML   = html;
  detail.innerHTML = html;
}

// ════════════════════════════════
// RENDER: ALERTS
// ════════════════════════════════
let alertsData = [];

function renderAlerts() {
  const SEV_LABEL = { crit: 'CRITICAL', warn: 'WARNING', info: 'INFO' };
  const SEV_STYLE = {
    crit: 'background:rgba(248,113,113,0.15);color:var(--red);border:1px solid rgba(248,113,113,0.3)',
    warn: 'background:rgba(251,191,36,0.12);color:var(--yellow);border:1px solid rgba(251,191,36,0.3)',
    info: 'background:rgba(56,189,248,0.1);color:var(--accent);border:1px solid rgba(56,189,248,0.25)',
  };
  if (!alertsData.length) {
    document.getElementById('alert-list').innerHTML = '<div class="alert-item info"><div class="alert-body"><div class="alert-title">No active alerts</div><div class="alert-desc">Waiting for ESP32 sensor feed.</div></div></div>';
    return;
  }

  document.getElementById('alert-list').innerHTML = alertsData.map(a => `
    <div class="alert-item ${a.sev}">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
      </div>
      <div class="alert-time">${a.time}</div>
      <div class="alert-sev" style="${SEV_STYLE[a.sev]}">${SEV_LABEL[a.sev]}</div>
    </div>`).join('');
}

// ════════════════════════════════
// RENDER: MAINTENANCE
// ════════════════════════════════
let systemTasks = [];

function urgencyStyles(urgency) {
  const map = {
    now:   { bg: 'rgba(248,113,113,0.12)', color: 'var(--red)',    border: 'rgba(248,113,113,0.3)', label: 'IMMEDIATE', anim: 'animation:pulse 1.3s infinite' },
    week:  { bg: 'rgba(251,191,36,0.1)',   color: 'var(--yellow)', border: 'rgba(251,191,36,0.3)',  label: 'THIS WEEK',  anim: '' },
    month: { bg: 'rgba(56,189,248,0.08)',  color: 'var(--accent)', border: 'rgba(56,189,248,0.25)', label: 'UPCOMING',   anim: '' },
  };
  return map[urgency];
}

function renderMaintenance() {
  if (!systemTasks.length) {
    document.getElementById('maint-timeline').innerHTML = '<div class="task-row"><div class="task-body"><div class="task-title">No scheduled tasks</div><div class="task-desc">Maintenance tasks will appear once backend rules are connected.</div></div></div>';
  } else {
    document.getElementById('maint-timeline').innerHTML = systemTasks.map((t, i) => {
    const u = urgencyStyles(t.urgency);
    return `
      <div class="task-row" style="--dc:${t.dc}">
        <div class="task-dot-col">
          <div class="task-dot"></div>
          ${i < systemTasks.length - 1 ? '<div class="task-line"></div>' : ''}
        </div>
        <div class="task-body">
          <div class="task-top">
            <div>
              <div class="task-date">${t.date}</div>
              <div class="task-title">${t.title}</div>
            </div>
            <div class="task-urg-badge" style="background:${u.bg};color:${u.color};border:1px solid ${u.border};${u.anim}">${u.label}</div>
          </div>
          <div class="task-desc">${t.desc}</div>
          <div class="task-tags">${t.tags.map(tag => `<span class="task-tag">${tag}</span>`).join('')}</div>
        </div>
      </div>`;
    }).join('');
  }

  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const taskDots = {};
  let html = days.map(d => `<div class="cal-day-label">${d}</div>`).join('');
  for (let i = 0; i < 3; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= 30; d++) {
    const tc = taskDots[d] || '';
    html += `<div class="cal-cell ${d === 22 ? 'today' : ''} ${tc ? 'has-task' : ''}" style="--tc:${tc}">${d}</div>`;
  }
  document.getElementById('calendar').innerHTML = html;
}

// ════════════════════════════════
// NAVIGATION & CLOCK
// ════════════════════════════════
const PAGE_META = {
  home:        { el: 'page-home',        title: 'System Overview' },
  sensors:     { el: 'page-sensors',     title: 'Sensor Monitor' },
  alerts:      { el: 'page-alerts',      title: 'Alerts & Notifications' },
  maintenance: { el: 'page-maintenance', title: 'Maintenance Schedule' },
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const pg = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(PAGE_META[pg].el).classList.add('active');
    document.getElementById('page-title').textContent = PAGE_META[pg].title;
  });
});

function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// ════════════════════════════════
// LIVE DATA TICK
// ════════════════════════════════
function updateSummary() {
  const withData = sensorValues.filter(v => typeof v === 'number');
  if (!withData.length) {
    if(document.getElementById('health-score')) document.getElementById('health-score').textContent = '--';
    if(document.getElementById('sys-health-pct')) document.getElementById('sys-health-pct').textContent = '--';
    if(document.getElementById('home-alerts')) document.getElementById('home-alerts').textContent = '0';
    if(document.getElementById('alert-badge')) document.getElementById('alert-badge').textContent = '0';
    return;
  }

  const crits = sensorValues.filter((v, i) => getStatus(v, SENSORS[i]) === 'critical').length;
  const warns = sensorValues.filter((v, i) => getStatus(v, SENSORS[i]) === 'warning').length;
  const score = Math.max(0, 100 - crits * 15 - warns * 5);

  if(document.getElementById('health-score')) document.getElementById('health-score').textContent = score + '%';
  if(document.getElementById('sys-health-pct')) document.getElementById('sys-health-pct').textContent = score + '%';
  if(document.getElementById('home-alerts')) document.getElementById('home-alerts').textContent = String(alertsData.length);
  if(document.getElementById('alert-badge')) document.getElementById('alert-badge').textContent = String(alertsData.length);
}

function applySensorReadings(readings) {
  sensorValues = SENSORS.map((s, i) => {
    const raw = readings?.[s.id] ?? readings?.[i];
    return typeof raw === 'number' ? Math.max(s.min, Math.min(s.max, raw)) : null;
  });

  sensorHistories = sensorHistories.map((hist, i) => {
    const value = sensorValues[i];
    if (typeof value !== 'number') return hist;
    return [...hist.slice(-(HISTORY_LEN - 1)), value];
  });

  renderSensors();
  updateSummary();
}

function applyAlerts(nextAlerts) {
  alertsData = Array.isArray(nextAlerts) ? nextAlerts : [];
  renderAlerts();
  updateSummary();
}

function applyMaintenanceTasks(nextTasks) {
  systemTasks = Array.isArray(nextTasks) ? nextTasks : [];
  renderMaintenance();
}

window.pureFlowBridge = { applySensorReadings, applyAlerts, applyMaintenanceTasks };

function initEmptyState() {
  renderSensors();
  renderAlerts();
  renderMaintenance();
  updateSummary();
}

initEmptyState();

// ════════════════════════════════
// ESP32 DATA PIPELINE
// ════════════════════════════════

const ESP32_IP = "http://pureflow.local"; // Ensure this is your current ESP32 IP

async function fetchESP32Data() {
  try {
    const response = await fetch(`${ESP32_IP}/data`);
    const data = await response.json();

    // 1. HEARTBEAT: If we get here, ESP32 is ON
    const statusEl = document.getElementById('system-status-indicator');
    if(statusEl) {
        statusEl.textContent = "ONLINE - LIVE DATA";
        statusEl.style.color = "#4ade80"; 
    }

    // 2. Turbidity Calibration Math (Raw to Percentage)
    let rawTurbidity = data.turbidity || 0; 
    const rawMin = 4, rawMax = 243;     
    const realMin = 0, realMax = 100;    
    
    let calibratedNTU = (rawTurbidity - rawMin) * (realMax - realMin) / (rawMax - rawMin) + realMin;
    calibratedNTU = Math.max(0, Math.min(100, calibratedNTU)); 

    // 3. Map the JSON correctly to your Dashboard IDs
    const liveReadings = {
      temp: data.temp,             
      turbidity: calibratedNTU,
      ph: data.ph,
      tds: data.tds
    };

    // 4. Feed the data to update the UI
    applySensorReadings(liveReadings);
    
    // Optional: Log to console to verify the live feed
    // console.log(`Dashboard Updated -> Temp: ${data.temp}°C | Turbidity: ${calibratedNTU.toFixed(1)}%`);

  } catch (error) {
    // HEARTBEAT FAILURE: ESP32 is OFF or Disconnected
    const statusEl = document.getElementById('system-status-indicator');
    if(statusEl) {
        statusEl.textContent = "SYSTEM OFFLINE";
        statusEl.style.color = "#f87171"; 
    }
    console.error("Waiting for ESP32 connection...", error);
  }
}

// Ping the ESP32 every 2 seconds
setInterval(fetchESP32Data, 2000);
fetchESP32Data();