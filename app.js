// ============================================================
//  HotelXplore – app.js
//  OpenStreetMap + Overpass API (FREE – No API key needed!)
// ============================================================

let map = null;
let markers = [];
let currentLat = null;
let currentLon = null;
let currentType = 'hotel';

// Overpass amenity tags for each category
const TYPE_CONFIG = {
  hotel:      { amenity: 'hotel',              icon: '🏨', label: 'Hotel',        badge: 'Accommodation' },
  tourist:    { amenity: 'tourist_attraction', icon: '🗺️', label: 'Tourist Spot', badge: 'Tourism' },
  restaurant: { amenity: 'restaurant',         icon: '🍽️', label: 'Restaurant',   badge: 'Food & Drink' },
};

// ── DOM refs ──────────────────────────────────────────────
const cityInput     = document.getElementById('cityInput');
const searchBtn     = document.getElementById('searchBtn');
const locationBtn   = document.getElementById('locationBtn');
const loader        = document.getElementById('loader');
const resultsSection= document.getElementById('resultsSection');
const resultsTitle  = document.getElementById('resultsTitle');
const resultsGrid   = document.getElementById('resultsGrid');
const mapContainer  = document.getElementById('mapContainer');
const noResults     = document.getElementById('noResults');
const filterTabs    = document.getElementById('filterTabs');

// ── Events ────────────────────────────────────────────────
searchBtn.addEventListener('click', () => {
  const city = cityInput.value.trim();
  if (!city) { alert('Shahar ka naam likhein!'); return; }
  geocodeCity(city);
});

cityInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') searchBtn.click();
});

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Aapka browser location support nahi karta.'); return; }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentLat = pos.coords.latitude;
      currentLon = pos.coords.longitude;
      showFilters();
      fetchPlaces(currentLat, currentLon, currentType);
    },
    () => { hideLoader(); alert('Location access nahi mila. Please allow karein.'); }
  );
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentType = tab.dataset.type;
    if (currentLat && currentLon) {
      showLoader();
      fetchPlaces(currentLat, currentLon, currentType);
    }
  });
});

// ── Geocode city name → lat/lon via Nominatim ─────────────
async function geocodeCity(cityName) {
  showLoader();
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'hi,en' } });
    const data = await res.json();
    if (!data.length) { hideLoader(); showNoResults(); return; }
    currentLat = parseFloat(data[0].lat);
    currentLon = parseFloat(data[0].lon);
    cityInput.value = data[0].display_name.split(',')[0];
    showFilters();
    fetchPlaces(currentLat, currentLon, currentType);
  } catch (err) {
    hideLoader();
    alert('Network error. Internet connection check karein.');
  }
}

// ── Fetch places via Overpass API ─────────────────────────
async function fetchPlaces(lat, lon, type) {
  const cfg = TYPE_CONFIG[type];
  const radius = 5000; // 5km radius

  let query = '';
  if (type === 'tourist') {
    query = `
      [out:json][timeout:25];
      (
        node["tourism"="attraction"](around:${radius},${lat},${lon});
        way["tourism"="attraction"](around:${radius},${lat},${lon});
      );
      out body 30;
    `;
  } else {
    query = `
      [out:json][timeout:25];
      (
        node["amenity"="${cfg.amenity}"](around:${radius},${lat},${lon});
        way["amenity"="${cfg.amenity}"](around:${radius},${lat},${lon});
      );
      out body 30;
    `;
  }

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await res.json();
    hideLoader();
    renderResults(data.elements, cfg, lat, lon);
  } catch (err) {
    hideLoader();
    alert('Data load nahi hua. Thodi der baad try karein.');
  }
}

// ── Render result cards + map ──────────────────────────────
function renderResults(elements, cfg, centerLat, centerLon) {
  // Filter elements that have a name
  const places = elements.filter(el => el.tags && el.tags.name);

  resultsGrid.innerHTML = '';

  if (!places.length) { showNoResults(); return; }

  hideNoResults();
  resultsSection.style.display = 'block';
  mapContainer.style.display = 'block';

  const titleMap = { hotel: 'Hotels', tourist: 'Tourist Places', restaurant: 'Restaurants' };
  resultsTitle.textContent = `${cfg.icon} ${titleMap[currentType]} – ${places.length} jagah mili (5km ke andar)`;

  // Init / reset map
  if (!map) {
    map = L.map('map').setView([centerLat, centerLon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([centerLat, centerLon], 13);
    markers.forEach(m => m.remove());
    markers = [];
  }

  // Center marker
  const centerMarker = L.marker([centerLat, centerLon]).addTo(map)
    .bindPopup('<b>📍 Aapki Location</b>');
  markers.push(centerMarker);

  places.slice(0, 30).forEach((el, i) => {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    const tags = el.tags || {};
    const name = tags.name || 'Naam Nahi';
    const address = [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ') || 'Address available nahi';
    const phone = tags.phone || tags['contact:phone'] || null;
    const website = tags.website || tags['contact:website'] || null;
    const stars = tags.stars ? '⭐'.repeat(Math.min(parseInt(tags.stars), 5)) : '';

    // Distance
    let distText = '';
    if (lat && lon) {
      const d = getDistanceKm(centerLat, centerLon, lat, lon);
      distText = d < 1 ? `${Math.round(d * 1000)}m door` : `${d.toFixed(1)}km door`;
    }

    // Card
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${i * 0.04}s`;
    card.innerHTML = `
      <div class="card-icon">${cfg.icon}</div>
      <span class="badge">${cfg.badge}</span>
      ${stars ? `<div class="card-stars">${stars}</div>` : ''}
      <h3>${name}</h3>
      <p>📍 ${address}</p>
      ${distText ? `<p style="color:var(--green);margin-top:0.3rem">🚶 ${distText}</p>` : ''}
      ${phone ? `<p style="margin-top:0.3rem">📞 <a href="tel:${phone}" style="color:var(--accent2)">${phone}</a></p>` : ''}
      ${website ? `<p style="margin-top:0.3rem"><a href="${website}" target="_blank" class="map-link">🌐 Website</a></p>` : ''}
      ${lat && lon ? `<a class="map-link" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank">🗺️ Map par dekho</a>` : ''}
    `;
    resultsGrid.appendChild(card);

    // Map marker
    if (lat && lon) {
      const marker = L.marker([lat, lon]).addTo(map)
        .bindPopup(`<b>${cfg.icon} ${name}</b><br>${address}`);
      markers.push(marker);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function showLoader() {
  loader.style.display = 'block';
  resultsSection.style.display = 'none';
  mapContainer.style.display = 'none';
  noResults.style.display = 'none';
}
function hideLoader() { loader.style.display = 'none'; }
function showFilters() { filterTabs.style.display = 'flex'; }
function showNoResults() { noResults.style.display = 'block'; resultsSection.style.display = 'none'; mapContainer.style.display = 'none'; }
function hideNoResults() { noResults.style.display = 'none'; }
