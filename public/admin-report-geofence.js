(() => {
  let map;
  const status = document.querySelector('#report-media-geofence-status');
  const error = document.querySelector('#report-media-map-error');
  const container = document.querySelector('#report-media-map');

  window.clearReportGeofence = () => {
    if (map) map.remove();
    map = undefined;
    container.classList.add('hidden');
    status.textContent = '';
    status.className = '';
    error.textContent = '';
  };

  window.showReportGeofence = (data) => {
    window.clearReportGeofence();
    status.textContent = data.inside === null
      ? 'Location unverified: this image has no readable embedded GPS. Device GPS and approximate report pins are not used.'
      : data.inside ? 'Inside the barangay vicinity' : 'Outside the barangay vicinity';
    status.className = data.inside === null ? 'geofence-unknown' : data.inside ? 'geofence-inside' : 'geofence-outside';
    const detail = document.createElement('small');
    detail.textContent = ` Compared against ${data.boundary ? 'the current saved admin boundary' : 'the approximate 2-km vicinity (no polygon saved)'}. Photo GPS enforcement is ${data.enforceReportGeofence ? 'on' : 'off'}. This is a current check, not the boundary at submission time.`;
    status.append(detail);
    if (!window.L) {
      error.textContent = 'The map library could not load. Check your connection and reload.';
      return;
    }
    container.classList.remove('hidden');
    map = L.map(container, { zoomAnimation: false, fadeAnimation: false }).setView([data.legacyVicinity.center.latitude, data.legacyVicinity.center.longitude], 14);
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    });
    for (const layer of [streets, satellite]) {
      layer.on('tileerror', () => { error.textContent = 'Map tiles could not load. Check your connection or switch layers.'; });
    }
    streets.addTo(map);
    L.control.layers({ Map: streets, Satellite: satellite }, null, { collapsed: false }).addTo(map);
    map.on('baselayerchange', () => { error.textContent = ''; });
    const vicinity = data.boundary
      ? L.polygon(data.boundary.map(point => [point.latitude, point.longitude]), { color: '#147044', fillOpacity: 0.12 })
      : L.circle([data.legacyVicinity.center.latitude, data.legacyVicinity.center.longitude], {
        radius: data.legacyVicinity.radiusMeters, color: '#a86c14', dashArray: '6 6',
      });
    vicinity.addTo(map);
    const bounds = vicinity.getBounds();
    if (data.location) {
      const { latitude, longitude } = data.location;
      L.marker([latitude, longitude]).addTo(map).bindTooltip('GPS embedded in this photo');
      bounds.extend([latitude, longitude]);
    }
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [25, 25], maxZoom: 17 });
  };
})();
