const REFRESH_MS = 5000;
const ALERT_LEVEL = 1.20;
const SURGE_PER_TICK = 0.15;

const state = {
  stations: [],
  lastUpdated: null,
  alerts24h: [],
  series: [],
  weather: []
};

// โหลดสถานี RID
async function loadStations() {
  try {
    const res = await fetch('http://water.rid.go.th/api/v1/waterlevel');
    const data = await res.json();
    const stations = data.map(s => ({
      id: s.station_id,
      name: s.station_name,
      level: +s.level_m.toFixed(2),
      prev: +s.level_m.toFixed(2),
      status: "ok",
      online: true,
      lat: s.lat,
      lng: s.lng
    }));
    state.stations = stations;
    state.series = stations.map(s => ({ id: s.id, name: s.name, values: [] }));
    tick(true);
  } catch (err) {
    console.error(err); alert("โหลดสถานี RID ล้มเหลว");
  }
}

// ดึง TMD ฝน/พยากรณ์
async function fetchTMD() {
  try {
    const res = await fetch('https://data.tmd.go.th/api/WeatherForecast/7-day/?type=json');
    const data = await res.json();
    state.weather = data.forecast || [];
  } catch (err) {
    console.error("โหลด TMD ล้มเหลว", err);
  }
}

// อัปเดตข้อมูลน้ำ + alerts + weather
async function tick(initial=false) {
  try {
    const res = await fetch('http://water.rid.go.th/api/v1/waterlevel');
    const data = await res.json();

    let newAlerts = [];
    state.stations.forEach(s => {
      s.prev = s.level;
      const apiStation = data.find(x => x.station_id === s.id);
      if (apiStation) { s.level = +apiStation.level_m.toFixed(2); s.online=true; } else s.online=false;

      let status="ok";
      if(s.level>=ALERT_LEVEL) status="alert";
      else if((s.level - s.prev) >= SURGE_PER_TICK*0.75) status="watch";
      s.status=status;

      if(!initial && (status==="alert"||status==="watch")) newAlerts.push({
        ts: new Date(), id: s.id, name: s.name,
        kind: status, level: s.level, delta: +(s.level-s.prev).toFixed(2)
      });

      const ser = state.series.find(x=>x.id===s.id);
      ser.values.push({ t: new Date(), v: s.level, status: s.status });
      if(ser.values.length>60) ser.values.shift();
    });

    state.alerts24h = [...newAlerts,...state.alerts24h].slice(0,200);
    state.lastUpdated = new Date();
    await fetchTMD();

    renderStats(); renderMap(); renderAlerts(); renderTrend(); renderWeather();
  } catch(err) { console.error(err); }

  setTimeout(()=>tick(false), REFRESH_MS);
}

// Render Stats
function renderStats() {
  document.getElementById('stat-stations').textContent = state.stations.length;
  document.getElementById('stat-online').textContent = state.stations.filter(s=>s.online).length;
  document.getElementById('stat-alerts').textContent = state.alerts24h.length;
  document.getElementById('stat-updated').textContent = state.lastUpdated?.toLocaleTimeString()||'—';
}

