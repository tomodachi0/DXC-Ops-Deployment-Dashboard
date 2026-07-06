const apiBase = 'http://localhost:8000/api';
const state = {
  services: [],
  deployments: [],
  incidents: [],
  summary: null,
  currentEnvironment: 'all',
  currentPanel: 'overview-panel',
  charts: {},
  lastSynced: null,
};

const elements = {
  pageTitle: document.getElementById('page-title'),
  envFilter: document.getElementById('environment-filter'),
  liveClock: document.getElementById('live-clock'),
  syncedIndicator: document.getElementById('synced-indicator'),
  serviceGrid: document.getElementById('service-grid'),
  recentDeployments: document.getElementById('recent-deployments'),
  recentIncidents: document.getElementById('recent-incidents'),
  servicesList: document.getElementById('services-list'),
  deploymentsTableBody: document.getElementById('deployments-table-body'),
  incidentsTableBody: document.getElementById('incidents-table-body'),
  deployEnvFilter: document.getElementById('deploy-env-filter'),
  deployStatusFilter: document.getElementById('deploy-status-filter'),
  openDeployForm: document.getElementById('open-deploy-form'),
  deployModalBackdrop: document.getElementById('deploy-modal-backdrop'),
  closeDeployModal: document.getElementById('close-deploy-modal'),
  cancelDeploy: document.getElementById('cancel-deploy'),
  deployForm: document.getElementById('deploy-form'),
  deployServiceSelect: document.getElementById('deploy-service-select'),
  deployVersion: document.getElementById('deploy-version'),
  deployEnvironment: document.getElementById('deploy-environment'),
  drawer: document.getElementById('service-drawer'),
  drawerServiceName: document.getElementById('drawer-service-name'),
  drawerServiceEnvironment: document.getElementById('drawer-service-environment'),
  cpuFill: document.getElementById('cpu-fill'),
  memoryFill: document.getElementById('memory-fill'),
  serviceLogConsole: document.getElementById('service-log-console'),
  closeDrawer: document.getElementById('close-drawer'),
  errorBanner: document.getElementById('error-banner'),
};

function init() {
  setupNavigation();
  setupFilters();
  setupDeployForm();
  setupDrawer();
  updateClock();
  loadInitialData();
  setInterval(updateClock, 1000);
  setInterval(refreshLiveData, 25000);
}

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.classList.contains('disabled')) return;
      document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      setPanel(button.dataset.panel);
    });
  });
}

function setupFilters() {
  elements.envFilter.addEventListener('change', async () => {
    state.currentEnvironment = elements.envFilter.value;
    await loadOverviewData();
    if (state.currentPanel === 'services-panel') {
      await loadServicesData();
    }
    if (state.currentPanel === 'incidents-panel') {
      renderIncidentsTable();
    }
  });

  elements.deployEnvFilter.addEventListener('change', loadDeploymentsData);
  elements.deployStatusFilter.addEventListener('change', loadDeploymentsData);
}

function setupDeployForm() {
  elements.openDeployForm.addEventListener('click', openDeployModal);
  elements.closeDeployModal.addEventListener('click', closeDeployModal);
  elements.cancelDeploy.addEventListener('click', closeDeployModal);
  elements.deployModalBackdrop.addEventListener('click', (event) => {
    if (event.target === elements.deployModalBackdrop) {
      closeDeployModal();
    }
  });
  elements.deployForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitDeployment();
  });
}

function setupDrawer() {
  elements.closeDrawer.addEventListener('click', () => {
    elements.drawer.classList.remove('open');
  });
}

