/**
 * Analytics & Reports View
 */
import { StorageManager } from '../storage.js';

export class ReportsView {
  constructor(app) {
    this.app = app;
  }

  render() {
    const quotes = StorageManager.getQuotations();
    const companies = StorageManager.getCompanies();

    return `
      <div class="reports-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Executive Reports & Underwriting Analytics</h1>
            <p class="page-subtitle">Quotation conversion trends, geographic exposure, insurer selection share, and broker productivity</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-outline" onclick="window.print()">🖨️ Print Report</button>
          </div>
        </div>

        <!-- Metric Highlights -->
        <div class="kpi-cards-grid">
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-teal">🎯</div>
            <div class="kpi-data">
              <div class="kpi-label">CONVERSION RATIO</div>
              <div class="kpi-value">64.2%</div>
              <div class="kpi-trend trend-up">Quotes to Bound Policies</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-blue">⏱️</div>
            <div class="kpi-data">
              <div class="kpi-label">AVG TRIP DURATION</div>
              <div class="kpi-value">17.4 Days</div>
              <div class="kpi-trend">Dominant slab: 15–21 Days</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-amber">💰</div>
            <div class="kpi-data">
              <div class="kpi-label">ESTIMATED COMMISSIONS</div>
              <div class="kpi-value">$1,840</div>
              <div class="kpi-trend">Broker margin @ 12%</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-indigo">🌏</div>
            <div class="kpi-data">
              <div class="kpi-label">USA/CANADA RATIO</div>
              <div class="kpi-value">42%</div>
              <div class="kpi-trend">Including USA & Canada</div>
            </div>
          </div>
        </div>

        <!-- Top Destinations & Insurer Breakdown -->
        <div class="dashboard-charts-grid">
          <div class="chart-card">
            <div class="card-header-clean">
              <h3 class="card-title">Top 5 Travel Destinations</h3>
              <span class="badge badge-teal">By Quote Inquiries</span>
            </div>
            <div class="destinations-ranking-list">
              <div class="dest-rank-row">
                <span class="dest-rank-num">1</span>
                <span class="dest-name">United States</span>
                <span class="dest-bar-wrap"><span class="dest-bar-fill" style="width: 82%;"></span></span>
                <span class="dest-count">38 quotes</span>
              </div>
              <div class="dest-rank-row">
                <span class="dest-rank-num">2</span>
                <span class="dest-name">United Kingdom</span>
                <span class="dest-bar-wrap"><span class="dest-bar-fill" style="width: 65%;"></span></span>
                <span class="dest-count">29 quotes</span>
              </div>
              <div class="dest-rank-row">
                <span class="dest-rank-num">3</span>
                <span class="dest-name">Schengen Europe (France/Germany/Swiss)</span>
                <span class="dest-bar-wrap"><span class="dest-bar-fill" style="width: 58%;"></span></span>
                <span class="dest-count">24 quotes</span>
              </div>
              <div class="dest-rank-row">
                <span class="dest-rank-num">4</span>
                <span class="dest-name">United Arab Emirates (Dubai)</span>
                <span class="dest-bar-wrap"><span class="dest-bar-fill" style="width: 46%;"></span></span>
                <span class="dest-count">19 quotes</span>
              </div>
              <div class="dest-rank-row">
                <span class="dest-rank-num">5</span>
                <span class="dest-name">Singapore & Thailand</span>
                <span class="dest-bar-wrap"><span class="dest-bar-fill" style="width: 38%;"></span></span>
                <span class="dest-count">15 quotes</span>
              </div>
            </div>
          </div>

          <div class="chart-card">
            <div class="card-header-clean">
              <h3 class="card-title">Insurer Selection Distribution</h3>
              <span class="badge badge-indigo">Carrier Win Rate</span>
            </div>
            <div class="insurer-selection-list">
              ${companies.map(c => `
                <div class="insurer-win-row">
                  <div class="win-left">
                    <span class="win-icon">${c.logo}</span>
                    <span class="win-name">${c.name} (${c.planName})</span>
                  </div>
                  <div class="win-right">
                    <span class="badge badge-slate">${c.claimRatio} Claim Ratio</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {}
}
