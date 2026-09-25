/**
 * New Quotation & Quotation Comparison View
 */
import { COUNTRIES, COVERAGE_AMOUNTS, REGIONS, DAY_SLABS, AGE_BANDS } from '../data.js';
import { QuotationEngine } from '../engine.js';
import { StorageManager } from '../storage.js';
import { QuotationExporter } from '../pdf-export.js';

export class QuotationView {
  constructor(app) {
    this.app = app;
    this.state = {
      customerName: 'Rohit Sharma',
      age: 45,
      travelersCount: 1,
      departureCountry: 'India',
      destinationCountry: 'United States',
      departureDate: this.getDefaultDepartureDate(),
      returnDate: this.getDefaultReturnDate(),
      coverageAmount: 250000,
      region: 'including', // 'including' or 'excluding'
      // Results state
      hasCompared: false,
      comparisonResults: null,
      selectedQuote: null,
      filterSort: 'price-asc',
      filterCompany: 'all'
    };
  }

  getDefaultDepartureDate() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  getDefaultReturnDate() {
    const d = new Date();
    d.setDate(d.getDate() + 24); // 18 days
    return d.toISOString().split('T')[0];
  }

  render() {
    const duration = QuotationEngine.calculateDuration(this.state.departureDate, this.state.returnDate);
    const daySlab = QuotationEngine.matchDaySlab(duration);
    const ageBand = QuotationEngine.matchAgeBand(this.state.age);

    return `
      <div class="quotation-page-container">
        <!-- Breadcrumb / Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Generate Travel Insurance Quotation</h1>
            <p class="page-subtitle">Instant multi-company quotation comparison engine with dynamic tariff matching</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-outline" id="btnPrefillSample">⚡ Load Example (45y, 18d, $250k)</button>
            <button class="btn btn-secondary" id="btnResetForm">🔄 Reset</button>
          </div>
        </div>

        <!-- Main Form + Live Preview Layout -->
        <div class="quote-workspace-grid">
          <!-- Left: Input Form Sections -->
          <div class="quote-form-column">
            <form id="quotationInputForm" onsubmit="return false;">
              <!-- Section 1: Customer Details -->
              <div class="form-card">
                <div class="form-card-header">
                  <div class="step-badge">1</div>
                  <div>
                    <h3 class="card-title">Customer Information</h3>
                    <p class="card-subtitle">Insured traveler personal profile and group size</p>
                  </div>
                </div>
                <div class="form-card-body">
                  <div class="form-row grid-3">
                    <div class="form-group">
                      <label class="form-label" for="custNameInput">Customer Full Name <span class="req">*</span></label>
                      <input type="text" id="custNameInput" class="form-control" value="${this.state.customerName}" placeholder="e.g. Johnathan Smith" required>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="custAgeInput">Age (Years) <span class="req">*</span></label>
                      <input type="number" id="custAgeInput" class="form-control" min="0" max="85" value="${this.state.age}" placeholder="e.g. 45" required>
                      <span class="input-hint" id="ageBandHint">Matched: <strong>${ageBand ? ageBand.label : 'Outside range'}</strong></span>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="custTravelersInput">Number of Travelers <span class="req">*</span></label>
                      <input type="number" id="custTravelersInput" class="form-control" min="1" max="20" value="${this.state.travelersCount}" required>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 2: Trip Details -->
              <div class="form-card">
                <div class="form-card-header">
                  <div class="step-badge">2</div>
                  <div>
                    <h3 class="card-title">Trip Details</h3>
                    <p class="card-subtitle">Itinerary dates, duration calculation, and destination scope</p>
                  </div>
                </div>
                <div class="form-card-body">
                  <div class="form-row grid-2">
                    <div class="form-group">
                      <label class="form-label" for="departureCountryInput">Departure Country</label>
                      <select id="departureCountryInput" class="form-control">
                        <option value="India" ${this.state.departureCountry === 'India' ? 'selected' : ''}>India</option>
                        <option value="United States" ${this.state.departureCountry === 'United States' ? 'selected' : ''}>United States</option>
                        <option value="United Kingdom" ${this.state.departureCountry === 'United Kingdom' ? 'selected' : ''}>United Kingdom</option>
                        <option value="United Arab Emirates" ${this.state.departureCountry === 'United Arab Emirates' ? 'selected' : ''}>United Arab Emirates</option>
                        <option value="Singapore" ${this.state.departureCountry === 'Singapore' ? 'selected' : ''}>Singapore</option>
                        <option value="Australia" ${this.state.departureCountry === 'Australia' ? 'selected' : ''}>Australia</option>
                        <option value="Canada" ${this.state.departureCountry === 'Canada' ? 'selected' : ''}>Canada</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="destCountryInput">Destination Country <span class="req">*</span></label>
                      <select id="destCountryInput" class="form-control">
                        ${COUNTRIES.map(c => `
                          <option value="${c.name}" ${this.state.destinationCountry === c.name ? 'selected' : ''}>${c.name} (${c.region === 'including' ? 'USA/Canada' : 'Intl'})</option>
                        `).join('')}
                      </select>
                    </div>
                  </div>

                  <div class="form-row grid-3 date-duration-row">
                    <div class="form-group">
                      <label class="form-label" for="departureDateInput">Departure Date <span class="req">*</span></label>
                      <input type="date" id="departureDateInput" class="form-control" value="${this.state.departureDate}" required>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="returnDateInput">Return / Arrival Date <span class="req">*</span></label>
                      <input type="date" id="returnDateInput" class="form-control" value="${this.state.returnDate}" required>
                    </div>
                    <div class="form-group duration-calc-box">
                      <label class="form-label">Calculated Duration</label>
                      <div class="duration-display-badge ${duration > 180 || duration < 1 ? 'error-badge' : ''}" id="durationDisplayPill">
                        <span class="days-count">${duration > 0 ? duration : '--'}</span> Days
                      </div>
                      <span class="input-hint" id="daySlabHint">Slab: <strong>${daySlab ? daySlab.label : (duration > 180 ? 'Exceeds 180 days' : 'Select dates')}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 3: Coverage & Region -->
              <div class="form-card">
                <div class="form-card-header">
                  <div class="step-badge">3</div>
                  <div>
                    <h3 class="card-title">Coverage Requirement & Geography</h3>
                    <p class="card-subtitle">Choose sum insured limit and USA & Canada coverage option</p>
                  </div>
                </div>
                <div class="form-card-body">
                  <div class="form-group">
                    <label class="form-label">Coverage Requirement (Sum Insured)</label>
                    <div class="coverage-pills-selector">
                      ${COVERAGE_AMOUNTS.map(c => `
                        <label class="coverage-option-card ${this.state.coverageAmount === c.value ? 'selected' : ''}">
                          <input type="radio" name="coverageAmount" value="${c.value}" ${this.state.coverageAmount === c.value ? 'checked' : ''}>
                          <div class="cov-card-content">
                            <span class="cov-amount">${c.label}</span>
                            <span class="cov-desc">${c.value === 50000 ? 'Standard Economy' : c.value === 250000 ? 'Most Popular / Recommended' : 'Comprehensive Executive'}</span>
                          </div>
                          <span class="radio-check"></span>
                        </label>
                      `).join('')}
                    </div>
                  </div>

                  <div class="form-group" style="margin-top: 1.25rem;">
                    <label class="form-label">USA & Canada Coverage Preference</label>
                    <div class="region-toggle-selector">
                      ${REGIONS.map(r => `
                        <label class="region-option-card ${this.state.region === r.id ? 'selected' : ''}">
                          <input type="radio" name="regionChoice" value="${r.id}" ${this.state.region === r.id ? 'checked' : ''}>
                          <div class="reg-icon">${r.id === 'including' ? '🗽' : '🌍'}</div>
                          <div class="reg-content">
                            <div class="reg-title">${r.label}</div>
                            <div class="reg-desc">${r.description}</div>
                          </div>
                          <span class="radio-check"></span>
                        </label>
                      `).join('')}
                    </div>
                  </div>

                  <div id="validationAlertContainer"></div>
                </div>
              </div>

              <!-- Action Bar -->
              <div class="form-action-bar">
                <button type="button" class="btn btn-primary btn-large btn-compare" id="btnCompareQuotes">
                  <span>🚀 Compare Quotes from All Insurers</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Right: Live Reactive Summary Card -->
          <div class="quote-summary-column">
            <div class="live-summary-card sticky-sidebar">
              <div class="summary-card-header">
                <div class="live-pulse-dot"></div>
                <h4>Live Quotation Summary</h4>
              </div>

              <div class="summary-card-body">
                <!-- Customer info -->
                <div class="summary-item">
                  <div class="summary-label">Customer</div>
                  <div class="summary-value" id="sumCustomerName">${this.state.customerName || '—'}</div>
                  <div class="summary-sub" id="sumCustomerAge">${this.state.age} Years (${ageBand ? ageBand.label : 'Outside range'})</div>
                </div>

                <div class="summary-divider"></div>

                <!-- Trip info -->
                <div class="summary-item">
                  <div class="summary-label">Trip Schedule</div>
                  <div class="summary-dates" id="sumDates">
                    <span>${this.state.departureDate || 'YYYY-MM-DD'}</span>
                    <span class="arrow">→</span>
                    <span>${this.state.returnDate || 'YYYY-MM-DD'}</span>
                  </div>
                </div>

                <div class="summary-grid-2">
                  <div class="summary-item">
                    <div class="summary-label">Duration</div>
                    <div class="summary-value highlight-teal" id="sumDuration">${duration > 0 ? duration : '0'} Days</div>
                    <div class="summary-sub" id="sumSlabBadge">Slab: ${daySlab ? daySlab.label : '—'}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Destination</div>
                    <div class="summary-value" id="sumDestination">${this.state.destinationCountry || '—'}</div>
                    <div class="summary-sub">From ${this.state.departureCountry}</div>
                  </div>
                </div>

                <div class="summary-divider"></div>

                <!-- Coverage & Region -->
                <div class="summary-item">
                  <div class="summary-label">Coverage (Sum Insured)</div>
                  <div class="summary-value highlight-navy" id="sumCoverage">USD $${Number(this.state.coverageAmount).toLocaleString()}</div>
                </div>

                <div class="summary-item">
                  <div class="summary-label">Region Scope</div>
                  <div class="summary-value" id="sumRegion">
                    <span class="badge ${this.state.region === 'including' ? 'badge-amber' : 'badge-slate'}">
                      ${this.state.region === 'including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}
                    </span>
                  </div>
                </div>

                <div class="summary-divider"></div>

                <!-- Estimated Price Preview -->
                <div class="estimated-price-box">
                  <div class="est-label">Estimated Starting Premium</div>
                  <div class="est-price" id="sumEstPrice">Calculating...</div>
                  <div class="est-note" id="sumEstNote">Across partner insurers</div>
                </div>
              </div>

              <div class="summary-card-footer">
                <button class="btn btn-orange btn-full" id="btnQuickCompare">Compare Quotes Now</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Comparison Dashboard Section (Dynamically updated/shown) -->
        <div id="comparisonDashboardAnchor"></div>
        <div class="comparison-dashboard-section" id="comparisonDashboardSection" style="${this.state.hasCompared ? 'display: block;' : 'display: none;'}">
          ${this.renderComparisonResults()}
        </div>

        <!-- Quotation Details Modal Placeholder -->
        <div id="quotationModalContainer"></div>
      </div>
    `;
  }

