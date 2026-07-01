// ============================================================
// Agriculture Dashboard — Real-Time Data + Live Satellite Maps
// Satellite Tiles: NASA GIBS (MODIS Terra/Aqua) via Leaflet
// Weather Data:    Open-Meteo (free, no key)
// Geocoding:       Nominatim / OpenStreetMap (free, no key)
// ============================================================

// ─── State ───────────────────────────────────────────────────
let currentLat = 20.59;
let currentLon = 78.96;
let currentLocationName = 'India (Default)';

// ─── Map instances ───────────────────────────────────────────
let mapOptical    = null;
let mapStress     = null;
let mapGrowth     = null;
let mapThumbOpt   = null;
let mapThumbSAR   = null;
let mapIrrigation = null;

// ─── Chart instances ─────────────────────────────────────────
let gaugeChart       = null;
let stressTrendChart = null;

// ─── NASA GIBS helpers ────────────────────────────────────────
// Returns yesterday's date string (GIBS typically available ~1 day lag)
function gibsDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Build a NASA GIBS WMTS tile layer for Leaflet
function gibsLayer(product, format = 'jpg') {
    const date = gibsDate();
    return L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/${date}/GoogleMapsCompatible/{z}/{y}/{x}.${format}`,
        {
            tileSize: 256,
            maxZoom: 9,
            opacity: 1,
            attribution: `<a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank">NASA GIBS</a>`
        }
    );
}

// Dark basemap for context
function darkBasemap() {
    return L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 20 }
    );
}

// ─── Create a Leaflet map inside a container div ─────────────
function createMap(containerId, lat, lon, zoom, layerFn, showMarker = false) {
    const map = L.map(containerId, {
        center: [lat, lon],
        zoom: zoom,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false
    });

    darkBasemap().addTo(map);
    layerFn().addTo(map);

    if (showMarker) {
        L.circleMarker([lat, lon], {
            radius: 8,
            color: '#2ecc71',
            fillColor: '#2ecc71',
            fillOpacity: 0.8,
            weight: 2
        }).addTo(map).bindPopup(`📍 ${currentLocationName}`).openPopup();
    }

    // Add compact attribution bottom-left
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);

    return map;
}

// ─── Initialize all 6 maps on first load ─────────────────────
function initSatelliteMaps(lat, lon) {
    const zoom = 7;
    const thumbZoom = 6;

    // 1. Main Optical — MODIS Terra True Color
    if (!mapOptical) {
        mapOptical = createMap('map-optical', lat, lon, zoom,
            () => gibsLayer('MODIS_Terra_CorrectedReflectance_TrueColor'), true);
    } else {
        mapOptical.setView([lat, lon], zoom);
        updateMapMarker(mapOptical, lat, lon);
    }

    // 2. Stress — MODIS Bands 7-2-1 (False Color: red = stressed/bare soil)
    if (!mapStress) {
        mapStress = createMap('map-stress', lat, lon, zoom,
            () => gibsLayer('MODIS_Terra_CorrectedReflectance_Bands721'), true);
    } else {
        mapStress.setView([lat, lon], zoom);
        updateMapMarker(mapStress, lat, lon);
    }

    // 3. Growth / NDVI — MODIS Aqua True Color + green tint
    if (!mapGrowth) {
        mapGrowth = createMap('map-growth', lat, lon, zoom,
            () => gibsLayer('MODIS_Aqua_CorrectedReflectance_TrueColor'), true);
    } else {
        mapGrowth.setView([lat, lon], zoom);
        updateMapMarker(mapGrowth, lat, lon);
    }

    // 4. Thumbnail Optical
    if (!mapThumbOpt) {
        mapThumbOpt = createMap('thumb-optical', lat, lon, thumbZoom,
            () => gibsLayer('MODIS_Terra_CorrectedReflectance_TrueColor'), false);
        mapThumbOpt.dragging.disable();
        mapThumbOpt.zoomControl.remove();
    } else {
        mapThumbOpt.setView([lat, lon], thumbZoom);
    }

    // 5. Thumbnail SAR-like
    if (!mapThumbSAR) {
        mapThumbSAR = createMap('thumb-sar', lat, lon, thumbZoom,
            () => gibsLayer('MODIS_Terra_CorrectedReflectance_Bands721'), false);
        mapThumbSAR.dragging.disable();
        mapThumbSAR.zoomControl.remove();
    } else {
        mapThumbSAR.setView([lat, lon], thumbZoom);
    }

    // 6. Irrigation map — MODIS Terra TrueColor + precipitation overlay hint
    if (!mapIrrigation) {
        mapIrrigation = createMap('map-irrigation', lat, lon, zoom,
            () => gibsLayer('MODIS_Terra_CorrectedReflectance_TrueColor'), true);
    } else {
        mapIrrigation.setView([lat, lon], zoom);
        updateMapMarker(mapIrrigation, lat, lon);
    }

    // Update GIBS date label
    document.getElementById('gibs-date-label').textContent = `Image date: ${gibsDate()}`;
}

