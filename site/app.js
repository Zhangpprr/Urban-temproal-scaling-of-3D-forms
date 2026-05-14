// =========================
// Global state
// =========================
let selectedLayer = null;
let cityLayer = null;
let currentProps = null;
let currentMode = 'static';
const plotlyCache = new Map();

const NO_DATA_COLOR = '#bdbdbd';

// Same logical order as the Python code:
// signs = [">", "=", "<"]
// [(a, v) for a in signs for v in signs]
const REGIME_KEY_ORDER = [
  'A>_V>',
  'A>_V=',
  'A>_V<',
  'A=_V>',
  'A=_V=',
  'A=_V<',
  'A<_V>',
  'A<_V=',
  'A<_V<'
];

// =========================
// Helpers
// =========================
function fmt2(x) {
  if (x === null || x === undefined || x === '' || Number.isNaN(Number(x))) {
    return '-';
  }
  return Number(x).toFixed(2);
}

function regimeLabelFromKey(key) {
  if (!key || key === 'No data') {
    return 'No data';
  }

  const m = key.match(/^A([<>=])_V([<>=])$/);
  if (!m) {
    return key;
  }

  const relA = m[1];
  const relV = m[2];

  return `βA ${relA} 1, βV ${relV} 1`;
}

function cityColorFromProps(props) {
  return props.color || props.regime_color || NO_DATA_COLOR;
}

// =========================
// Map
// =========================
const cityRenderer = L.canvas({
  padding: 0.5,
  tolerance: 10   // makes points easier to click
});

const map = L.map('map', {
  worldCopyJump: true,
  zoomControl: true,
  attributionControl: false,
  preferCanvas: true,
  renderer: cityRenderer
}).setView([20, 10], 2);

// =========================
// Point styles
// =========================
const DEFAULT_RADIUS = 4;
const SELECTED_RADIUS = 7;

function defaultPointStyle(feature) {
  const p = feature.properties || {};

  return {
    renderer: cityRenderer,
    radius: DEFAULT_RADIUS,
    fillColor: cityColorFromProps(p),
    color: '#4d4d4d',
    weight: 0.6,
    opacity: 1,
    fillOpacity: 0.95,
    bubblingMouseEvents: false
  };
}

function resetLayerStyle(layer) {
  const p = layer.feature.properties || {};

  layer.setStyle({
    radius: DEFAULT_RADIUS,
    fillColor: cityColorFromProps(p),
    color: '#4d4d4d',
    weight: 0.6,
    opacity: 1,
    fillOpacity: 0.95
  });
}

function selectLayer(layer) {
  if (selectedLayer && selectedLayer !== layer) {
    resetLayerStyle(selectedLayer);
  }

  selectedLayer = layer;

  layer.setStyle({
    radius: SELECTED_RADIUS,
    color: '#000000',
    weight: 1.2,
    opacity: 1,
    fillOpacity: 1
  });

  if (layer.bringToFront) {
    layer.bringToFront();
  }
}

function clearSelection() {
  if (selectedLayer) {
    resetLayerStyle(selectedLayer);
    selectedLayer = null;
  }
}

// =========================
// Right panel info
// =========================
function updateInfo(props) {
  currentProps = props;

  document.getElementById('city-name').textContent = props.city || 'Unknown city';
  document.getElementById('city-meta').textContent = props.country || '';

  document.getElementById('m-fid').textContent = props.fid ?? '-';
  document.getElementById('m-betaA').textContent = fmt2(props.beta_A);
  document.getElementById('m-betaV').textContent = fmt2(props.beta_V);
  document.getElementById('m-betah').textContent = fmt2(props.beta_h);
  document.getElementById('m-npoints').textContent = props.n_points ?? '-';

  document.getElementById('city-plot').src = `plots/${props.fid}.svg`;

  if (currentMode === 'interactive') {
    loadPlotlyFigure(props.fid).catch(err => {
      console.error(err);
      document.getElementById('plotly-plot').innerHTML =
        '<div style="padding:16px;color:#a00;">Failed to load interactive figure.</div>';
    });
  }
}

function clearInfo() {
  currentProps = null;

  document.getElementById('city-name').textContent = 'Select a city';
  document.getElementById('city-meta').textContent = '';

  document.getElementById('m-fid').textContent = '-';
  document.getElementById('m-betaA').textContent = '-';
  document.getElementById('m-betaV').textContent = '-';
  document.getElementById('m-betah').textContent = '-';
  document.getElementById('m-npoints').textContent = '-';

  document.getElementById('city-plot').src = 'assets/placeholder.svg';

  const plotDiv = document.getElementById('plotly-plot');
  plotDiv.innerHTML = '';

  if (window.Plotly) {
    Plotly.purge(plotDiv);
  }
}

