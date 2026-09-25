/**
 * Insurance Companies Management View
 */
import { StorageManager } from '../storage.js';

export class CompaniesView {
  constructor(app) {
    this.app = app;
  }

  render() {
    const companies = StorageManager.getCompanies();

    return `
      <div class="companies-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Underwriting Insurance Partners</h1>
            <p class="page-subtitle">Manage integrated insurance carriers, active products, coverage limits, and claim settlement metrics</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-orange" id="btnAddNewCompanyDirect">➕ Add Insurance Company</button>
          </div>
        </div>

        <!-- Companies Cards Grid -->
        <div class="companies-cards-grid">
          ${companies.map(c => `
            <div class="company-profile-card">
              <div class="comp-card-header">
                <div class="comp-icon-big">${c.logo}</div>
                <div class="comp-meta">
                  <h3 class="comp-name">${c.name}</h3>
                  <div class="comp-plan-badge">Flagship Plan: <strong>${c.planName}</strong></div>
                  <div class="comp-rating-line">⭐ ${c.rating} (${c.reviewsCount} verified reviews)</div>
                </div>
              </div>

              <div class="comp-card-body">
                <div class="comp-stats-row">
                  <div class="stat-pill">
                    <span class="stat-title">Claim Settlement</span>
                    <span class="stat-value text-teal">${c.claimRatio}</span>
                  </div>
                  <div class="stat-pill">
                    <span class="stat-title">Deductible</span>
                    <span class="stat-value">${c.deductible}</span>
                  </div>
                </div>

                <div class="comp-benefits-block">
                  <div class="benefits-label">Coverage Highlights</div>
                  <ul>
                    ${c.keyBenefits.slice(0, 3).map(b => `<li><span class="chk">✓</span> ${b}</li>`).join('')}
                  </ul>
                </div>

                <div class="comp-contacts-block">
                  <div class="contact-item">📞 <strong>Hotline:</strong> ${c.supportPhone}</div>
                  <div class="contact-item">✉️ <strong>Claims:</strong> ${c.emergencyEmail}</div>
                </div>
              </div>

              <div class="comp-card-footer">
                <button class="btn btn-sm btn-outline btn-manage-rates-for" data-company-id="${c.id}">
                  📊 View Rates
                </button>
                ${c.id !== 'trawelltag-valuepro' ? `
                  <button class="btn btn-sm btn-danger-outline btn-delete-company" data-company-id="${c.id}">
                    🗑️ Remove
                  </button>
                ` : `
                  <span class="badge badge-teal">Primary Baseline</span>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btnAddNewCompanyDirect')?.addEventListener('click', () => {
      this.app.navigateTo('rates');
      setTimeout(() => {
        document.getElementById('btnOpenAddCompanyModal')?.click();
      }, 100);
    });

    document.querySelectorAll('.btn-manage-rates-for').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-company-id');
        this.app.navigateTo('rates', { companyId: id });
      });
    });

    document.querySelectorAll('.btn-delete-company').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-company-id');
        if (confirm('Are you sure you want to remove this insurance company and all its tariff tables?')) {
          StorageManager.deleteCompany(id);
          this.app.showToast('Insurance company removed.', 'info');
          this.app.render();
        }
      });
    });
  }
}
