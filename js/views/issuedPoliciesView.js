/**
 * Khanna Travels — Issued Policies View
 * Allows agents and admins to search, review, and access issued policies and insurer PDF documents.
 */
import { getIssuedPolicies, getPolicyDetails } from '../api.js';

export class IssuedPoliciesView {
  constructor(app) {
    this.app = app;
    this.policies = [];
    this.loading = false;
    this.error = null;
    this.searchQuery = '';
    this.activePolicyModal = null;
  }

  async render() {
    return `
      <div class="issued-policies-page container">
        <div class="policies-header">
          <div class="ph-left">
            <h1 class="page-title">Issued Policy Records</h1>
            <p class="page-subtitle">Search and inspect all official policies issued through Khanna Travels.</p>
          </div>
          <div class="ph-right">
            <button type="button" class="btn-secondary btn-sm" id="btnRefreshPolicies">
              🔄 Refresh
            </button>
          </div>
        </div>

        <!-- Search Toolbar -->
        <div class="policies-search-card">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="inputPolicySearch"
              class="search-input"
              placeholder="Search by policy number, customer name, passport no., or mobile..."
              value="${this._esc(this.searchQuery)}"
            />
            ${this.searchQuery ? `
              <button type="button" class="btn-clear-search" id="btnClearPolicySearch" title="Clear search">✕</button>
            ` : ''}
          </div>
        </div>

        <!-- Policies Content List -->
        <div class="policies-content-area" id="policiesContentArea">
          ${this._renderContent()}
        </div>

        <!-- Details Modal -->
        <div class="policy-modal-overlay ${this.activePolicyModal ? 'active' : ''}" id="policyDetailsModal">
          ${this.activePolicyModal ? this._renderPolicyModal(this.activePolicyModal) : ''}
        </div>
      </div>
    `;
  }