function setPanel(panelId) {
  state.currentPanel = panelId;
  elements.pageTitle.textContent = panelId.replace('-panel', '').replace(/-/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
  if (panelId === 'overview-panel') {
    loadOverviewData();
  }
  if (panelId === 'services-panel') {
    loadServicesData();
  }
  if (panelId === 'deployments-panel') {
    loadDeploymentsData();
  }
  if (panelId === 'incidents-panel') {
    loadIncidentsData();
  }
  if (panelId === 'monitoring-panel') {
    loadMonitoringData();
  }
}

function updateClock() {
  const now = new Date();
  elements.liveClock.textContent = now.toLocaleTimeString([], { hour12: false });
  if (state.lastSynced) {
    const secondsAgo = Math.floor((Date.now() - state.lastSynced) / 1000);
    elements.syncedIndicator.textContent = secondsAgo < 5 ? 'synced just now' : `synced ${secondsAgo}s ago`;
  }
}

async function loadInitialData() {
  showLoadingSelectors();
  await Promise.all([loadOverviewData(), loadServicesData(), loadDeploymentsData(), loadIncidentsData()]);
  await loadMonitoringData();
}

async function refreshLiveData() {
  try {
    const [summary, services] = await Promise.all([fetchSummary(), fetchServices()]);
    if (summary) {
      highlightIfChanged('avg_uptime', summary.avg_uptime, state.summary?.avg_uptime);
      highlightIfChanged('active_services', summary.active_services, state.summary?.active_services);
      highlightIfChanged('deployments', summary.deployments_today, state.summary?.deployments_today);
      highlightIfChanged('incidents', summary.open_incidents, state.summary?.open_incidents);
      state.summary = summary;
      renderSummary();
    }
    if (services) {
      state.services = services;
      if (state.currentPanel === 'overview-panel') {
        renderServiceGrid();
      }
      if (state.currentPanel === 'services-panel') {
        renderServicesList();
      }
      if (state.currentPanel === 'monitoring-panel') {
        renderMonitoringCharts();
      }
    }
    state.lastSynced = Date.now();
    updateClock();
  } catch (error) {
    showError(error.message || 'Live refresh failed');
  }
}

function showLoadingSelectors() {
  document.querySelectorAll('.loading').forEach((element) => element.classList.add('loading'));
}

function hideLoadingSelectors() {
  document.querySelectorAll('.loading').forEach((element) => element.classList.remove('loading'));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load data from ${url}`);
  }
  return await response.json();
}

async function fetchSummary() {
  return await fetchJson(`${apiBase}/metrics/summary`);
}

async function fetchServices() {
  const url = state.currentEnvironment === 'all' ? `${apiBase}/services` : `${apiBase}/services?environment=${state.currentEnvironment}`;
  return await fetchJson(url);
}

async function fetchDeployments() {
  const filters = [];
  const envValue = elements.deployEnvFilter.value;
  const statusValue = elements.deployStatusFilter.value;
  if (envValue && envValue !== 'all') filters.push(`environment=${envValue}`);
  if (statusValue && statusValue !== 'all') filters.push(`status=${statusValue}`);
  const query = filters.length ? `?${filters.join('&')}` : '';
  return await fetchJson(`${apiBase}/deployments${query}`);
}

async function fetchDeploymentsOverview() {
  const envValue = state.currentEnvironment;
  const query = envValue && envValue !== 'all' ? `?environment=${envValue}` : '';
  return await fetchJson(`${apiBase}/deployments${query}`);
}

async function fetchIncidents() {
  return await fetchJson(`${apiBase}/incidents`);
}

async function loadOverviewData() {
  try {
    const [summary, services, deployments, incidents] = await Promise.all([
      fetchSummary(),
      fetchServices(),
      fetchDeploymentsOverview(),
      fetchIncidents(),
    ]);
    state.summary = summary;
    state.services = services;
    state.deployments = deployments;
    state.incidents = incidents;
    state.lastSynced = Date.now();
    renderSummary();
    renderServiceGrid();
    renderRecentDeployments();
    renderRecentIncidents();
    hideLoadingSelectors();
  } catch (error) {
    showError(error.message || 'Unable to load overview');
  }
}

async function loadServicesData() {
  try {
    state.services = await fetchServices();
    renderServicesList();
    populateDeployServiceOptions();
  } catch (error) {
    showError(error.message || 'Unable to load services');
  }
}

async function loadDeploymentsData() {
  try {
    const deployments = await fetchDeployments();
    state.deployments = deployments;
    renderDeploymentsTable();
    renderMonitoringCharts();
  } catch (error) {
    showError(error.message || 'Unable to load deployments');
  }
}

async function loadIncidentsData() {
  try {
    state.incidents = await fetchIncidents();
    renderIncidentsTable();
  } catch (error) {
    showError(error.message || 'Unable to load incidents');
  }
}

async function loadMonitoringData() {
  try {
    if (!state.services.length) {
      state.services = await fetchServices();
    }
    if (!state.deployments.length) {
      state.deployments = await fetchDeployments();
    }
    renderMonitoringCharts();
  } catch (error) {
    showError(error.message || 'Unable to load monitoring');
  }
}

function renderSummary() {
  if (!state.summary) return;
  document.querySelector('[data-card="uptime"] .card-value').textContent = `${state.summary.avg_uptime.toFixed(2)}%`;
  document.querySelector('[data-card="services"] .card-value').textContent = state.summary.active_services;
  document.querySelector('[data-card="deployments"] .card-value').textContent = state.summary.deployments_today;
  document.querySelector('[data-card="incidents"] .card-value').textContent = state.summary.open_incidents;
}

function buildSparkline(latency) {
  const points = Array.from({ length: 8 }, (_, index) => {
    const variance = (index % 2 === 0 ? 1 : -1) * (Math.random() * 0.1 * latency);
    return Math.max(10, latency + variance);
  });
  const max = Math.max(...points);
  const svgPoints = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - (value / max) * 90;
      return `${x},${y}`;
    })
    .join(' ');

  return `<svg viewBox="0 0 100 100" class="sparkline"><polyline fill="none" stroke="#00C2B8" stroke-width="4" stroke-linecap="round" points="${svgPoints}"/></svg>`;
}

function renderServiceGrid() {
  const services = state.services;
  elements.serviceGrid.innerHTML = services
    .map((service) => {
      const statusClass = service.status === 'healthy' ? 'healthy' : service.status === 'degraded' ? 'degraded' : 'down';
      return `
        <article class="card service-card" data-service-id="${service.id}">
          <div class="card-header">
            <div>
              <p class="muted">${service.environment}</p>
              <h3>${service.name}</h3>
            </div>
            <span class="status-pill ${statusClass}">${service.status}</span>
          </div>
          <div class="metric-row">
            <div class="metric-tile"><p>Latency</p><strong>${service.latency_ms}ms</strong></div>
            <div class="metric-tile"><p>Uptime</p><strong>${service.uptime_percent}%</strong></div>
            <div class="metric-tile"><p>CPU</p><strong>${service.cpu_usage_percent}%</strong></div>
          </div>
          <div class="sparkline">${buildSparkline(service.latency_ms)}</div>
        </article>
      `;
    })
    .join('');

  elements.serviceGrid.querySelectorAll('.service-card').forEach((card) => {
    card.addEventListener('click', () => {
      openServiceDrawer(Number(card.dataset.serviceId));
    });
  });
}

function renderRecentDeployments() {
  const deployments = state.deployments
    .filter((deployment) => state.currentEnvironment === 'all' || deployment.environment === state.currentEnvironment)
    .slice(0, 6);
  elements.recentDeployments.innerHTML = deployments
    .map((deployment) => {
      return `
        <article class="recent-item">
          <p class="line-1"><strong>${deployment.service_name}</strong> ${deployment.version}</p>
          <p class="line-2">${deployment.environment} · ${deployment.status} · ${deployment.duration_seconds}s</p>
        </article>
      `;
    })
    .join('');
}

function renderRecentIncidents() {
  const incidents = state.incidents
    .filter((incident) => state.currentEnvironment === 'all' || incident.service_environment === state.currentEnvironment)
    .slice(0, 4);
  elements.recentIncidents.innerHTML = incidents
    .map((incident) => {
      const badgeClass = incident.severity === 'critical' ? 'error' : incident.severity === 'high' ? 'warning' : 'success';
      return `
        <article class="recent-item">
          <p class="line-1"><strong>${incident.title}</strong></p>
          <p class="line-2">${incident.service_name} · ${incident.severity}</p>
        </article>
      `;
    })
    .join('');
}

function renderServicesList() {
  const services = state.services;
  elements.servicesList.innerHTML = services
    .map((service) => {
      const statusClass = service.status === 'healthy' ? 'healthy' : service.status === 'degraded' ? 'degraded' : 'down';
      return `
        <article class="card service-card" data-service-id="${service.id}">
          <div class="card-header">
            <div>
              <p class="muted">${service.environment}</p>
              <h3>${service.name}</h3>
            </div>
            <span class="status-pill ${statusClass}">${service.status}</span>
          </div>
          <div class="metric-row">
            <div class="metric-tile"><p>Latency</p><strong>${service.latency_ms}ms</strong></div>
            <div class="metric-tile"><p>Uptime</p><strong>${service.uptime_percent}%</strong></div>
            <div class="metric-tile"><p>Memory</p><strong>${service.memory_usage_percent}%</strong></div>
          </div>
        </article>
      `;
    })
    .join('');

  elements.servicesList.querySelectorAll('.service-card').forEach((card) => {
    card.addEventListener('click', () => openServiceDrawer(Number(card.dataset.serviceId)));
  });
  populateDeployServiceOptions();
}

function renderDeploymentsTable() {
  elements.deploymentsTableBody.innerHTML = state.deployments
    .map((deployment) => {
      const statusClass = deployment.status === 'success' ? 'success' : deployment.status === 'failed' ? 'error' : 'warning';
      return `
        <tr>
          <td>${deployment.service_name}</td>
          <td>${deployment.version}</td>
          <td>${deployment.environment}</td>
          <td>${deployment.triggered_by}</td>
          <td>${deployment.duration_seconds}s</td>
          <td><span class="badge ${statusClass}">${deployment.status}</span></td>
          <td>${new Date(deployment.deployed_at).toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');
}

function renderIncidentsTable() {
  const rows = state.incidents
    .filter((incident) => state.currentEnvironment === 'all' || incident.service_environment === state.currentEnvironment)
    .map((incident) => {
      const severityClass = incident.severity === 'critical' ? 'error' : incident.severity === 'high' ? 'warning' : 'success';
      const statusClass = incident.status === 'resolved' ? 'success' : incident.status === 'investigating' ? 'warning' : 'error';
      return `
        <tr>
          <td>${incident.service_name}</td>
          <td>${incident.title}</td>
          <td><span class="badge ${severityClass}">${incident.severity}</span></td>
          <td><span class="badge ${statusClass}">${incident.status}</span></td>
          <td>${new Date(incident.opened_at).toLocaleDateString()}</td>
          <td>${incident.resolved_at ? new Date(incident.resolved_at).toLocaleDateString() : '—'}</td>
        </tr>
      `;
    })
    .join('');
  elements.incidentsTableBody.innerHTML = rows;
}

function renderMonitoringCharts() {
  const labels = state.services.map((service) => service.name);
  const latencies = state.services.map((service) => service.latency_ms);
  const statusCounts = { healthy: 0, degraded: 0, down: 0 };
  state.services.forEach((service) => {
    statusCounts[service.status] = (statusCounts[service.status] || 0) + 1;
  });

  const deploymentsByDay = buildDeploymentsByDay();

  renderChart('latency-chart', 'bar', {
    labels,
    datasets: [
      {
        label: 'Latency (ms)',
        data: latencies,
        backgroundColor: 'rgba(0, 194, 184, 0.85)',
      },
    ],
  });

  renderChart('status-chart', 'doughnut', {
    labels: ['Healthy', 'Degraded', 'Down'],
    datasets: [
      {
        data: [statusCounts.healthy, statusCounts.degraded, statusCounts.down],
        backgroundColor: ['#1B8A5A', '#E6A400', '#D8402A'],
      },
    ],
  });

  renderChart('deployments-chart', 'line', {
    labels: deploymentsByDay.labels,
    datasets: [
      {
        label: 'Deployments',
        data: deploymentsByDay.values,
        borderColor: '#00C2B8',
        backgroundColor: 'rgba(0, 194, 184, 0.2)',
        tension: 0.3,
        fill: true,
      },
    ],
  });
}

function renderChart(canvasId, type, configData) {
  const context = document.getElementById(canvasId).getContext('2d');
  if (state.charts[canvasId]) {
    state.charts[canvasId].data = configData;
    state.charts[canvasId].update();
    return;
  }
  state.charts[canvasId] = new Chart(context, {
    type,
    data: configData,
    options: {
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { ticks: { color: '#d9d9d9' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#d9d9d9' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
      },
    },
  });
}

function buildDeploymentsByDay() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().split('T')[0];
  });
  const values = days.map((day) => state.deployments.filter((deploy) => deploy.deployed_at.startsWith(day)).length);
  return { labels: days.map((value) => new Date(value).toLocaleDateString()), values };
}