// Render Map
function renderMap() {
  const el = document.getElementById('map-canvas'); el.innerHTML="";
  const w=el.clientWidth, h=el.clientHeight; const svgNS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox",`0 0 ${w} ${h}`); svg.setAttribute("width","100%"); svg.setAttribute("height","100%");

  // แผนที่พื้นหลัง
  const river=document.createElementNS(svgNS,"path");
  river.setAttribute("d",`M0 ${h*0.3} C${w*0.3} ${h*0.25},${w*0.6} ${h*0.35},${w} ${h*0.3} L${w} ${h*0.4} C${w*0.6} ${h*0.45},${w*0.3} ${h*0.35},0 ${h*0.4} Z`);
  river.setAttribute("fill","#cfeaff"); river.setAttribute("opacity","0.8"); svg.appendChild(river);

  const lats=state.stations.map(s=>s.lat), lngs=state.stations.map(s=>s.lng);
  const minLat=Math.min(...lats), maxLat=Math.max(...lats);
  const minLng=Math.min(...lngs), maxLng=Math.max(...lngs);

  state.stations.forEach(s=>{
    const cx=20+((s.lng-minLng)/(maxLng-minLng||1))*(w-40);
    const cy=20+((maxLat-s.lat)/(maxLat-minLat||1))*(h-40);
    const g=document.createElementNS(svgNS,"g");
    const color=s.status==="alert"?"#ef4444":(s.status==="watch"?"#f59e0b":"#10b981");
    const outer=document.createElementNS(svgNS,"circle");
    outer.setAttribute("cx",cx); outer.setAttribute("cy",cy); outer.setAttribute("r",10); outer.setAttribute("fill",color); outer.setAttribute("stroke","#0001");
    const label=document.createElementNS(svgNS,"text"); label.textContent=s.name; label.setAttribute("x",cx+14); label.setAttribute("y",cy+4); label.setAttribute("font-size","12"); label.setAttribute("fill","#111");
    outer.addEventListener("mouseenter",()=>{label.textContent=`${s.name} • ${s.level.toFixed(2)} m`});
    outer.addEventListener("mouseleave",()=>{label.textContent=s.name});
    g.appendChild(outer); g.appendChild(label); svg.appendChild(g);
  });

  el.appendChild(svg);
}

// Render Alerts
function renderAlerts() {
  const ul=document.getElementById('alert-list'); ul.innerHTML="";
  state.alerts24h.slice(0,10).forEach(a=>{
    const li=document.createElement('li'); const tag=document.createElement('span');
    tag.className='tag '+(a.kind==="alert"?"alert":"watch"); tag.textContent=a.kind==="alert"?"ALERT":"WATCH";
    const text=document.createElement('div');
    text.innerHTML=`<strong>${a.name}</strong> — ${a.level.toFixed(2)} m (Δ ${a.delta.toFixed(2)} m) <span class="muted">เวลา ${a.ts.toLocaleTimeString()}</span>`;
    li.appendChild(tag); li.appendChild(text); ul.appendChild(li);
  });
}

// Render Trend
function renderTrend() {
  const canvas=document.getElementById('trend-canvas'); const ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H); ctx.save(); ctx.translate(50,20);
  const plotW=W-70, plotH=H-60; ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=1; ctx.strokeRect(0,0,plotW,plotH);

  const points=[]; const len=Math.max(...state.series.map(s=>s.values.length));
  for(let i=0;i<len;i++){
    const vs=state.series.map(s=>s.values[i]?.v).filter(v=>typeof v==='number');
    const v=vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null;
    if(v!==null) points.push(v);
  } if(!points.length){ctx.restore(); return;}
  const minV=Math.min(...points,0), maxV=Math.max(...points,ALERT_LEVEL+0.2);

  const yTicks=5; ctx.font="12px system-ui"; ctx.fillStyle="#6b7280";
  for(let i=0;i<=yTicks;i++){const y=plotH-(i/yTicks)*plotH; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(plotW,y); ctx.stroke(); ctx.fillText((minV+(i/yTicks)*(maxV-minV)).toFixed(2)+" m",-40,y+4);}
  const yAlert=plotH-(ALERT_LEVEL-minV)*(plotH/(maxV-minV)); ctx.strokeStyle="#ef4444"; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.moveTo(0,yAlert); ctx.lineTo(plotW,yAlert); ctx.stroke(); ctx.setLineDash([]); ctx.fillText("เกณฑ์แจ้งเตือน 1.20 m",plotW-170,yAlert-6);

  ctx.strokeStyle="#2e5bff"; ctx.lineWidth=2; ctx.beginPath();
  points.forEach((v,i)=>{const x=(i/(points.length-1))*plotW; const y=plotH-(v-minV)*(plotH/(maxV-minV)); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}); ctx.stroke();
  ctx.restore();
}

// Render Weather
function renderWeather() {
  const el=document.getElementById('weather'); el.innerHTML="";
  state.weather.forEach(day=>{
    const div=document.createElement('div'); div.className="weather-day";
    div.innerHTML=`<strong>${day.date}</strong>: ฝน ${day.rain} mm, Temp ${day.temp_min}–${day.temp_max} °C`;
    el.appendChild(div);
  });
}

// bootstrap
loadStations();
