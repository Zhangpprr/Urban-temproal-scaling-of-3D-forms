const BIVAR_COLORS = {
  "0-0": "#f2f2f2",
  "1-0": "#9ecae1",
  "2-0": "#2171b5",
  "0-1": "#f4a6a6",
  "1-1": "#bcbddc",
  "2-1": "#756bb1",
  "0-2": "#e31a1c",
  "1-2": "#c51b8a",
  "2-2": "#000000"
};

// =========================
// Global state
// =========================
let selectedLayer = null;
let cityLayer = null;
let currentProps = null;
let currentMode = 'static';
const plotlyCache = new Map();

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
  return {
    renderer: cityRenderer,
    radius: DEFAULT_RADIUS,
    fillColor: feature.properties.color || '#666666',
    color: '#4d4d4d',
    weight: 0.6,
    opacity: 1,
    fillOpacity: 0.95,
    bubblingMouseEvents: false
  };
}

function resetLayerStyle(layer) {
  const p = layer.feature.properties;
  layer.setStyle({
    radius: DEFAULT_RADIUS,
    fillColor: p.color || '#666666',
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
  document.getElementById('m-betaA').textContent =
    props.beta_A != null ? Number(props.beta_A).toFixed(2) : '-';
  document.getElementById('m-betaV').textContent =
    props.beta_V != null ? Number(props.beta_V).toFixed(2) : '-';
  document.getElementById('m-betah').textContent =
    props.beta_h != null ? Number(props.beta_h).toFixed(2) : '-';
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
  const p = feature.properties;

  layer.bindPopup(`
    <strong>${p.city}</strong><br>
    ${p.country}<br>
    beta_A = ${Number(p.beta_A).toFixed(2)}<br>
    beta_V = ${Number(p.beta_V).toFixed(2)}<br>
    beta_h = ${Number(p.beta_h).toFixed(2)}
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
function addLegend() {
  const legend = L.control({ position: 'bottomleft' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend-box');

    const yOrder = [2, 1, 0];
    const xOrder = [0, 1, 2];

    let gridHTML = '<div class="bivar-legend-grid">';
    for (const h of yOrder) {
      for (const a of xOrder) {
        const color = BIVAR_COLORS[`${a}-${h}`];
        gridHTML += `<div style="width:18px;height:18px;background:${color};border:1px solid #ffffff;"></div>`;
      }
    }
    gridHTML += '</div>';

    div.innerHTML = `
      <div class="legend-y-wrap">
        <div class="legend-y legend-labels">Higher beta_h</div>
        <div>
          ${gridHTML}
          <div class="legend-x legend-labels">Higher beta_A →</div>
        </div>
      </div>
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
  fetch('data/cities.geojson').then(r => r.json())
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

  addLegend();
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