  renderComparisonResults() {
    if (!this.state.hasCompared || !this.state.comparisonResults) {
      return '';
    }

    const { quotes, analytics, durationDays, daySlab, ageBand } = this.state.comparisonResults;
    if (!quotes || quotes.length === 0) {
      return `
        <div class="no-quotes-alert">
          <div class="alert-icon">⚠️</div>
          <div>
            <h4>No Matching Quotations Found</h4>
            <p>We could not find an active insurance rate for the selected criteria. Please check the duration (max 180 days) and age band (0-85 years) or review the Rate Tables admin page.</p>
          </div>
        </div>
      `;
    }

    const currSymbol = '$';

    return `
      <div class="comparison-results-wrapper">
        <!-- Top Summary Banner -->
        <div class="comparison-summary-banner">
          <div class="summary-banner-left">
            <div class="banner-title">Quotation Comparison Dashboard</div>
            <div class="banner-meta-items">
              <span class="meta-item">👤 <strong>${this.state.customerName}</strong> (${this.state.age} yrs, ${ageBand ? ageBand.label : ''})</span>
              <span class="meta-sep">•</span>
              <span class="meta-item">🗓️ <strong>${durationDays} Days</strong> (${daySlab ? daySlab.label : ''})</span>
              <span class="meta-sep">•</span>
              <span class="meta-item">✈️ <strong>${this.state.destinationCountry}</strong></span>
              <span class="meta-sep">•</span>
              <span class="meta-item">🛡️ <strong>USD $${Number(this.state.coverageAmount).toLocaleString()}</strong></span>
              <span class="meta-sep">•</span>
              <span class="meta-item">🌐 <strong>${this.state.region === 'including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}</strong></span>
              <span class="meta-sep">•</span>
              <span class="meta-item">📅 ${this.state.departureDate} → ${this.state.returnDate}</span>
            </div>
          </div>
          <div class="summary-banner-right">
            <button class="btn btn-outline btn-sm" id="btnModifySearch">✏️ Modify Criteria</button>
          </div>
        </div>

        <!-- Comparative Financial Metrics Bar -->
        ${analytics ? `
          <div class="financial-metrics-row">
            <div class="metric-card metric-lowest">
              <div class="metric-tag">LOWEST PREMIUM</div>
              <div class="metric-value">${currSymbol}${analytics.lowestPremium}</div>
              <div class="metric-sub">${analytics.cheapestQuote ? analytics.cheapestQuote.companyName : 'Best Price'}</div>
            </div>

            <div class="metric-card metric-recommended">
              <div class="metric-tag">RECOMMENDED PLAN</div>
              <div class="metric-value">${currSymbol}${analytics.recommendedQuote.totalPremium}</div>
              <div class="metric-sub">${analytics.recommendedQuote.companyName} (${analytics.recommendedQuote.planName})</div>
            </div>

            <div class="metric-card metric-avg">
              <div class="metric-tag">AVERAGE PREMIUM</div>
              <div class="metric-value">${currSymbol}${analytics.averagePremium}</div>
              <div class="metric-sub">Across ${analytics.totalQuotesCount} Insurers</div>
            </div>

            <div class="metric-card metric-diff">
              <div class="metric-tag">MAX SAVINGS / DIFFERENCE</div>
              <div class="metric-value">${currSymbol}${analytics.premiumDifference}</div>
              <div class="metric-sub">Highest: ${currSymbol}${analytics.highestPremium}</div>
            </div>
          </div>
        ` : ''}

        <!-- Filter & Sort Bar -->
        <div class="comparison-toolbar">
          <div class="toolbar-left">
            <div class="toolbar-count">Showing <strong>${quotes.length} Verified Insurance Quotations</strong></div>
          </div>
          <div class="toolbar-right">
            <div class="filter-control">
              <label for="sortQuotesSelect">Sort By:</label>
              <select id="sortQuotesSelect" class="form-control-sm">
                <option value="price-asc" ${this.state.filterSort === 'price-asc' ? 'selected' : ''}>Lowest Premium (Default)</option>
                <option value="price-desc" ${this.state.filterSort === 'price-desc' ? 'selected' : ''}>Highest Premium</option>
                <option value="rating-desc" ${this.state.filterSort === 'rating-desc' ? 'selected' : ''}>Highest Insurer Rating</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Comparison Cards Grid -->
        <div class="quotes-cards-grid">
          ${quotes.map(quote => this.renderQuoteCard(quote)).join('')}
        </div>
      </div>
    `;
  }