// Helper to update the green marker
function updateMapMarker(map, lat, lon) {
    map.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });
    L.circleMarker([lat, lon], {
        radius: 8,
        color: '#2ecc71',
        fillColor: '#2ecc71',
        fillOpacity: 0.8,
        weight: 2
    }).addTo(map).bindPopup(`📍 ${currentLocationName}`).openPopup();
}

// ─── Weather code → emoji + label ────────────────────────────
function weatherCodeInfo(code) {
    if (code === 0) return { icon: '☀️', label: 'Clear' };
    if ([1, 2].includes(code)) return { icon: '🌤️', label: 'Partly Cloudy' };
    if (code === 3) return { icon: '☁️', label: 'Overcast' };
    if ([45, 48].includes(code)) return { icon: '🌫️', label: 'Foggy' };
    if ([51, 53, 55].includes(code)) return { icon: '🌦️', label: 'Drizzle' };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { icon: '🌧️', label: 'Rain' };
    if ([71, 73, 75, 77].includes(code)) return { icon: '❄️', label: 'Snow' };
    if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Thunder' };
    return { icon: '🌡️', label: 'N/A' };
}

function dayAbbrev(dateStr) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr).getDay()];
}

// ─── Stress index from ET + soil moisture ────────────────────
function computeStressIndex(et, soilMoisture) {
    const etNorm = Math.min(et / 10, 1);
    const smNorm = 1 - Math.min(soilMoisture / 0.4, 1);
    return Math.round((etNorm * 0.6 + smNorm * 0.4) * 100) / 100;
}

// ─── Irrigation recommendation logic ─────────────────────────
function computeIrrigationRec(soilWaterBalance) {
    if (soilWaterBalance < -50) {
        return { action: '💧 Irrigate Immediately!', sub: 'Severe water deficit detected.',
                 depth: '40–50 mm', duration: '8–10 hours', priority: '10+ fields', volume: '25,000+ m³' };
    } else if (soilWaterBalance < -10) {
        return { action: '💧 Irrigate in next 24–48 hrs', sub: 'Moderate to Severe Stress areas.',
                 depth: '25–35 mm', duration: '6–8 hours', priority: '7 fields', volume: '18,650 m³' };
    } else if (soilWaterBalance < 30) {
        return { action: '✅ Monitor — No urgency', sub: 'Water balance is optimal.',
                 depth: '10–15 mm', duration: '2–3 hours', priority: '2–3 fields', volume: '5,000 m³' };
    } else {
        return { action: '⚠️ Avoid Irrigation', sub: 'Surplus water. Risk of waterlogging.',
                 depth: '0 mm', duration: 'N/A', priority: '0 fields', volume: '0 m³' };
    }
}