// =========================
// Static / Interactive modes
// =========================
function setMode(mode) {
  currentMode = mode;

  const btnStatic = document.getElementById('btn-static');
  const btnInteractive = document.getElementById('btn-interactive');
  const img = document.getElementById('city-plot');
  const plotDiv = document.getElementById('plotly-plot');

  if (mode === 'static') {
    btnStatic.classList.add('active');
    btnInteractive.classList.remove('active');
    img.style.display = 'block';
    plotDiv.style.display = 'none';
  } else {
    btnStatic.classList.remove('active');
    btnInteractive.classList.add('active');
    img.style.display = 'none';
    plotDiv.style.display = 'block';

    if (currentProps) {
      loadPlotlyFigure(currentProps.fid).catch(err => {
        console.error(err);
        plotDiv.innerHTML =
          '<div style="padding:16px;color:#a00;">Failed to load interactive figure.</div>';
      });
    } else {
      plotDiv.innerHTML =
        '<div style="padding:16px;color:#666;">Select a city to view the interactive 3D figure.</div>';
    }
  }
}

// =========================
// Plotly 3D
// =========================
function renderPlotlyFigure(figData) {
  const plotDiv = document.getElementById('plotly-plot');

  const traces = [
    {
      type: 'scatter3d',
      mode: 'markers',
      x: figData.x,
      y: figData.y,
      z: figData.z,
      marker: {
        size: 4,
        color: 'rgb(31,119,180)',
        opacity: 0.8
      },
      text: figData.years.map(String),
      hovertemplate:
        'Year: %{text}<br>' +
        'log P: %{x:.2f}<br>' +
        'log A: %{y:.2f}<br>' +
        'log V: %{z:.2f}<extra></extra>',
      name: 'Observations'
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      x: figData.line3d.x,
      y: figData.line3d.y,
      z: figData.line3d.z,
      line: {
        color: 'black',
        width: 6
      },
      hoverinfo: 'skip',
      name: 'PC1'
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      x: figData.linePA.x,
      y: figData.linePA.y,
      z: figData.linePA.z,
      line: {
        color: 'rgba(120,120,120,0.8)',
        width: 4,
        dash: 'dash'
      },
      hoverinfo: 'skip',
      name: 'Projection on P-A'
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      x: figData.linePV.x,
      y: figData.linePV.y,
      z: figData.linePV.z,
      line: {
        color: 'rgba(120,120,120,0.8)',
        width: 4,
        dash: 'dash'
      },
      hoverinfo: 'skip',
      name: 'Projection on P-V'
    }
  ];

  const layout = {
    margin: { l: 0, r: 0, t: 10, b: 0 },
    showlegend: false,
    scene: {
      xaxis: {
        title: 'log P',
        range: figData.xr,
        backgroundcolor: 'rgba(245,245,245,1)',
        gridcolor: 'rgba(0,0,0,0.15)',
        zerolinecolor: 'rgba(0,0,0,0.15)'
      },
      yaxis: {
        title: 'log A',
        range: figData.yr,
        backgroundcolor: 'rgba(245,245,245,1)',
        gridcolor: 'rgba(0,0,0,0.15)',
        zerolinecolor: 'rgba(0,0,0,0.15)'
      },
      zaxis: {
        title: 'log V',
        range: figData.zr,
        backgroundcolor: 'rgba(245,245,245,1)',
        gridcolor: 'rgba(0,0,0,0.15)',
        zerolinecolor: 'rgba(0,0,0,0.15)'
      },
      camera: {
        eye: { x: -1.5, y: -1.6, z: 1.1 }
      },
      aspectmode: 'manual',
      aspectratio: { x: 1.25, y: 1.0, z: 1.0 },
      annotations: [
        {
          x: figData.xr[1],
          y: figData.yr[0],
          z: figData.zr[0],
          text: `β_A = ${figData.beta_A.toFixed(2)}`,
          showarrow: false,
          font: { size: 12, color: 'black' }
        },
        {
          x: figData.xr[0],
          y: figData.yr[1],
          z: figData.zr[1],
          text: `β_V = ${figData.beta_V.toFixed(2)}`,
          showarrow: false,
          font: { size: 12, color: 'black' }
        }
      ]
    }
  };

  const config = {
    responsive: true,
    displaylogo: false
  };

  Plotly.newPlot(plotDiv, traces, layout, config);
}