  renderQuoteCard(quote) {
    const currSymbol = '$';
    const isCheapest = quote.isCheapest;
    const isRecommended = quote.isRecommended;

    return `
      <div class="quote-card ${isCheapest ? 'card-cheapest' : ''} ${isRecommended ? 'card-recommended' : ''}" data-company-id="${quote.companyId}">
        <!-- Top Badge Banner -->
        <div class="card-badges-row">
          ${isCheapest ? `<span class="badge-pill badge-best-price">🔥 BEST PRICE</span>` : ''}
          ${isRecommended ? `<span class="badge-pill badge-rec-plan">⭐ RECOMMENDED</span>` : ''}
          <span class="claim-ratio-pill">Claim Ratio: <strong>${quote.claimRatio}</strong></span>
        </div>

        <!-- Insurer Header -->
        <div class="quote-card-header">
          <div class="insurer-avatar">${quote.logo}</div>
          <div class="insurer-details">
            <h3 class="insurer-name">${quote.companyName}</h3>
            <div class="plan-subtitle">${quote.planName}</div>
            <div class="rating-stars">
              <span>⭐ ${quote.rating}</span>
              <span class="reviews-sub">(${quote.reviewsCount} reviews)</span>
            </div>
          </div>
        </div>

        <!-- Pricing Block -->
        <div class="quote-price-block">
          <div class="price-main">
            <span class="currency-symbol">${currSymbol}</span>
            <span class="price-figure">${quote.totalPremium}</span>
            <span class="price-tenure">/ ${quote.durationDays} Days</span>
          </div>
          ${quote.travelersCount > 1 ? `
            <div class="price-breakdown">(${currSymbol}${quote.unitPremium} x ${quote.travelersCount} Travelers)</div>
          ` : ''}
          <div class="deductible-info">Deductible: <strong>${quote.deductible}</strong></div>
        </div>

        <!-- Core Key Benefits List -->
        <div class="quote-benefits-list">
          <div class="benefits-title">Included Coverage & Benefits</div>
          <ul>
            ${quote.keyBenefits.slice(0, 4).map(benefit => `
              <li>
                <span class="b-icon">✓</span>
                <span>${benefit}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Support / Emergency Info -->
        <div class="quote-support-footer">
          <div class="support-line">📞 24/7 Support: <strong>${quote.supportPhone}</strong></div>
        </div>

        <!-- Action Buttons -->
        <div class="quote-actions-row">
          <button class="btn btn-outline btn-sm btn-view-details" data-company-id="${quote.companyId}">
            📄 View Details
          </button>
          <button class="btn btn-primary btn-sm btn-select-plan" data-company-id="${quote.companyId}">
            Select Plan →
          </button>
        </div>
      </div>
    `;
  }

  attachEvents() {
    // Input elements
    const custName = document.getElementById('custNameInput');
    const custAge = document.getElementById('custAgeInput');
    const custTravelers = document.getElementById('custTravelersInput');
    const depCountry = document.getElementById('departureCountryInput');
    const destCountry = document.getElementById('destCountryInput');
    const depDate = document.getElementById('departureDateInput');
    const retDate = document.getElementById('returnDateInput');
    const btnCompare = document.getElementById('btnCompareQuotes');
    const btnQuickCompare = document.getElementById('btnQuickCompare');
    const btnPrefill = document.getElementById('btnPrefillSample');
    const btnReset = document.getElementById('btnResetForm');

    // Real-time update listeners
    const updateStateAndSummary = () => {
      this.state.customerName = custName?.value || '';
      this.state.age = custAge?.value ? parseInt(custAge.value, 10) : '';
      this.state.travelersCount = custTravelers?.value ? parseInt(custTravelers.value, 10) : 1;
      this.state.departureCountry = depCountry?.value || '';
      this.state.destinationCountry = destCountry?.value || '';
      this.state.departureDate = depDate?.value || '';
      this.state.returnDate = retDate?.value || '';

      this.updateLiveSummaryCard();
    };

    [custName, custAge, custTravelers, depCountry, destCountry, depDate, retDate].forEach(el => {
      if (el) {
        el.addEventListener('input', updateStateAndSummary);
        el.addEventListener('change', updateStateAndSummary);
      }
    });

    // Coverage radio selection
    document.querySelectorAll('input[name="coverageAmount"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.coverageAmount = Number(e.target.value);
        document.querySelectorAll('.coverage-option-card').forEach(card => card.classList.remove('selected'));
        e.target.closest('.coverage-option-card')?.classList.add('selected');
        this.updateLiveSummaryCard();
      });
    });

    // Region radio selection
    document.querySelectorAll('input[name="regionChoice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.region = e.target.value;
        document.querySelectorAll('.region-option-card').forEach(card => card.classList.remove('selected'));
        e.target.closest('.region-option-card')?.classList.add('selected');
        this.updateLiveSummaryCard();
      });
    });

    // Destination change: auto-prompt USA/Canada region if USA or Canada is picked
    if (destCountry) {
      destCountry.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'United States' || val === 'Canada') {
          // Auto-select including USA/Canada for convenience
          this.state.region = 'including';
          const regRadio = document.querySelector('input[name="regionChoice"][value="including"]');
          if (regRadio) {
            regRadio.checked = true;
            document.querySelectorAll('.region-option-card').forEach(card => card.classList.remove('selected'));
            regRadio.closest('.region-option-card')?.classList.add('selected');
          }
        }
        updateStateAndSummary();
      });
    }

    // Prefill button for the exact prompt specification:
    // Age = 45, Duration = 18 days, Coverage = 250,000, Region = Including USA & Canada
    if (btnPrefill) {
      btnPrefill.addEventListener('click', () => {
        const dep = new Date();
        dep.setDate(dep.getDate() + 5);
        const ret = new Date(dep);
        ret.setDate(ret.getDate() + 17); // 18 days inclusive

        this.state.customerName = 'Rajesh Patel';
        this.state.age = 45;
        this.state.travelersCount = 1;
        this.state.departureCountry = 'India';
        this.state.destinationCountry = 'United States';
        this.state.departureDate = dep.toISOString().split('T')[0];
        this.state.returnDate = ret.toISOString().split('T')[0];
        this.state.coverageAmount = 250000;
        this.state.region = 'including';

        this.app.render();
        this.app.showToast('Pre-loaded reference scenario: Age 45, 18 Days, $250k Coverage, USA/Canada!', 'info');
      });
    }

    // Reset button
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.state.customerName = '';
        this.state.age = '';
        this.state.departureDate = '';
        this.state.returnDate = '';
        this.state.hasCompared = false;
        this.state.comparisonResults = null;
        this.app.render();
      });
    }

    // Compare actions
    const triggerComparison = () => {
      const validation = QuotationEngine.validateCriteria({
        customerName: this.state.customerName,
        age: this.state.age,
        travelersCount: this.state.travelersCount,
        departureDate: this.state.departureDate,
        returnDate: this.state.returnDate,
        destinationCountry: this.state.destinationCountry,
        coverageAmount: this.state.coverageAmount,
        region: this.state.region
      });

      const alertContainer = document.getElementById('validationAlertContainer');
      if (!validation.isValid) {
        if (alertContainer) {
          alertContainer.innerHTML = `
            <div class="form-alert form-alert-error">
              <strong>Please correct the following errors:</strong>
              <ul>${validation.errors.map(err => `<li>${err}</li>`).join('')}</ul>
            </div>
          `;
        }
        this.app.showToast(validation.errors[0], 'error');
        return;
      }

      if (validation.warnings.length > 0 && alertContainer) {
        alertContainer.innerHTML = `
          <div class="form-alert form-alert-warning">
            ${validation.warnings.map(w => `<div>⚠️ ${w}</div>`).join('')}
          </div>
        `;
      } else if (alertContainer) {
        alertContainer.innerHTML = '';
      }

      // Execute comparison
      const rates = StorageManager.getRates();
      const companies = StorageManager.getCompanies();

      const results = QuotationEngine.getQuotations({
        age: this.state.age,
        departureDate: this.state.departureDate,
        returnDate: this.state.returnDate,
        coverageAmount: this.state.coverageAmount,
        region: this.state.region,
        travelersCount: this.state.travelersCount,
        rates,
        companies
      });

      this.state.hasCompared = true;
      this.state.comparisonResults = results;

      // Update comparison section in DOM
      const compSection = document.getElementById('comparisonDashboardSection');
      if (compSection) {
        compSection.innerHTML = this.renderComparisonResults();
        compSection.style.display = 'block';
        this.attachComparisonEvents();

        // Smooth scroll to comparison results
        document.getElementById('comparisonDashboardAnchor')?.scrollIntoView({ behavior: 'smooth' });
      }

      this.app.showToast(`Found ${results.quotes.length} matching quotations!`, 'success');
    };

    if (btnCompare) btnCompare.addEventListener('click', triggerComparison);
    if (btnQuickCompare) btnQuickCompare.addEventListener('click', triggerComparison);

    // Initial live calculation preview
    this.updateLiveSummaryCard();

    // Attach comparison events if already rendered
    if (this.state.hasCompared) {
      this.attachComparisonEvents();
    }
  }

  updateLiveSummaryCard() {
    const duration = QuotationEngine.calculateDuration(this.state.departureDate, this.state.returnDate);
    const daySlab = QuotationEngine.matchDaySlab(duration);
    const ageBand = QuotationEngine.matchAgeBand(this.state.age);

    const sumCust = document.getElementById('sumCustomerName');
    const sumAge = document.getElementById('sumCustomerAge');
    const sumDates = document.getElementById('sumDates');
    const sumDuration = document.getElementById('sumDuration');
    const sumSlabBadge = document.getElementById('sumSlabBadge');
    const sumDestination = document.getElementById('sumDestination');
    const sumCoverage = document.getElementById('sumCoverage');
    const sumRegion = document.getElementById('sumRegion');
    const sumEstPrice = document.getElementById('sumEstPrice');
    const durationPill = document.getElementById('durationDisplayPill');
    const ageBandHint = document.getElementById('ageBandHint');
    const daySlabHint = document.getElementById('daySlabHint');

    if (sumCust) sumCust.textContent = this.state.customerName || '—';
    if (sumAge) sumAge.textContent = this.state.age !== '' ? `${this.state.age} Years (${ageBand ? ageBand.label : 'Outside range'})` : '—';
    if (ageBandHint) ageBandHint.innerHTML = `Matched: <strong>${ageBand ? ageBand.label : 'Outside range'}</strong>`;
    
    if (sumDates) {
      sumDates.innerHTML = `
        <span>${this.state.departureDate || 'YYYY-MM-DD'}</span>
        <span class="arrow">→</span>
        <span>${this.state.returnDate || 'YYYY-MM-DD'}</span>
      `;
    }

    if (sumDuration) sumDuration.textContent = `${duration > 0 ? duration : 0} Days`;
    if (sumSlabBadge) sumSlabBadge.textContent = `Slab: ${daySlab ? daySlab.label : '—'}`;
    if (durationPill) {
      durationPill.innerHTML = `<span class="days-count">${duration > 0 ? duration : '--'}</span> Days`;
      if (duration > 180 || duration < 1) {
        durationPill.classList.add('error-badge');
      } else {
        durationPill.classList.remove('error-badge');
      }
    }
    if (daySlabHint) {
      daySlabHint.innerHTML = `Slab: <strong>${daySlab ? daySlab.label : (duration > 180 ? 'Exceeds 180 days' : 'Select dates')}</strong>`;
    }

    if (sumDestination) sumDestination.textContent = this.state.destinationCountry || '—';
    if (sumCoverage) sumCoverage.textContent = `USD $${Number(this.state.coverageAmount).toLocaleString()}`;
    if (sumRegion) {
      sumRegion.innerHTML = `
        <span class="badge ${this.state.region === 'including' ? 'badge-amber' : 'badge-slate'}">
          ${this.state.region === 'including' ? 'Including USA & Canada' : 'Excluding USA & Canada'}
        </span>
      `;
    }

    // Live quick price estimation
    if (sumEstPrice) {
      if (daySlab && ageBand && this.state.coverageAmount) {
        const rates = StorageManager.getRates();
        const companies = StorageManager.getCompanies();
        const res = QuotationEngine.getQuotations({
          age: this.state.age,
          departureDate: this.state.departureDate,
          returnDate: this.state.returnDate,
          coverageAmount: this.state.coverageAmount,
          region: this.state.region,
          travelersCount: this.state.travelersCount,
          rates,
          companies
        });

        if (res.analytics && res.analytics.lowestPremium) {
          sumEstPrice.textContent = `$${res.analytics.lowestPremium}`;
        } else {
          sumEstPrice.textContent = 'No Rate Found';
        }
      } else {
        sumEstPrice.textContent = '—';
      }
    }
  }

  attachComparisonEvents() {
    // Sort dropdown
    const sortSelect = document.getElementById('sortQuotesSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.state.filterSort = e.target.value;
        const quotes = this.state.comparisonResults.quotes;
        if (this.state.filterSort === 'price-asc') {
          quotes.sort((a, b) => a.totalPremium - b.totalPremium);
        } else if (this.state.filterSort === 'price-desc') {
          quotes.sort((a, b) => b.totalPremium - a.totalPremium);
        } else if (this.state.filterSort === 'rating-desc') {
          quotes.sort((a, b) => b.rating - a.rating);
        }
        const compSection = document.getElementById('comparisonDashboardSection');
        if (compSection) {
          compSection.innerHTML = this.renderComparisonResults();
          this.attachComparisonEvents();
        }
      });
    }

    // Modify Search criteria
    const btnModify = document.getElementById('btnModifySearch');
    if (btnModify) {
      btnModify.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Select Plan buttons
    document.querySelectorAll('.btn-select-plan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const companyId = e.currentTarget.getAttribute('data-company-id');
        this.openQuotationModal(companyId, true);
      });
    });

    // View Details buttons
    document.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const companyId = e.currentTarget.getAttribute('data-company-id');
        this.openQuotationModal(companyId, false);
      });
    });
  }

  openQuotationModal(companyId, isDirectSelection = false) {
    const quote = this.state.comparisonResults.quotes.find(q => q.companyId === companyId);
    if (!quote) return;

    // Generate unique quote ref ID if not already generated
    const quoteRef = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const quoteRecord = {
      ...quote,
      id: quoteRef,
      customerName: this.state.customerName,
      customerAge: this.state.age,
      travelersCount: this.state.travelersCount,
      departureCountry: this.state.departureCountry,
      destinationCountry: this.state.destinationCountry,
      departureDate: this.state.departureDate,
      returnDate: this.state.returnDate,
      durationDays: quote.durationDays,
      slabId: quote.daySlab.id,
      date: new Date().toISOString().split('T')[0],
      status: 'Active'
    };

    const modalContainer = document.getElementById('quotationModalContainer');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-backdrop" id="quoteModalBackdrop">
        <div class="modal-dialog modal-lg">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Official Quotation Breakdown</h3>
              <div class="modal-subtitle">Reference: <strong>${quoteRef}</strong> • Created ${quoteRecord.date}</div>
            </div>
            <button class="modal-close" id="btnCloseQuoteModal">&times;</button>
          </div>

          <div class="modal-body quotation-modal-body">
            ${QuotationExporter.renderQuotationDocument(quoteRecord)}
          </div>

          <div class="modal-footer">
            <div class="modal-footer-left">
              <button class="btn btn-outline" id="btnEmailQuoteModal">✉️ Email Quotation</button>
              <button class="btn btn-outline" id="btnPrintQuoteModal">🖨️ Print / Download PDF</button>
            </div>
            <div class="modal-footer-right">
              <button class="btn btn-secondary" id="btnCloseQuoteModalFooter">Close</button>
              <button class="btn btn-primary btn-orange" id="btnSaveQuoteModal">💾 Save Quotation to Ledger</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach modal events
    const closeModal = () => {
      modalContainer.innerHTML = '';
    };

    document.getElementById('btnCloseQuoteModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCloseQuoteModalFooter')?.addEventListener('click', closeModal);
    document.getElementById('quoteModalBackdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'quoteModalBackdrop') closeModal();
    });

    document.getElementById('btnPrintQuoteModal')?.addEventListener('click', () => {
      QuotationExporter.printQuotation(quoteRecord);
    });

    document.getElementById('btnEmailQuoteModal')?.addEventListener('click', () => {
      this.openEmailModal(quoteRecord);
    });

    document.getElementById('btnSaveQuoteModal')?.addEventListener('click', () => {
      StorageManager.saveQuotation(quoteRecord);
      this.app.showToast(`Quotation ${quoteRef} saved successfully!`, 'success');
      closeModal();
    });

    if (isDirectSelection) {
      this.app.showToast(`Selected ${quote.companyName} (${quote.planName}). Review or save quotation below.`, 'info');
    }
  }

  openEmailModal(quoteRecord) {
    const emailData = QuotationExporter.getEmailContent(quoteRecord);

    const emailModalHtml = `
      <div class="modal-backdrop" id="emailModalBackdrop" style="z-index: 1050;">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Email Quotation to Client</h3>
            <button class="modal-close" id="btnCloseEmailModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">To Recipient</label>
              <input type="email" id="emailRecipientInput" class="form-control" value="${emailData.to}">
            </div>
            <div class="form-group">
              <label class="form-label">Subject</label>
              <input type="text" id="emailSubjectInput" class="form-control" value="${emailData.subject}">
            </div>
            <div class="form-group">
              <label class="form-label">Message Body</label>
              <textarea id="emailBodyInput" class="form-control" rows="10" style="font-family: monospace; font-size: 0.85rem;">${emailData.body}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelEmailModal">Cancel</button>
            <button class="btn btn-primary" id="btnSendEmailAction">🚀 Send Quotation Email</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.id = 'emailModalWrapper';
    div.innerHTML = emailModalHtml;
    document.body.appendChild(div);

    const closeEmail = () => {
      div.remove();
    };

    document.getElementById('btnCloseEmailModal')?.addEventListener('click', closeEmail);
    document.getElementById('btnCancelEmailModal')?.addEventListener('click', closeEmail);
    document.getElementById('btnSendEmailAction')?.addEventListener('click', () => {
      this.app.showToast(`Quotation email sent successfully to ${document.getElementById('emailRecipientInput').value}!`, 'success');
      closeEmail();
    });
  }
}