// ─── Gauge Chart ──────────────────────────────────────────────
function buildGaugeChart(value) {
    const ctx = document.getElementById('gaugeChart').getContext('2d');
    if (gaugeChart) gaugeChart.destroy();
    gaugeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Critical', 'Mild Deficit', 'Optimal', 'Surplus'],
            datasets: [{
                data: [25, 25, 25, 25],
                backgroundColor: ['#ff0000', '#ffa500', '#32cd32', '#1f77b4'],
                borderWidth: 0, cutout: '80%', rotation: 270, circumference: 180
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true }
        }
    });
    const valEl = document.getElementById('gauge-value-text');
    valEl.textContent = value + ' mm';
    if (value < -50)      valEl.style.color = '#ff0000';
    else if (value < -10) valEl.style.color = '#ffa500';
    else if (value < 30)  valEl.style.color = '#32cd32';
    else                  valEl.style.color = '#1f77b4';
}

// ─── Stress Trend Chart ───────────────────────────────────────
function buildStressTrendChart(labels, data) {
    const ctx = document.getElementById('stressTrendChart').getContext('2d');
    if (stressTrendChart) stressTrendChart.destroy();
    stressTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Stress Index',
                data,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46,204,113,0.1)',
                fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#8a9b8e', font: { size: 9 }, maxTicksLimit: 6 }, grid: { color: '#1a2a1f' } },
                y: { min: 0, max: 1, ticks: { color: '#8a9b8e', font: { size: 9 } }, grid: { color: '#1a2a1f' } }
            }
        }
    });
}

// ─── Render 7-day Forecast ────────────────────────────────────
function renderForecast(daily) {
    const container = document.getElementById('forecast-container');
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const info = weatherCodeInfo(daily.weather_code[i]);
        const tmax = Math.round(daily.temperature_2m_max[i]);
        const tmin = Math.round(daily.temperature_2m_min[i]);
        const div = document.createElement('div');
        div.className = 'day';
        div.innerHTML = `
            <span class="day-label">${dayAbbrev(daily.time[i])}</span>
            <span class="day-icon">${info.icon}</span>
            <span class="day-temp">${tmax}°<span class="day-temp-min">/${tmin}°</span></span>
            <span class="day-rain">💧 ${(daily.precipitation_sum[i] || 0).toFixed(1)}mm</span>
        `;
        container.appendChild(div);
    }
}

function stressLabel(val) {
    const v = parseFloat(val);
    if (v >= 0.7) return '<span class="text-red">High</span>';
    if (v >= 0.4) return '<span class="text-orange">Medium</span>';
    return '<span class="text-green">Low</span>';
}

