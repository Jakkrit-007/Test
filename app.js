// WaterSense front-end (ข้อมูลกรมชลประทานจริง)

const REFRESH_MS = 5000;          // อัปเดตทุก 5 วินาที
const ALERT_LEVEL = 1.20;         // เกณฑ์แจ้งเตือน (เมตร)

const state = {
  stations: [],
  lastUpdated: null,
  alerts24h: [],
  series: []
};

// โหลดรายชื่อสถานีจากกรมชลประทาน
async function loadStations() {
  try {
    // 🔗 เปลี่ยน URL ให้ตรงกับ API จริง
    const res = await fetch("https://hydro.rid.go.th/api/stations");
    const stations = await res.json();

    state.stations = stations.map(s => ({
      id: s.StationID,
      name: s.StationName,
      level: +s.WaterLevel || 0,
      prev: +s.WaterLevel || 0,
      status: "ok",
      online: true,
      lat: s.Latitude,
      lng: s.Longitude
    }));

    state.series = state.stations.map(s => ({
      id: s.id,
      name: s.name,
      values: []
    }));

    tick(); // เริ่มอัปเดตค่าจริง
  } catch (err) {
    console.error("โหลดสถานีล้มเหลว", err);
    alert("โหลดข้อมูลจากกรมชลประทานไม่สำเร็จ");
  }
}

// โหลดค่าล่าสุดทุก REFRESH_MS
async function tick() {
  try {
    const res = await fetch("https://hydro.rid.go.th/api/latest");
    const liveData = await res.json();

    let newAlerts = [];
    state.stations.forEach(s => {
      const d = liveData.find(x => x.StationID === s.id);
      if (!d) return;

      s.prev = s.level;
      s.level = +d.WaterLevel || 0;
      s.online = true;

      let status = "ok";
      if (s.level >= ALERT_LEVEL) status = "alert";
      else if ((s.level - s.prev) >= 0.15) status = "watch";
      s.status = status;

      if (status !== "ok") {
        newAlerts.push({
          ts: new Date(d.Datetime),
          id: s.id,
          name: s.name,
          kind: status,
          level: s.level,
          delta: +(s.level - s.prev).toFixed(2)
        });
      }
    });

    state.alerts24h = [...newAlerts, ...state.alerts24h].slice(0, 200);
    state.lastUpdated = new Date();

    // เก็บ series สำหรับวาดกราฟ
    state.series.forEach(ser => {
      const st = state.stations.find(x => x.id === ser.id);
      if (!st) return;
      ser.values.push({ t: state.lastUpdated, v: st.level, status: st.status });
      if (ser.values.length > 60) ser.values.shift();
    });

    renderStats();
    renderMap();
    renderAlerts();
    renderTrend();
  } catch (err) {
    console.error("อัปเดตข้อมูลล้มเหลว", err);
  }

  setTimeout(tick, REFRESH_MS);
}

// ---------------- Renderers เดิมคงไว้ ----------------
// (renderStats, renderMap, renderAlerts, renderTrend เหมือนโค้ดที่ส่งให้รอบก่อน)
// -----------------------------------------------------

loadStations();