async function loadPlotlyFigure(fid) {
  const plotDiv = document.getElementById('plotly-plot');

  if (plotlyCache.has(fid)) {
    renderPlotlyFigure(plotlyCache.get(fid));
    return;
  }

  plotDiv.innerHTML = '<div style="padding:16px;">Loading interactive 3D...</div>';

  const resp = await fetch(`data/plotly/${fid}.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load Plotly JSON for fid=${fid}`);
  }

  const figData = await resp.json();
  plotlyCache.set(fid, figData);
  renderPlotlyFigure(figData);
}

// =========================
// City interactions
// =========================
function onEachCity(feature, layer) {
  const p = feature.properties || {};
  const regimeKey = p.regime_key || p.beta_group || 'No data';
  const regimeLabel = regimeLabelFromKey(regimeKey);

  layer.bindPopup(`
    <strong>${p.city || 'Unknown city'}</strong><br>
    ${p.country || ''}<br>
    beta_A = ${fmt2(p.beta_A)}<br>
    beta_V = ${fmt2(p.beta_V)}<br>
    beta_h = ${fmt2(p.beta_h)}<br>
    Regime: ${regimeLabel}
  `);

  layer.on('mouseover', () => {
    map.getContainer().style.cursor = 'pointer';
  });

  layer.on('mouseout', () => {
    map.getContainer().style.cursor = '';
  });

  layer.on('mousedown', (e) => {
    L.DomEvent.stopPropagation(e);
  });

  layer.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    selectLayer(layer);
    updateInfo(p);
    layer.openPopup();
  });
}

// Click blank map to clear selection
map.on('click', () => {
  clearSelection();
});

// =========================
// Legend
// =========================
function addLegend(cityData) {
  const counts = {};
  const colors = {};

  cityData.features.forEach(feature => {
    const p = feature.properties || {};
    const key = p.regime_key || p.beta_group || 'No data';

    if (!key || key === 'No data') {
      return;
    }

    counts[key] = (counts[key] || 0) + 1;
    colors[key] = p.regime_color || p.color || NO_DATA_COLOR;
  });

  const keys = Object.keys(counts).sort((a, b) => {
    const countDiff = counts[b] - counts[a];

    if (countDiff !== 0) {
      return countDiff;
    }

    const ia = REGIME_KEY_ORDER.indexOf(a);
    const ib = REGIME_KEY_ORDER.indexOf(b);

    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const legend = L.control({ position: 'bottomleft' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend-box');

    let rows = '';

    keys.forEach(key => {
      const label = regimeLabelFromKey(key);
      const color = colors[key] || NO_DATA_COLOR;
      const count = counts[key];

      rows += `
        <div class="beta-legend-row">
          <span class="beta-legend-swatch" style="background:${color};"></span>
          <span class="beta-legend-label">${label}</span>
        </div>
      `;
    });

    div.innerHTML = `
      <div class="legend-title">Beta regimes</div>
      ${rows}
    `;

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  legend.addTo(map);
}

// =========================
// Load base map + cities
// =========================
Promise.all([
  fetch('data/world.geojson').then(r => r.json()),
  fetch('data/cities.geojson?v=20260514').then(r => r.json())
]).then(([worldData, cityData]) => {

  L.geoJSON(worldData, {
    style: {
      color: '#ffffff',
      weight: 0.7,
      opacity: 1,
      fillColor: '#e3e3e3',
      fillOpacity: 1
    }
  }).addTo(map);

  cityLayer = L.geoJSON(cityData, {
    pointToLayer: (feature, latlng) => {
      return L.circleMarker(latlng, defaultPointStyle(feature));
    },
    onEachFeature: onEachCity
  }).addTo(map);

  const bounds = cityLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.05));
  }

  addLegend(cityData);
  clearInfo();
  setMode('static');

}).catch(err => {
  console.error('Failed to load GeoJSON:', err);
  clearInfo();
  setMode('static');
});

// =========================
// Mode button events
// =========================
document.getElementById('btn-static').addEventListener('click', () => {
  setMode('static');
});

document.getElementById('btn-interactive').addEventListener('click', () => {
  setMode('interactive');
});