// ─── Main Fetch ───────────────────────────────────────────────
async function fetchDashboardData(lat, lon) {
    document.getElementById('data-loading').style.display = 'inline-block';

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,et0_fao_evapotranspiration` +
            `&hourly=soil_moisture_0_to_1cm` +
            `&past_days=30&forecast_days=7&timezone=auto`;

        const res  = await fetch(url);
        const data = await res.json();

        const dailyET        = data.daily.et0_fao_evapotranspiration;
        const hourlyMoisture = data.hourly.soil_moisture_0_to_1cm;
        const hourlyTime     = data.hourly.time;
        const dailyDates     = data.daily.time;

        // Daily average soil moisture
        const dailySM = dailyDates.map(date => {
            const vals = hourlyTime.reduce((acc, t, i) => {
                if (t.startsWith(date) && hourlyMoisture[i] != null) acc.push(hourlyMoisture[i]);
                return acc;
            }, []);
            return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0.2;
        });

        const past30Dates  = dailyDates.slice(0, 30);
        const past30Stress = past30Dates.map((_, i) => computeStressIndex(dailyET[i] || 0, dailySM[i] || 0.2));
        const stressLabels = past30Dates.map(d => d.slice(5));

        const recentPrecip    = data.daily.precipitation_sum.slice(0, 30).slice(-7).reduce((s, v) => s + (v || 0), 0);
        const recentET        = dailyET.slice(0, 30).slice(-7).reduce((s, v) => s + (v || 0), 0);
        const soilWaterBalance = Math.round(recentPrecip - recentET);
        const latestStress    = past30Stress[past30Stress.length - 1];

        // Gauge
        buildGaugeChart(soilWaterBalance);

        // Recs
        const rec = computeIrrigationRec(soilWaterBalance);
        document.getElementById('rec-action').innerHTML    = rec.action;
        document.getElementById('rec-action-sub').textContent = rec.sub;
        document.getElementById('rec-depth').innerHTML     = `<span class="icon">📏</span> ${rec.depth}`;
        document.getElementById('rec-duration').innerHTML  = `<span class="icon">⏱️</span> ${rec.duration}`;
        document.getElementById('rec-priority').innerHTML  = `<span class="icon">🎯</span> ${rec.priority}`;
        document.getElementById('rec-volume').innerHTML    = `<span class="icon">🌊</span> ${rec.volume}`;

        // Table
        const wS = Math.min(latestStress + 0.12, 1).toFixed(2);
        const rS = latestStress.toFixed(2);
        const cS = Math.max(latestStress - 0.15, 0).toFixed(2);
        document.getElementById('stress-wheat').textContent  = wS;
        document.getElementById('irr-wheat').innerHTML       = stressLabel(wS);
        document.getElementById('stress-rice').textContent   = rS;
        document.getElementById('irr-rice').innerHTML        = stressLabel(rS);
        document.getElementById('stress-cotton').textContent = cS;
        document.getElementById('irr-cotton').innerHTML      = stressLabel(cS);

        // Trend chart
        buildStressTrendChart(stressLabels, past30Stress);

        // Forecast (last 7 from the full array = actual next 7 days)
        const len = data.daily.time.length;
        const forecastSlice = {
            time:                data.daily.time.slice(len - 7),
            temperature_2m_max:  data.daily.temperature_2m_max.slice(len - 7),
            temperature_2m_min:  data.daily.temperature_2m_min.slice(len - 7),
            precipitation_sum:   data.daily.precipitation_sum.slice(len - 7),
            weather_code:        data.daily.weather_code.slice(len - 7)
        };
        renderForecast(forecastSlice);

    } catch (err) {
        console.error('Fetch error:', err);
        document.getElementById('data-loading').textContent = '⚠ Data error';
    }

    document.getElementById('data-loading').style.display = 'none';
}

// ─── Location Search (Nominatim) ─────────────────────────────
let debounceTimer;
document.getElementById('location-input').addEventListener('input', function () {
    clearTimeout(debounceTimer);
    const query = this.value.trim();
    const list  = document.getElementById('location-suggestions');
    if (query.length < 3) { list.innerHTML = ''; return; }

    debounceTimer = setTimeout(async () => {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const results = await res.json();
            list.innerHTML = '';
            results.forEach(r => {
                const li = document.createElement('li');
                li.textContent = r.display_name.split(',').slice(0, 3).join(', ');
                li.addEventListener('click', () => {
                    currentLat = parseFloat(r.lat);
                    currentLon = parseFloat(r.lon);
                    currentLocationName = r.display_name.split(',').slice(0, 2).join(', ');

                    document.getElementById('location-name').textContent  = currentLocationName;
                    document.getElementById('location-coords').textContent =
                        `${currentLat.toFixed(2)}°N, ${currentLon.toFixed(2)}°E`;
                    document.getElementById('location-input').value = '';
                    list.innerHTML = '';

                    // Update satellite maps to new location
                    initSatelliteMaps(currentLat, currentLon);
                    // Refresh weather data
                    fetchDashboardData(currentLat, currentLon);
                });
                list.appendChild(li);
            });
        } catch (e) { console.error('Geocoding error:', e); }
    }, 400);
});

// ─── Sidebar menu ─────────────────────────────────────────────
document.querySelectorAll('.menu-list li').forEach(item => {
    item.addEventListener('click', function () {
        const parentList = this.parentElement;
        parentList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        this.classList.add('active');
    });
});

// ─── Date ─────────────────────────────────────────────────────
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const now = new Date();
document.getElementById('current-date').textContent =
    `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

// ─── Boot ─────────────────────────────────────────────────────
initSatelliteMaps(currentLat, currentLon);
fetchDashboardData(currentLat, currentLon);
// Auto-refresh weather every 10 minutes
setInterval(() => fetchDashboardData(currentLat, currentLon), 600000);