  _renderContent() {
    if (this.loading) {
      return `
        <div class="policies-loading-state">
          <div class="spinner"></div>
          <p>Loading issued policies...</p>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="policies-error-state">
          <p>⚠️ ${this._esc(this.error)}</p>
          <button type="button" class="btn-primary btn-sm" id="btnRetryLoadPolicies">Try again</button>
        </div>
      `;
    }

    if (!this.policies || this.policies.length === 0) {
      return `
        <div class="policies-empty-card">
          <div class="empty-icon">📋</div>
          <h3>No issued policies found</h3>
          <p>${this.searchQuery ? 'No policies matched your search criteria.' : 'Policies issued by your agency will appear here for long-term record keeping.'}</p>
          ${this.searchQuery ? `
            <button type="button" class="btn-secondary btn-sm" id="btnResetPolicySearch">Reset search</button>
          ` : `
            <a href="#issue-policy" class="btn-primary btn-sm" style="display:inline-block; margin-top:12px;">Issue a policy now</a>
          `}
        </div>
      `;
    }

    return `
      <div class="policies-table-card">
        <table class="policies-table">
          <thead>
            <tr>
              <th>Policy Number</th>
              <th>Customer / Traveller</th>
              <th>Passport No.</th>
              <th>Plan &amp; Insurer</th>
              <th>Destination &amp; Dates</th>
              <th>Premium</th>
              <th>Issued At</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.policies.map(p => this._renderPolicyRow(p)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderPolicyRow(p) {
    const qd = p.quoteDetails || {};
    const ts = p.travellerSummary || {};
    const primaryName = ts.primaryName || p.customerName || 'Traveller';
    const passNo = ts.passportNumber || p.passportNumber || '—';
    const dates = `${qd.travelStart || '—'} to ${qd.travelEnd || '—'}`;
    const issuedFormatted = p.issuedAt ? new Date(p.issuedAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) : '—';

    return `
      <tr class="policy-table-row" data-policy-number="${this._esc(p.policyNumber)}">
        <td>
          <span class="policy-number-badge font-mono">${this._esc(p.policyNumber)}</span>
          ${qd.isGroup ? `<span class="policy-group-badge">Group (${ts.count || 1})</span>` : ''}
        </td>
        <td>
          <div class="cell-primary-name">${this._esc(primaryName)}</div>
          ${p.contact?.mobile ? `<div class="cell-sub-text">📞 ${this._esc(p.contact.mobile)}</div>` : ''}
        </td>
        <td>
          <span class="font-mono">${this._esc(passNo)}</span>
        </td>
        <td>
          <div class="cell-plan-name">${this._esc(qd.plan || 'Standard')}</div>
          <div class="cell-sub-text">${this._esc(qd.insurer || 'Insurer')}</div>
        </td>
        <td>
          <div>${this._esc(qd.destination || 'Worldwide')}</div>
          <div class="cell-sub-text font-mono">${this._esc(dates)}</div>
        </td>
        <td>
          <span class="policy-premium-text">₹${Number(qd.premium || 0).toLocaleString('en-IN')}</span>
        </td>
        <td>
          <span class="cell-sub-text">${this._esc(issuedFormatted)}</span>
        </td>
        <td style="text-align:right;">
          <div class="policy-actions-wrap">
            <button type="button" class="btn-view-policy-details" data-policy-number="${this._esc(p.policyNumber)}">
              View
            </button>
            ${p.documentUrl ? `
              <a href="${this._esc(p.documentUrl)}" target="_blank" rel="noopener" class="btn-open-doc" title="Open policy PDF document">
                PDF ↗
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  _renderPolicyModal(p) {
    const qd = p.quoteDetails || {};
    const travs = p.travellers || [];
    const contact = p.contact || {};
    const addr = p.address || {};
    const prop = p.proposer || {};
    const nom = p.nominee || {};

    const fullAddr = [addr.addressLine, addr.city, addr.state, addr.pinCode, addr.country]
      .filter(Boolean)
      .join(', ');

    return `
      <div class="policy-modal-card" role="dialog" aria-labelledby="modalPolicyTitle" aria-modal="true">
        <div class="pm-header">
          <div>
            <h2 id="modalPolicyTitle" class="pm-title">Policy: ${this._esc(p.policyNumber)}</h2>
            <div class="pm-sub">
              Issued on ${new Date(p.issuedAt).toLocaleString('en-IN')} · Agent ID: <span class="font-mono">${this._esc(p.agentId)}</span>
            </div>
          </div>
          <button type="button" class="btn-close-modal" id="btnClosePolicyModal" aria-label="Close modal">✕</button>
        </div>

        <div class="pm-body">
          <!-- 1. Plan & Premium Summary -->
          <div class="pm-section">
            <h3 class="pm-sec-title">🛡️ Plan &amp; Coverage</h3>
            <div class="pm-grid-3col">
              <div class="pm-field"><span class="pm-label">Plan</span><span class="pm-val font-medium">${this._esc(qd.plan)}</span></div>
              <div class="pm-field"><span class="pm-label">Insurer</span><span class="pm-val">${this._esc(qd.insurer)}</span></div>
              <div class="pm-field"><span class="pm-label">Sum Insured</span><span class="pm-val font-medium">$${Number(qd.coverage || 50000).toLocaleString()}</span></div>
              <div class="pm-field"><span class="pm-label">Total Premium</span><span class="pm-val highlight-val">₹${Number(qd.premium || 0).toLocaleString('en-IN')}</span></div>
              <div class="pm-field"><span class="pm-label">Destination</span><span class="pm-val">${this._esc(qd.destination)}</span></div>
              <div class="pm-field"><span class="pm-label">Travel Period</span><span class="pm-val font-mono">${this._esc(qd.travelStart)} to ${this._esc(qd.travelEnd)}</span></div>
            </div>
          </div>

          <!-- 2. Verified Traveller Details -->
          <div class="pm-section">
            <h3 class="pm-sec-title">👤 Verified Traveller(s)</h3>
            <div class="travellers-list-wrap">
              ${travs.map((t, idx) => `
                <div class="traveller-card-item">
                  <div class="t-item-head">
                    <span class="t-badge">Traveller #${idx + 1}</span>
                    <strong>${this._esc(t.fullName || `${t.givenNames || ''} ${t.surname || ''}`.trim())}</strong>
                  </div>
                  <div class="pm-grid-3col" style="margin-top:6px;">
                    <div class="pm-field"><span class="pm-label">Passport No</span><span class="pm-val font-mono">${this._esc(t.passportNumber)}</span></div>
                    <div class="pm-field"><span class="pm-label">DOB</span><span class="pm-val">${this._esc(t.dob)}</span></div>
                    <div class="pm-field"><span class="pm-label">Gender / Nationality</span><span class="pm-val">${this._esc(t.sex || '—')} · ${this._esc(t.nationality || 'IND')}</span></div>
                    <div class="pm-field"><span class="pm-label">Expiry Date</span><span class="pm-val font-mono">${this._esc(t.expiryDate || '—')}</span></div>
                    <div class="pm-field"><span class="pm-label">Place of Birth</span><span class="pm-val">${this._esc(t.placeOfBirth || '—')}</span></div>
                    <div class="pm-field"><span class="pm-label">Place of Issue</span><span class="pm-val">${this._esc(t.placeOfIssue || '—')}</span></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 3. Contact & Address -->
          <div class="pm-section">
            <h3 class="pm-sec-title">📍 Contact &amp; Residential Address</h3>
            <div class="pm-grid-2col">
              <div class="pm-field"><span class="pm-label">Email</span><span class="pm-val">${this._esc(contact.email || '—')}</span></div>
              <div class="pm-field"><span class="pm-label">Mobile</span><span class="pm-val font-mono">${this._esc(contact.mobile || '—')}</span></div>
              <div class="pm-field form-group-full"><span class="pm-label">Address</span><span class="pm-val">${this._esc(fullAddr || '—')}</span></div>
            </div>
          </div>

          <!-- 4. Proposer & Nominee -->
          <div class="pm-section">
            <h3 class="pm-sec-title">🤝 Proposer &amp; Nominee</h3>
            <div class="pm-grid-2col">
              ${prop && prop.name ? `
                <div class="pm-field"><span class="pm-label">Proposer (Parent/Guardian)</span><span class="pm-val">${this._esc(prop.name)} (${this._esc(prop.relationship || 'Guardian')}) · Passport: ${this._esc(prop.passportNumber || '—')}</span></div>
              ` : `
                <div class="pm-field"><span class="pm-label">Proposer</span><span class="pm-val">Traveller is self-proposer (Adult)</span></div>
              `}
              <div class="pm-field"><span class="pm-label">Nominee</span><span class="pm-val">${this._esc(nom.name || '—')} (${this._esc(nom.relationship || '—')})</span></div>
            </div>
          </div>

          ${p.overrides && p.overrides.length > 0 ? `
            <div class="pm-section">
              <h3 class="pm-sec-title">⚠️ Recorded Verification Overrides</h3>
              <ul class="overrides-audit-list">
                ${p.overrides.map(o => `
                  <li>
                    <strong>${this._esc(o.field)}</strong>: Quote Value: <em>${this._esc(o.quoteValue)}</em> → Passport Value: <em>${this._esc(o.passportValue)}</em> (Confirmed by ${this._esc(o.confirmedBy || 'Agent')})
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>

        <div class="pm-footer">
          <button type="button" class="btn-secondary" id="btnClosePolicyModalBottom">Close</button>
          ${p.documentUrl ? `
            <a href="${this._esc(p.documentUrl)}" target="_blank" rel="noopener" class="btn-primary" style="display:inline-flex; align-items:center; gap:6px;">
              <span>📄 Open Official Policy PDF</span>
              <span>↗</span>
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }

  async afterRender() {
    this._attachEventListeners();
    await this.loadPolicies();
  }

  async loadPolicies() {
    this.loading = true;
    this.error = null;
    this._updateContentArea();

    try {
      const res = await getIssuedPolicies(this.searchQuery);
      if (res && res.success) {
        this.policies = res.policies || [];
      } else {
        this.policies = [];
      }
    } catch (err) {
      this.error = err.message || 'Failed to fetch issued policies';
    } finally {
      this.loading = false;
      this._updateContentArea();
    }
  }

  _updateContentArea() {
    const area = document.getElementById('policiesContentArea');
    if (area) {
      area.innerHTML = this._renderContent();
    }
  }

  _attachEventListeners() {
    const searchInput = document.getElementById('inputPolicySearch');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        this.searchQuery = e.target.value;
        debounceTimer = setTimeout(() => {
          this.loadPolicies();
        }, 350);
      });
    }

    const btnClear = document.getElementById('btnClearPolicySearch');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.searchQuery = '';
        const inp = document.getElementById('inputPolicySearch');
        if (inp) inp.value = '';
        this.loadPolicies();
      });
    }

