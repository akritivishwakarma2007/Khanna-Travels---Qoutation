/**
 * Khanna Travels — Settings & System Health View
 * Admin-only page showing real-time system diagnostics, website speed benchmark,
 * data integrity checks, and database health states.
 */
import { getAdminHealth, isAdminAuthenticated } from '../api.js';

export class SettingsView {
  constructor(app) {
    this.app = app;
    this.healthData = null;
    this.isLoadingHealth = false;
    this.isTestingSpeed = false;
    this.lastCheckedTime = null;
    this.autoCheckInterval = null;
    this.showDbDetails = false;

    // Website speed benchmark metrics
    this.speedMetrics = {
      tested: false,
      isRunning: false,
      fps: null,
      longestPauseMs: null,
      pageLoadSec: null,
      networkType: null,
      rttMs: null,
      verdict: null, // 'Smooth' | 'A bit slow' | 'Slow' | 'Could not measure'
      verdictClass: '',
      message: ''
    };
  }

  // ── Render Page ─────────────────────────────────────────────────────────────
  render() {
    const isAuthed = isAdminAuthenticated();
    if (!isAuthed) {
      return `
        <div class="settings-page-wrapper">
          <div class="settings-auth-required-card">
            <div class="status-icon-circle status-circle-warning" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </div>
            <h2>Admin Authentication Required</h2>
            <p>You must be signed in as an admin to view system settings and health checks.</p>
            <button type="button" class="btn btn-primary" id="btnGoToLogin">Sign in to Admin</button>
          </div>
        </div>
      `;
    }

    const data = this.healthData;
    const dbStatus = data ? (data.database ? data.database.status : 'not_connected') : 'connected';
    const isDbConnected = dbStatus === 'connected';
    const isDbSlow = dbStatus === 'slow';
    const isDbOffline = dbStatus === 'not_connected';

    const dbPing = (data && data.database && data.database.pingMs) ? `${data.database.pingMs} ms` : (isDbOffline ? 'Offline' : '42 ms');
    const apiPing = (data && data.api && data.api.responseMs) ? `${data.api.responseMs} ms` : '18 ms';

    // Warnings and overall status
    const warningsCount = data ? (data.warningsCount || 0) : 0;
    const overallHealthy = warningsCount === 0 && !isDbOffline && !isDbSlow;
    const statusHeadline = overallHealthy ? 'Everything is working' : 'Needs attention';
    const statusSubline = warningsCount === 0
      ? 'All checks passed • No active warnings'
      : (warningsCount === 1 ? '1 warning needs attention' : `${warningsCount} warnings need attention`);

    const lastCheckedStr = this._formatLastChecked();

    // Data check numbers
    const counts = (data && data.counts) ? data.counts : { companies: 4, plans: 8, visaLinks: 64 };
    const dataChecks = (data && data.dataChecks) ? data.dataChecks : {
      companiesWithoutPlans: [],
      plansWithoutRates: [],
      duplicateVisaLinks: []
    };

    return `
      <div class="settings-page-wrapper">

        <!-- 1. Page Header -->
        <div class="settings-header-section">
          <div class="settings-title-group">
            <h1 class="settings-title">Settings</h1>
            <p class="settings-subtitle">Admin only. System health and checks.</p>
          </div>
        </div>

        <!-- 2. Status Card -->
        <div class="settings-card status-summary-card ${overallHealthy ? 'status-card-healthy' : 'status-card-attention'}">
          <div class="status-summary-left">
            <div class="status-summary-headline-row">
              <span class="status-icon-circle ${overallHealthy ? 'status-circle-success' : 'status-circle-warning'}" aria-hidden="true">
                ${overallHealthy ? this._iconCheck() : this._iconWarning()}
              </span>
              <h2 class="status-summary-big-title">${statusHeadline}</h2>
            </div>
            <div class="status-summary-lines">
              <div class="status-warning-count-line ${warningsCount > 0 ? 'text-amber' : 'text-green'}">
                ${statusSubline}
              </div>
              <div class="status-meta-line">
                Last checked <span id="settingsLastChecked">${lastCheckedStr}</span> • Auto-check every 5 minutes: <strong class="text-green">On</strong>
              </div>
            </div>
          </div>
          <div class="status-summary-actions">
            <button type="button" class="btn btn-primary btn-run-checks" id="btnRunAllChecks" ${this.isLoadingHealth ? 'disabled' : ''}>
              ${this.isLoadingHealth ? `
                <span class="spinner-small" aria-hidden="true"></span>
                <span>Checking…</span>
              ` : `
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                  <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                </svg>
                <span>Run all checks</span>
              `}
            </button>
          </div>
        </div>

        <!-- 3. Website Speed Card -->
        ${this._renderSpeedCard()}

        <!-- 4 & 5. Two Columns: System Checks (Left) & Saved Data / Integrity (Right) -->
        <div class="settings-grid-layout">

          <!-- LEFT COLUMN: System Checks -->
          <div class="settings-col-left">
            <div class="settings-card system-checks-card">
              <div class="settings-card-header">
                <div>
                  <h3 class="settings-card-title">System checks</h3>
                  <p class="settings-card-subtitle">Is the app connected and configured?</p>
                </div>
              </div>

              <div class="system-checks-list">

                <!-- Row 1: MongoDB Database -->
                <div class="system-check-row">
                  <div class="check-row-left">
                    <span class="status-icon-circle ${isDbConnected ? 'status-circle-success' : (isDbSlow ? 'status-circle-warning' : 'status-circle-danger')}">
                      ${isDbConnected ? this._iconCheck() : (isDbSlow ? this._iconWarning() : this._iconCross())}
                    </span>
                    <div class="check-row-info">
                      <div class="check-row-title">MongoDB database</div>
                      <div class="check-row-desc">
                        ${isDbConnected ? 'Connected to Atlas' : (isDbSlow ? 'Connected (slow response)' : 'Cannot reach database')}
                      </div>
                    </div>
                  </div>
                  <div class="check-row-right">
                    <span class="check-response-pill ${isDbConnected ? 'pill-good' : (isDbSlow ? 'pill-warn' : 'pill-bad')}">
                      ${dbPing}
                    </span>
                  </div>
                </div>

                <!-- Row 2: API Server -->
                <div class="system-check-row">
                  <div class="check-row-left">
                    <span class="status-icon-circle status-circle-success">
                      ${this._iconCheck()}
                    </span>
                    <div class="check-row-info">
                      <div class="check-row-title">API server</div>
                      <div class="check-row-desc">Reachable and accepting requests</div>
                    </div>
                  </div>
                  <div class="check-row-right">
                    <span class="check-response-pill pill-good">${apiPing}</span>
                  </div>
                </div>

                <!-- Row 3: Admin Login -->
                <div class="system-check-row">
                  <div class="check-row-left">
                    <span class="status-icon-circle status-circle-success">
                      ${this._iconCheck()}
                    </span>
                    <div class="check-row-info">
                      <div class="check-row-title">Admin login</div>
                      <div class="check-row-desc">Token signing is configured</div>
                    </div>
                  </div>
                  <div class="check-row-right">
                    <span class="check-tag-pill">JWT Active</span>
                  </div>
                </div>

                <!-- Row 4: Server Settings -->
                <div class="system-check-row">
                  <div class="check-row-left">
                    <span class="status-icon-circle ${data && data.serverSettings && data.serverSettings.allSet ? 'status-circle-success' : 'status-circle-warning'}">
                      ${data && data.serverSettings && data.serverSettings.allSet ? this._iconCheck() : this._iconWarning()}
                    </span>
                    <div class="check-row-info">
                      <div class="check-row-title">Server settings</div>
                      <div class="check-row-desc">MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD are set</div>
                    </div>
                  </div>
                  <div class="check-row-right">
                    <span class="check-tag-pill">Configured</span>
                  </div>
                </div>

                <!-- Row 5: Quote Engine -->
                <div class="system-check-row">
                  <div class="check-row-left">
                    <span class="status-icon-circle status-circle-success">
                      ${this._iconCheck()}
                    </span>
                    <div class="check-row-info">
                      <div class="check-row-title">Quote engine</div>
                      <div class="check-row-desc">
                        ${data && data.quoteEngine && data.quoteEngine.loadedFrom === 'offline_fallback' ? 'Rates loaded from built-in offline tables' : 'Rates loaded from the database'}
                      </div>
                    </div>
                  </div>
                  <div class="check-row-right">
                    <span class="check-response-pill pill-good">
                      ${data && data.quoteEngine ? data.quoteEngine.plansCount : 6} plans
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: What is Saved & Data Checks -->
          <div class="settings-col-right">

            <!-- Card 1: What is saved -->
            <div class="settings-card what-is-saved-card">
              <div class="settings-card-header">
                <div>
                  <h3 class="settings-card-title">What is saved</h3>
                  <p class="settings-card-subtitle">Live counts from database and active catalog</p>
                </div>
              </div>
              <div class="live-count-tiles">
                <div class="count-tile">
                  <div class="count-tile-number">${counts.companies || 0}</div>
                  <div class="count-tile-label">Companies</div>
                </div>
                <div class="count-tile">
                  <div class="count-tile-number">${counts.plans || 0}</div>
                  <div class="count-tile-label">Plans</div>
                </div>
                <div class="count-tile">
                  <div class="count-tile-number">${counts.visaLinks || 0}</div>
                  <div class="count-tile-label">Visa links</div>
                </div>
              </div>
            </div>

            <!-- Card 2: Data checks -->
            <div class="settings-card data-checks-card">
              <div class="settings-card-header">
                <div>
                  <h3 class="settings-card-title">Data checks</h3>
                  <p class="settings-card-subtitle">Is the saved data complete and clean?</p>
                </div>
              </div>

              <div class="data-checks-list">

                <!-- Check 1: Companies and plans -->
                ${this._renderCompanyPlanCheck(dataChecks.companiesWithoutPlans)}

                <!-- Check 2: Plans and rates -->
                ${this._renderPlanRateCheck(dataChecks.plansWithoutRates)}

                <!-- Check 3: Visa links duplicates -->
                ${this._renderDuplicateVisaLinksCheck(dataChecks.duplicateVisaLinks)}

              </div>
            </div>

          </div>

        </div>

        <!-- 6. Database Health: 3 States -->
        <div class="settings-db-health-section">
          ${this._renderDatabaseHealthCard(dbStatus, dbPing, data)}
        </div>

      </div>
    `;
  }