async function openServiceDrawer(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  elements.drawerServiceName.textContent = service.name;
  elements.drawerServiceEnvironment.textContent = `${service.environment} • ${service.status}`;
  elements.cpuFill.style.width = `${service.cpu_usage_percent}%`;
  elements.memoryFill.style.width = `${service.memory_usage_percent}%`;
  elements.drawer.classList.add('open');
  elements.serviceLogConsole.innerHTML = '<p class="muted">Loading logs...</p>';
  try {
    const logs = await fetchJson(`${apiBase}/services/${serviceId}/logs`);
    elements.serviceLogConsole.innerHTML = logs
      .map((log) => {
        const logClass = log.level.toLowerCase();
        return `<p class="log-line ${logClass}">${log.logged_at} [${log.level}] ${log.message}</p>`;
      })
      .join('');
  } catch (error) {
    elements.serviceLogConsole.innerHTML = `<p class="muted">Unable to load logs.</p>`;
  }
}

function openDeployModal() {
  elements.deployModalBackdrop.classList.remove('hidden');
}

function closeDeployModal() {
  elements.deployModalBackdrop.classList.add('hidden');
}

function populateDeployServiceOptions() {
  const options = state.services
    .map((service) => `<option value="${service.id}">${service.name} (${service.environment})</option>`)
    .join('');
  if (options) {
    elements.deployServiceSelect.innerHTML = options;
  }
}

async function submitDeployment() {
  try {
    const payload = {
      service_id: Number(elements.deployServiceSelect.value),
      version: elements.deployVersion.value,
      environment: elements.deployEnvironment.value,
    };
    await fetch(`${apiBase}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeDeployModal();
    await loadDeploymentsData();
    if (state.currentPanel === 'overview-panel') {
      await loadOverviewData();
    }
  } catch (error) {
    showError('Deployment failed.');
  }
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.remove('hidden');
  setTimeout(() => {
    elements.errorBanner.classList.add('hidden');
  }, 5000);
}

function highlightIfChanged(card, newValue, oldValue) {
  if (oldValue === undefined || newValue === oldValue) return;
  const element = document.querySelector(`[data-card="${card}"]`);
  if (!element) return;
  element.classList.add('flash');
  setTimeout(() => element.classList.remove('flash'), 800);
}

init();