    const btnRefresh = document.getElementById('btnRefreshPolicies');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        this.loadPolicies();
      });
    }

    const container = document.querySelector('.issued-policies-page');
    if (container) {
      container.addEventListener('click', async (e) => {
        const btnView = e.target.closest('[data-policy-number]');
        if (btnView && (btnView.classList.contains('btn-view-policy-details') || btnView.classList.contains('policy-table-row'))) {
          const polNum = btnView.dataset.policyNumber;
          await this._openPolicyModal(polNum);
          return;
        }

        if (e.target.closest('#btnClosePolicyModal') || e.target.closest('#btnClosePolicyModalBottom') || e.target.id === 'policyDetailsModal') {
          this._closePolicyModal();
        }

        if (e.target.closest('#btnRetryLoadPolicies')) {
          this.loadPolicies();
        }

        if (e.target.closest('#btnResetPolicySearch')) {
          this.searchQuery = '';
          this.loadPolicies();
        }
      });
    }
  }

  async _openPolicyModal(policyNumber) {
    try {
      this.app?.showToast?.('Loading policy details...', 'info');
      const res = await getPolicyDetails(policyNumber);
      if (res && res.success) {
        this.activePolicyModal = res.policy;
        const modal = document.getElementById('policyDetailsModal');
        if (modal) {
          modal.innerHTML = this._renderPolicyModal(this.activePolicyModal);
          modal.classList.add('active');
        }
      }
    } catch (err) {
      this.app?.showToast?.('Could not load policy details: ' + err.message, 'error');
    }
  }

  _closePolicyModal() {
    this.activePolicyModal = null;
    const modal = document.getElementById('policyDetailsModal');
    if (modal) {
      modal.classList.remove('active');
      modal.innerHTML = '';
    }
  }

  _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