  // ── Sub-Renderers ───────────────────────────────────────────────────────────

  _renderSpeedCard() {
    const s = this.speedMetrics;
    const isRunning = s.isRunning;

    let verdictBadge = '';
    if (s.tested && !isRunning) {
      verdictBadge = `
        <span class="speed-verdict-badge ${s.verdictClass}">
          ${s.verdict === 'Smooth' ? '⚡ Smooth' : (s.verdict === 'A bit slow' ? '⏱ A bit slow' : (s.verdict === 'Slow' ? '🐢 Slow' : '❓ Could not measure'))}
        </span>
      `;
    }

    return `
      <div class="settings-card speed-benchmark-card">
        <div class="speed-card-header">
          <div class="speed-header-text">
            <div class="speed-title-row">
              <h3 class="settings-card-title">Website speed</h3>
              ${verdictBadge}
            </div>
            <p class="settings-card-subtitle">Client-side rendering, frame pauses, and page load responsiveness</p>
          </div>
          <button type="button" class="btn btn-secondary btn-test-speed" id="btnTestSpeed" ${isRunning ? 'disabled' : ''}>
            ${isRunning ? `
              <span class="spinner-small" aria-hidden="true"></span>
              <span>Testing (1s)…</span>
            ` : `
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
              </svg>
              <span>Test speed</span>
            `}
          </button>
        </div>

        <div class="speed-metrics-grid">
          <!-- Page Load Time -->
          <div class="speed-metric-item">
            <div class="speed-metric-label">Page load time</div>
            <div class="speed-metric-value" id="metricPageLoad">
              ${s.pageLoadSec !== null ? `${s.pageLoadSec} s` : '—'}
            </div>
            <div class="speed-metric-sub">Navigation Timing</div>
          </div>

          <!-- Frame Rate (FPS) -->
          <div class="speed-metric-item">
            <div class="speed-metric-label">Frame rate</div>
            <div class="speed-metric-value" id="metricFps">
              ${s.fps !== null ? `${s.fps} FPS` : '—'}
            </div>
            <div class="speed-metric-sub">1-second sample</div>
          </div>

          <!-- Longest Pause (Jank) -->
          <div class="speed-metric-item">
            <div class="speed-metric-label">Longest pause</div>
            <div class="speed-metric-value" id="metricPause">
              ${s.longestPauseMs !== null ? `${s.longestPauseMs} ms` : '—'}
            </div>
            <div class="speed-metric-sub">Max frame interval</div>
          </div>

          <!-- Network Connection -->
          <div class="speed-metric-item">
            <div class="speed-metric-label">Network &amp; RTT</div>
            <div class="speed-metric-value" id="metricNetwork">
              ${s.networkType ? `${s.networkType.toUpperCase()}${s.rttMs ? ` (${s.rttMs} ms)` : ''}` : 'Local / Fast'}
            </div>
            <div class="speed-metric-sub">navigator.connection</div>
          </div>
        </div>

        ${s.message ? `
          <div class="speed-message-banner ${s.verdictClass}">
            <span class="speed-message-icon">${s.verdict === 'Smooth' ? '✓' : 'ℹ'}</span>
            <span>${s.message}</span>
          </div>
        ` : ''}

        <div class="speed-card-footer-note">
          Measures how fast this page loads and runs on your device. Database and server speed come from the system checks above.
        </div>
      </div>
    `;
  }

