(() => {
  const status = document.querySelector('#geofence-boundary-status');
  const feedback = document.querySelector('#geofence-editor-message');
  const editButton = document.querySelector('#geofence-edit');
  const editor = document.querySelector('#geofence-editor');
  let map;
  let drawing;
  let markers;
  let saved;
  let points = [];
  let editing = false;
  let saving = false;
  let sendRequest;

  function showFeedback(text, error = false) {
    feedback.textContent = text;
    feedback.classList.toggle('error', error);
  }

  function render() {
    drawing.clearLayers();
    markers.clearLayers();
    const latlngs = points.map((point) => [point.latitude, point.longitude]);
    if (points.length >= 3) L.polygon(latlngs, { color: '#147044', fillOpacity: 0.15 }).addTo(drawing);
    else if (points.length) L.polyline(latlngs, { color: '#147044' }).addTo(drawing);
    if (!editing && !saved.boundary) {
      L.circle([saved.legacyVicinity.center.latitude, saved.legacyVicinity.center.longitude], {
        radius: saved.legacyVicinity.radiusMeters, color: '#a86c14', dashArray: '6 6',
      }).addTo(drawing);
    }
    if (editing) points.forEach((point, index) => {
      const marker = L.marker([point.latitude, point.longitude], {
        draggable: !saving,
        icon: L.divIcon({ className: 'geofence-point', html: String(index + 1), iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: `Boundary point ${index + 1}`,
      }).addTo(markers);
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        points[index] = { latitude: position.lat, longitude: position.lng };
        render();
      });
    });
    status.textContent = editing
      ? `Unsaved drawing: ${points.length} boundary points.`
      : saved.boundary
        ? `Saved vicinity: ${points.length} boundary points. Revision ${saved.revision}.`
        : 'No polygon saved yet. The existing approximate 2-km circular vicinity remains active until you save a boundary.';
    document.querySelector('#geofence-save').disabled = saving || points.length < 3;
    document.querySelector('#geofence-undo').disabled = saving || !points.length;
    document.querySelector('#geofence-clear').disabled = saving || !points.length;
    editButton.disabled = editing;
  }

  function fitBoundary() {
    if (points.length >= 3) map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [25, 25], maxZoom: 17 });
    else map.setView([saved.legacyVicinity.center.latitude, saved.legacyVicinity.center.longitude], 14);
  }

  function addPoint(point) {
    if (!editing || saving) return;
    if (points.length >= 100) {
      showFeedback('Use no more than 100 boundary points.', true);
      return;
    }
    points.push(point);
    showFeedback('');
    render();
  }

  window.renderAdminGeofence = (settings, request) => {
    if (editing || saving) return;
    sendRequest = request;
    saved = settings;
    points = settings.boundary ? settings.boundary.map((point) => ({ ...point })) : [];
    if (!window.L) {
      status.textContent = 'The map library could not load. Check your internet connection and reload.';
      return;
    }
    if (!map) {
      map = L.map('geofence-map');
      const tileError = document.querySelector('#geofence-map-error');
      const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      });
      for (const layer of [streets, satellite]) {
        layer.on('tileerror', () => { tileError.textContent = 'Some map tiles could not load. Check your connection or switch Map/Satellite layers.'; });
      }
      streets.addTo(map);
      L.control.layers({ Map: streets, Satellite: satellite }, null, { collapsed: false }).addTo(map);
      map.on('baselayerchange', () => { tileError.textContent = ''; });
      drawing = L.layerGroup().addTo(map);
      markers = L.layerGroup().addTo(map);
      map.on('click', (event) => addPoint({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      new ResizeObserver(() => map.invalidateSize()).observe(document.querySelector('#geofence-map'));
    }
    render();
    editButton.disabled = false;
    fitBoundary();
  };

  editButton.addEventListener('click', () => {
    editing = true;
    editor.hidden = false;
    showFeedback('Drawing mode enabled. Add or drag points, then save.');
    render();
  });
  document.querySelector('#geofence-add').addEventListener('click', () => {
    const latitude = document.querySelector('#geofence-latitude');
    const longitude = document.querySelector('#geofence-longitude');
    if (!latitude.value || !longitude.value || !latitude.checkValidity() || !longitude.checkValidity()) {
      showFeedback('Enter a latitude from -90 to 90 and a longitude from -180 to 180.', true);
      return;
    }
    addPoint({ latitude: Number(latitude.value), longitude: Number(longitude.value) });
  });
  document.querySelector('#geofence-undo').addEventListener('click', () => { points.pop(); render(); });
  document.querySelector('#geofence-clear').addEventListener('click', () => { points = []; render(); });
  document.querySelector('#geofence-cancel').addEventListener('click', () => {
    editing = false;
    editor.hidden = true;
    showFeedback('Drawing discarded. Saved vicinity unchanged.');
    window.renderAdminGeofence(saved, sendRequest);
  });
  document.querySelector('#geofence-save').addEventListener('click', async () => {
    if (saving || points.length < 3) return;
    if (!window.confirm('Save this vicinity for checking new report photos? Confirm its boundary with barangay officials before saving.')) return;
    saving = true;
    editor.querySelectorAll('button, input').forEach((element) => { element.disabled = true; });
    render();
    try {
      const result = await sendRequest('/settings/report-geofence/boundary', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary: points, expectedRevision: saved.revision }),
      });
      saved = { ...saved, ...result };
      editing = false;
      editor.hidden = true;
      showFeedback('Boundary saved. All 3 photo locations will be checked against this vicinity when enforcement is enabled.');
    } catch (error) {
      showFeedback(`${error.message} Your drawing has not been saved. Cancel and reload to retrieve the latest saved boundary.`, true);
    } finally {
      saving = false;
      editor.querySelectorAll('button, input').forEach((element) => { element.disabled = false; });
      render();
    }
  });
})();
