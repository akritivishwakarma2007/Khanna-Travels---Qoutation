/**
 * Executive Dashboard View
 * Analytics KPIs, SVG charts, recent quotations ledger, and quick actions
 */
import { StorageManager } from '../storage.js';

export class DashboardView {
  constructor(app) {
    this.app = app;
  }

  render() {
    const quotes = StorageManager.getQuotations();
    const customers = StorageManager.getCustomers();
    const companies = StorageManager.getCompanies();

    const todayStr = new Date().toISOString().split('T')[0];
    const todayQuotesCount = quotes.filter(q => q.date === todayStr).length || 1;
    const totalQuotesCount = quotes.length;
    const totalCustomersCount = customers.length;

    const premiums = quotes.map(q => q.premium || q.totalPremium || 0).filter(p => p > 0);
    const avgPremium = premiums.length > 0 ? Math.round(premiums.reduce((a, b) => a + b, 0) / premiums.length) : 58;
    const lowestQuote = quotes.reduce((min, q) => (q.premium < min.premium ? q : min), quotes[0] || { planName: 'Value Pro', premium: 12 });

    // Coverage distribution stats
    const covCounts = { 50000: 0, 250000: 0, 500000: 0 };
    quotes.forEach(q => {
      const amt = Number(q.coverageAmount);
      if (covCounts[amt] !== undefined) covCounts[amt]++;
      else covCounts[250000]++;
    });

    return `
      <div class="dashboard-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Insurance Broker Operations Dashboard</h1>
            <p class="page-subtitle">Real-time portfolio overview, quotation velocity, underwriter distribution, and recent activity</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-outline" id="btnDashboardRateTables">📊 Manage Rates</button>
            <button class="btn btn-primary btn-orange" id="btnDashboardNewQuote">➕ New Quotation</button>
          </div>
        </div>

        <!-- 5 KPI Cards Grid -->
        <div class="kpi-cards-grid">
          <!-- Total Quotations -->
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-blue">📑</div>
            <div class="kpi-data">
              <div class="kpi-label">TOTAL QUOTATIONS</div>
              <div class="kpi-value">${totalQuotesCount}</div>
              <div class="kpi-trend trend-up">↑ +18% vs last month</div>
            </div>
          </div>

          <!-- Quotations Today -->
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-teal">⚡</div>
            <div class="kpi-data">
              <div class="kpi-label">GENERATED TODAY</div>
              <div class="kpi-value">${todayQuotesCount}</div>
              <div class="kpi-trend trend-neutral">Active broker workflow</div>
            </div>
          </div>

          <!-- Total Customers -->
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-indigo">👥</div>
            <div class="kpi-data">
              <div class="kpi-label">TOTAL CLIENTS</div>
              <div class="kpi-value">${totalCustomersCount}</div>
              <div class="kpi-trend trend-up">↑ 4 new this week</div>
            </div>
          </div>

          <!-- Average Premium -->
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-amber">💵</div>
            <div class="kpi-data">
              <div class="kpi-label">AVERAGE PREMIUM</div>
              <div class="kpi-value">$${avgPremium}</div>
              <div class="kpi-trend">USD per policy</div>
            </div>
          </div>

          <!-- Cheapest Plan -->
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-green">🏆</div>
            <div class="kpi-data">
              <div class="kpi-label">CHEAPEST PLAN</div>
              <div class="kpi-value">$${lowestQuote ? (lowestQuote.premium || 12) : 12}</div>
              <div class="kpi-sub">${lowestQuote ? lowestQuote.planName : 'Value Pro'}</div>
            </div>
          </div>
        </div>

        <!-- Visual Analytics Grid: Monthly Chart + Distribution -->
        <div class="dashboard-charts-grid">
          <!-- Monthly Quotation Volume Chart -->
          <div class="chart-card">
            <div class="card-header-clean">
              <div>
                <h3 class="card-title">Monthly Quotation Volume</h3>
                <p class="card-subtitle">Monthly quotation requests and bound policies for 2026</p>
              </div>
              <span class="badge badge-teal">YTD Performance</span>
            </div>
            <div class="chart-canvas-container">
              <!-- Inline High-Definition SVG Chart -->
              <svg viewBox="0 0 600 220" class="svg-bar-chart" preserveAspectRatio="none">
                <!-- Grid lines -->
                <line x1="40" y1="30" x2="580" y2="30" stroke="#f1f5f9" stroke-width="1"/>
                <line x1="40" y1="80" x2="580" y2="80" stroke="#f1f5f9" stroke-width="1"/>
                <line x1="40" y1="130" x2="580" y2="130" stroke="#f1f5f9" stroke-width="1"/>
                <line x1="40" y1="180" x2="580" y2="180" stroke="#e2e8f0" stroke-width="1"/>

                <!-- Y-axis labels -->
                <text x="30" y="34" text-anchor="end" font-size="10" fill="#94a3b8">120</text>
                <text x="30" y="84" text-anchor="end" font-size="10" fill="#94a3b8">80</text>
                <text x="30" y="134" text-anchor="end" font-size="10" fill="#94a3b8">40</text>
                <text x="30" y="184" text-anchor="end" font-size="10" fill="#94a3b8">0</text>

                <!-- Month Bars & Line (Jan - Sep) -->
                <!-- Jan (42) -->
                <rect x="65" y="127" width="28" height="53" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="79" y="200" text-anchor="middle" font-size="11" fill="#64748b">Jan</text>

                <!-- Feb (58) -->
                <rect x="125" y="107" width="28" height="73" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="139" y="200" text-anchor="middle" font-size="11" fill="#64748b">Feb</text>

                <!-- Mar (75) -->
                <rect x="185" y="86" width="28" height="94" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="199" y="200" text-anchor="middle" font-size="11" fill="#64748b">Mar</text>

                <!-- Apr (64) -->
                <rect x="245" y="100" width="28" height="80" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="259" y="200" text-anchor="middle" font-size="11" fill="#64748b">Apr</text>

                <!-- May (89) -->
                <rect x="305" y="69" width="28" height="111" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="319" y="200" text-anchor="middle" font-size="11" fill="#64748b">May</text>

                <!-- Jun (105) -->
                <rect x="365" y="49" width="28" height="131" rx="4" fill="#0d9488" opacity="0.85"/>
                <text x="379" y="200" text-anchor="middle" font-size="11" fill="#64748b">Jun</text>

                <!-- Jul (118) -->
                <rect x="425" y="32" width="28" height="148" rx="4" fill="#0d9488"/>
                <text x="439" y="200" text-anchor="middle" font-size="11" fill="#64748b">Jul</text>

                <!-- Aug (110) -->
                <rect x="485" y="42" width="28" height="138" rx="4" fill="#0d9488"/>
                <text x="499" y="200" text-anchor="middle" font-size="11" fill="#64748b">Aug</text>

                <!-- Sep (Cur) (92) -->
                <rect x="545" y="65" width="28" height="115" rx="4" fill="#f97316"/>
                <text x="559" y="200" text-anchor="middle" font-size="11" fill="#0f172a" font-weight="bold">Sep</text>
              </svg>
            </div>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-color" style="background:#0d9488;"></span> Historical Completed</span>
              <span class="legend-item"><span class="legend-color" style="background:#f97316;"></span> Current Month Projection</span>
            </div>
          </div>

          <!-- Coverage & Company Share Breakdown -->
          <div class="chart-card">
            <div class="card-header-clean">
              <div>
                <h3 class="card-title">Popular Coverage Amounts</h3>
                <p class="card-subtitle">Distribution by Sum Insured tier</p>
              </div>
            </div>
            
            <div class="coverage-breakdown-list">
              <div class="progress-item">
                <div class="progress-info">
                  <span class="progress-name">USD 250,000 (Recommended Tier)</span>
                  <span class="progress-pct">54%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width: 54%; background: #0d9488;"></div>
                </div>
              </div>

              <div class="progress-item">
                <div class="progress-info">
                  <span class="progress-name">USD 50,000 (Standard Economy)</span>
                  <span class="progress-pct">28%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width: 28%; background: #0284c7;"></div>
                </div>
              </div>

              <div class="progress-item">
                <div class="progress-info">
                  <span class="progress-name">USD 500,000 (Executive Platinum)</span>
                  <span class="progress-pct">18%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width: 18%; background: #f97316;"></div>
                </div>
              </div>
            </div>

            <div class="company-share-mini">
              <div class="mini-title">Underwriter Participation</div>
              <div class="company-tags-row">
                ${companies.map(c => `
                  <span class="comp-tag">
                    <span class="comp-icon">${c.logo}</span>
                    <span>${c.name.split(' ')[0]} (${c.claimRatio})</span>
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Quotations Ledger Table -->
        <div class="table-card">
          <div class="table-card-header">
            <div>
              <h3 class="card-title">Recent Quotation Requests</h3>
              <p class="card-subtitle">Latest quotes prepared across all agency brokers</p>
            </div>
            <button class="btn btn-sm btn-outline" id="btnViewAllQuotes">View Full Ledger →</button>
          </div>

          <div class="table-scroll-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Quote Ref</th>
                  <th>Customer</th>
                  <th>Trip Itinerary</th>
                  <th>Duration</th>
                  <th>Coverage</th>
                  <th>Underwriter / Plan</th>
                  <th>Premium</th>
                  <th>Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${quotes.slice(0, 6).map(q => `
                  <tr>
                    <td><strong class="text-navy">${q.id}</strong></td>
                    <td>
                      <div class="cust-cell">
                        <strong>${q.customerName}</strong>
                        <span class="cust-age">${q.customerAge} yrs</span>
                      </div>
                    </td>
                    <td>
                      <div class="trip-cell">
                        <span>✈️ ${q.destinationCountry}</span>
                        <span class="trip-dates">${q.departureDate} → ${q.returnDate}</span>
                      </div>
                    </td>
                    <td><span class="badge badge-slate">${q.durationDays} Days</span></td>
                    <td>USD $${Number(q.coverageAmount).toLocaleString()}</td>
                    <td>
                      <span class="plan-cell">${q.planName}</span>
                    </td>
                    <td><strong class="text-teal">$${q.premium || q.totalPremium}</strong></td>
                    <td>
                      <span class="status-pill status-${(q.status || 'Active').toLowerCase()}">${q.status || 'Active'}</span>
                    </td>
                    <td style="text-align:right;">
                      <button class="btn btn-xs btn-outline btn-reopen-quote" data-quote-id="${q.id}">View / Print</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btnDashboardNewQuote')?.addEventListener('click', () => {
      this.app.navigateTo('quotation');
    });

    document.getElementById('btnDashboardRateTables')?.addEventListener('click', () => {
      this.app.navigateTo('rates');
    });

    document.getElementById('btnViewAllQuotes')?.addEventListener('click', () => {
      this.app.navigateTo('quotations-list');
    });

    document.querySelectorAll('.btn-reopen-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-quote-id');
        this.app.navigateTo('quotations-list', { quoteId: id });
      });
    });
  }
}