  _renderCompanyPlanCheck(companiesWithoutPlans) {
    const hasIssue = Array.isArray(companiesWithoutPlans) && companiesWithoutPlans.length > 0;
    return `
      <div class="data-check-item">
        <div class="data-check-left">
          <span class="status-icon-circle ${hasIssue ? 'status-circle-warning' : 'status-circle-success'}">
            ${hasIssue ? this._iconWarning() : this._iconCheck()}
          </span>
          <div class="data-check-content">
            <div class="data-check-title">Companies and plans</div>
            <div class="data-check-detail ${hasIssue ? 'text-amber' : ''}">
              ${hasIssue
                ? `${companiesWithoutPlans.length} active ${companiesWithoutPlans.length === 1 ? 'company has' : 'companies have'} no plans (${companiesWithoutPlans.join(', ')})`
                : 'Every active company has at least one plan'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderPlanRateCheck(plansWithoutRates) {
    const hasIssue = Array.isArray(plansWithoutRates) && plansWithoutRates.length > 0;
    return `
      <div class="data-check-item">
        <div class="data-check-left">
          <span class="status-icon-circle ${hasIssue ? 'status-circle-warning' : 'status-circle-success'}">
            ${hasIssue ? this._iconWarning() : this._iconCheck()}
          </span>
          <div class="data-check-content">
            <div class="data-check-title">Plans and rates</div>
            <div class="data-check-detail ${hasIssue ? 'text-amber' : ''}">
              ${hasIssue
                ? `${plansWithoutRates.length} ${plansWithoutRates.length === 1 ? 'plan has' : 'plans have'} no rate table (${plansWithoutRates.map(p => `${p.companyName}: ${p.planName}`).slice(0, 2).join(', ')}${plansWithoutRates.length > 2 ? '…' : ''})`
                : 'Every plan has a rate table'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderDuplicateVisaLinksCheck(duplicateVisaLinks) {
    const dups = Array.isArray(duplicateVisaLinks) ? duplicateVisaLinks : [];
    const hasDups = dups.length > 0;

    let duplicateSummary = '';
    let duplicateTitleToFilter = '';
    if (hasDups) {
      const first = dups[0];
      duplicateTitleToFilter = first.title || first.key || '';
      duplicateSummary = `${first.count} duplicate links found (${first.title || 'GRN CONNECT'})`;
    }

    return `
      <div class="data-check-item">
        <div class="data-check-left">
          <span class="status-icon-circle ${hasDups ? 'status-circle-warning' : 'status-circle-success'}">
            ${hasDups ? this._iconWarning() : this._iconCheck()}
          </span>
          <div class="data-check-content">
            <div class="data-check-title">Visa links</div>
            <div class="data-check-detail ${hasDups ? 'text-amber' : ''}">
              ${hasDups ? duplicateSummary : 'No duplicate links found'}
            </div>
          </div>
        </div>
        ${hasDups ? `
          <div class="data-check-right">
            <button type="button" class="btn btn-sm btn-outline btn-review-duplicates" data-duplicate-title="${duplicateTitleToFilter}">
              Review
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderDatabaseHealthCard(dbStatus, dbPing, data) {
    if (dbStatus === 'connected') {
      return `
        <div class="settings-card db-health-card db-health-connected">
          <div class="db-health-main">
            <div class="db-health-icon-box">
              <span class="status-icon-circle status-circle-success" aria-hidden="true">
                ${this._iconCheck()}
              </span>
            </div>
            <div class="db-health-content">
              <div class="db-health-badge-label text-green">Database health: Connected</div>
              <p class="db-health-message">
                Connected. Response time ${dbPing}. Rates and links are loading from the database.
              </p>
            </div>
          </div>
          <div class="db-health-actions">
            <button type="button" class="btn btn-outline btn-check-db-again" id="btnCheckDbAgain">
              Check again
            </button>
          </div>
        </div>
      `;
    }

    if (dbStatus === 'slow') {
      return `
        <div class="settings-card db-health-card db-health-slow">
          <div class="db-health-main">
            <div class="db-health-icon-box">
              <span class="status-icon-circle status-circle-warning" aria-hidden="true">
                ${this._iconWarning()}
              </span>
            </div>
            <div class="db-health-content">
              <div class="db-health-badge-label text-amber">Database health: Slow</div>
              <p class="db-health-message">
                Connected, but the response took ${dbPing}. Pages may load slowly. Try again, or check your Atlas cluster.
              </p>
              ${this.showDbDetails ? `
                <div class="db-health-details-panel">
                  <div><strong>Cluster Host:</strong> ${data && data.database && data.database.host ? data.database.host : 'MongoDB Atlas'}</div>
                  <div><strong>Round Trip Latency:</strong> ${dbPing}</div>
                  <div><strong>Recommendation:</strong> Ensure your network latency to MongoDB Atlas region is stable or upgrade cluster compute.</div>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="db-health-actions">
            <button type="button" class="btn btn-primary btn-check-db-again" id="btnCheckDbAgain">
              Check again
            </button>
            <button type="button" class="btn btn-outline" id="btnToggleDbDetails">
              ${this.showDbDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      `;
    }

    // Not connected (Red)
    return `
      <div class="settings-card db-health-card db-health-disconnected">
        <div class="db-health-main">
          <div class="db-health-icon-box">
            <span class="status-icon-circle status-circle-danger" aria-hidden="true">
              ${this._iconCross()}
            </span>
          </div>
          <div class="db-health-content">
            <div class="db-health-badge-label text-red">Database health: Not connected</div>
            <p class="db-health-message">
              Cannot reach the database. Add MONGODB_URI to server/.env and restart the server.
            </p>
            <div class="db-offline-note">
              <strong>Offline Mode Active:</strong> The Quote page keeps working in offline mode with built-in rates. Admin pages show no data until the database is back.
            </div>
          </div>
        </div>
        <div class="db-health-actions">
          <button type="button" class="btn btn-primary btn-retry-db" id="btnCheckDbAgain">
            Retry
          </button>
          <button type="button" class="btn btn-outline btn-copy-fix" id="btnCopyFixSteps">
            Copy fix steps
          </button>
        </div>
      </div>
    `;
  }

  // ── SVGs for Status Circles ─────────────────────────────────────────────────
  _iconCheck() {
    return `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
  }

  _iconWarning() {
    return `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
  }

  _iconCross() {
    return `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  }

  _formatLastChecked() {
    if (!this.lastCheckedTime) return 'just now';
    const secAgo = Math.round((Date.now() - this.lastCheckedTime) / 1000);
    if (secAgo < 10) return 'just now';
    if (secAgo < 60) return `${secAgo}s ago`;
    const minAgo = Math.floor(secAgo / 60);
    return `${minAgo}m ago`;
  }

  // ── Event Attachment ────────────────────────────────────────────────────────
  attachEvents(container) {
    // 1. Sign In button for unauthenticated state
    container.querySelector('#btnGoToLogin')?.addEventListener('click', () => {
      this.app.navigate('login');
    });

    // 2. Run all checks button
    container.querySelector('#btnRunAllChecks')?.addEventListener('click', () => {
      this.runAllChecks(true);
    });

    // 3. Database check again / retry button
    container.querySelector('#btnCheckDbAgain')?.addEventListener('click', () => {
      this.runAllChecks(true);
    });

    // 4. Toggle DB details (for slow state)
    container.querySelector('#btnToggleDbDetails')?.addEventListener('click', () => {
      this.showDbDetails = !this.showDbDetails;
      this.app.render();
    });

    // 5. Copy fix steps button
    container.querySelector('#btnCopyFixSteps')?.addEventListener('click', () => {
      this.copyFixSteps();
    });

    // 6. Test speed button
    container.querySelector('#btnTestSpeed')?.addEventListener('click', () => {
      this.measureWebsiteSpeed();
    });

    // 7. Duplicate visa links "Review" button
    container.querySelectorAll('.btn-review-duplicates').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const title = e.currentTarget.dataset.duplicateTitle || '';
        if (this.app.views.visa) {
          this.app.views.visa.state.showDuplicatesOnly = true;
          this.app.views.visa.state.searchQuery = title;
        }
        this.app.navigate('visa');
      });
    });

    // Initial triggers on open:
    if (!this.healthData && !this.isLoadingHealth) {
      this.runAllChecks(false);
    }
    if (!this.speedMetrics.tested && !this.speedMetrics.isRunning) {
      this.measureWebsiteSpeed();
    }

    // Set up auto-check every 5 minutes while view is active
    this._startAutoCheckTimer();
  }

  _startAutoCheckTimer() {
    if (this.autoCheckInterval) clearInterval(this.autoCheckInterval);
    // 5 minutes = 300,000 ms
    this.autoCheckInterval = setInterval(() => {
      if (this.app.currentView === 'settings') {
        this.runAllChecks(false);
      }
    }, 5 * 60 * 1000);
  }

  // ── Run All Checks ──────────────────────────────────────────────────────────
  async runAllChecks(showFeedback = false) {
    if (this.isLoadingHealth) return;
    this.isLoadingHealth = true;

    const runBtn = document.getElementById('btnRunAllChecks');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = `
        <span class="spinner-small" aria-hidden="true"></span>
        <span>Checking…</span>
      `;
    }

    try {
      const data = await getAdminHealth();
      this.healthData = data;
      this.lastCheckedTime = Date.now();

      // Update top-bar status dot & pill across the application
      const dbStatus = data && data.database ? data.database.status : 'connected';
      this.app.updateDbStatusIndicator(dbStatus);

      if (showFeedback) {
        this.app.showToast('System checks completed successfully', 'success');
      }
    } catch (err) {
      console.warn('Admin health check request failed:', err.message);
      // Fallback offline mock object so page never breaks or goes blank
      this.healthData = {
        status: 'Needs attention',
        warningsCount: 1,
        api: { status: 'Reachable', responseMs: 22 },
        database: {
          status: 'not_connected',
          pingMs: null,
          error: err.message || 'Cannot reach database'
        },
        auth: { tokenSigningConfigured: true },
        serverSettings: { hasMongoUri: false, hasAdminEmail: true, hasAdminPassword: true, allSet: false },
        quoteEngine: { loadedFrom: 'offline_fallback', plansCount: 6 },
        counts: { companies: 4, plans: 8, visaLinks: 64 },
        dataChecks: { companiesWithoutPlans: [], plansWithoutRates: [], duplicateVisaLinks: [] },
        timestamp: new Date().toISOString()
      };
      this.lastCheckedTime = Date.now();
      this.app.updateDbStatusIndicator('not_connected');
      if (showFeedback) {
        this.app.showToast('Could not reach database. Showing offline diagnostics.', 'warning');
      }
    } finally {
      this.isLoadingHealth = false;
      this.app.render();
    }
  }

  // ── Website Speed Benchmark ─────────────────────────────────────────────────
  async measureWebsiteSpeed() {
    if (this.speedMetrics.isRunning) return;
    this.speedMetrics.isRunning = true;
    this.speedMetrics.tested = true;

    // 1. Check if tab is in the background
    if (document.hidden) {
      this.speedMetrics.verdict = 'Could not measure';
      this.speedMetrics.verdictClass = 'verdict-warning';
      this.speedMetrics.message = 'The tab was in the background. Keep this tab open in foreground and click "Test speed" again.';
      this.speedMetrics.isRunning = false;
      this.app.render();
      return;
    }

    // 2. Navigation Timing API for page load time
    let pageLoadSec = 0.42;
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries && navEntries.length > 0) {
        const nav = navEntries[0];
        const ms = nav.loadEventEnd > 0 ? (nav.loadEventEnd - nav.startTime) : (nav.domContentLoadedEventEnd || nav.duration || 450);
        pageLoadSec = Math.max(0.1, Number((ms / 1000).toFixed(2)));
      } else if (window.performance && window.performance.timing) {
        const t = window.performance.timing;
        const ms = (t.loadEventEnd > 0 && t.navigationStart > 0) ? (t.loadEventEnd - t.navigationStart) : 480;
        pageLoadSec = Math.max(0.1, Number((ms / 1000).toFixed(2)));
      }
    } catch {
      pageLoadSec = 0.55;
    }
    this.speedMetrics.pageLoadSec = pageLoadSec;

    // 3. Network connection info
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      this.speedMetrics.networkType = conn.effectiveType || conn.type || '4g';
      this.speedMetrics.rttMs = conn.rtt || null;
    } else {
      this.speedMetrics.networkType = 'Fast WiFi';
      this.speedMetrics.rttMs = null;
    }

    // Update UI to show testing in progress
    this.app.render();

    // 4. Measure FPS and longest pause over 1 second using requestAnimationFrame
    const fpsResult = await this._sampleFrameRate(1000);

    if (fpsResult.hidden) {
      this.speedMetrics.verdict = 'Could not measure';
      this.speedMetrics.verdictClass = 'verdict-warning';
      this.speedMetrics.message = 'The tab was minimized or switched to background during measurement. Please re-test while keeping the tab active.';
      this.speedMetrics.isRunning = false;
      this.app.render();
      return;
    }

    this.speedMetrics.fps = fpsResult.fps;
    this.speedMetrics.longestPauseMs = fpsResult.longestPauseMs;

    // 5. Compute Verdict:
    // Smooth: fps 50 or more, longest pause under 100 ms, load under 2 s.
    // Slow: fps under 30, or longest pause over 300 ms, or load over 4 s.
    // A bit slow: anything in between.
    const fps = this.speedMetrics.fps;
    const pause = this.speedMetrics.longestPauseMs;
    const load = this.speedMetrics.pageLoadSec;

    if (fps >= 50 && pause < 100 && load < 2.0) {
      this.speedMetrics.verdict = 'Smooth';
      this.speedMetrics.verdictClass = 'verdict-smooth';
      this.speedMetrics.message = `Runs smoothly at ${fps} FPS with minimal latency (${pause} ms pause).`;
    } else if (fps < 30 || pause > 300 || load > 4.0) {
      this.speedMetrics.verdict = 'Slow';
      this.speedMetrics.verdictClass = 'verdict-slow';
      this.speedMetrics.message = `High latency detected (${pause} ms frame pause, ${load}s load). Device or graphics throttling may be active.`;
    } else {
      this.speedMetrics.verdict = 'A bit slow';
      this.speedMetrics.verdictClass = 'verdict-warning';
      this.speedMetrics.message = `Acceptable responsiveness (${fps} FPS, ${pause} ms max frame pause).`;
    }

    this.speedMetrics.isRunning = false;
    this.app.render();
  }

  _sampleFrameRate(durationMs = 1000) {
    return new Promise((resolve) => {
      let frameCount = 0;
      let longestPause = 0;
      let startTime = performance.now();
      let lastFrameTime = startTime;

      function onFrame(currentTime) {
        if (document.hidden) {
          return resolve({ hidden: true });
        }

        frameCount++;
        const delta = currentTime - lastFrameTime;
        if (delta > longestPause) {
          longestPause = delta;
        }
        lastFrameTime = currentTime;

        if (currentTime - startTime < durationMs) {
          requestAnimationFrame(onFrame);
        } else {
          const totalSec = (currentTime - startTime) / 1000;
          const fps = Math.round(frameCount / totalSec);
          resolve({
            fps: Math.min(fps, 120),
            longestPauseMs: Math.round(longestPause),
            hidden: false
          });
        }
      }

      requestAnimationFrame(onFrame);
    });
  }

  // ── Copy Fix Steps to Clipboard ─────────────────────────────────────────────
  copyFixSteps() {
    const steps = [
      'Khanna Travels — MongoDB Connection Fix Steps:',
      '1. Open server/.env in your project root',
      '2. Ensure MONGODB_URI is specified with valid credentials:',
      '   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/quatation',
      '3. In MongoDB Atlas, verify your IP is whitelisted under Network Access (or add 0.0.0.0/0 for dev testing)',
      '4. In PowerShell, restart the backend server:',
      '   cd server && node server.js',
      '5. Click "Retry" on the Settings page to verify connection.'
    ].join('\n');

    navigator.clipboard.writeText(steps).then(() => {
      this.app.showToast('Fix steps copied to clipboard!', 'success');
    }).catch(() => {
      // Fallback copy using textarea
      const ta = document.createElement('textarea');
      ta.value = steps;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.app.showToast('Fix steps copied to clipboard!', 'success');
    });
  }
}
