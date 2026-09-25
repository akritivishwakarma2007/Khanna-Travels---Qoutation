/**
 * Customers Directory View
 */
import { StorageManager } from '../storage.js';

export class CustomersView {
  constructor(app) {
    this.app = app;
    this.state = { searchTerm: '' };
  }

  render() {
    let customers = StorageManager.getCustomers();
    if (this.state.searchTerm) {
      const term = this.state.searchTerm.toLowerCase();
      customers = customers.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term))
      );
    }

    return `
      <div class="customers-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Client Profiles & Travel History</h1>
            <p class="page-subtitle">Directory of insured travelers, passport details, and past quotation records</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-orange" id="btnNewQuoteForCust">➕ Create Quote for New Client</button>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="matrix-filter-card">
          <div class="filter-item">
            <label class="filter-label">Search Client Directory</label>
            <input type="text" id="custSearchInput" class="form-control" placeholder="Search by client name, email, phone or passport..." value="${this.state.searchTerm}">
          </div>
        </div>

        <!-- Customers Grid -->
        <div class="customers-grid">
          ${customers.map(c => `
            <div class="customer-card">
              <div class="cust-card-header">
                <div class="cust-avatar">${c.name.charAt(0)}</div>
                <div class="cust-info">
                  <h3 class="cust-name">${c.name}</h3>
                  <div class="cust-id">ID: ${c.id} • Age: <strong>${c.age} yrs</strong></div>
                </div>
              </div>

              <div class="cust-card-body">
                <div class="cust-contact-line">✉️ ${c.email}</div>
                <div class="cust-contact-line">📞 ${c.phone}</div>
                <div class="cust-contact-line">🛂 Passport: <strong>${c.passportNumber}</strong></div>
                <div class="cust-activity-line">
                  <span class="badge badge-teal">${c.totalQuotes} Quotes Generated</span>
                  <span class="last-active">Active: ${c.lastActive}</span>
                </div>
              </div>

              <div class="cust-card-footer">
                <button class="btn btn-sm btn-outline btn-cust-new-quote" data-cust-name="${c.name}" data-cust-age="${c.age}">
                  ⚡ Quote for ${c.name.split(' ')[0]}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btnNewQuoteForCust')?.addEventListener('click', () => {
      this.app.navigateTo('quotation');
    });

    const search = document.getElementById('custSearchInput');
    search?.addEventListener('input', (e) => {
      this.state.searchTerm = e.target.value;
      this.app.render();
      const input = document.getElementById('custSearchInput');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.querySelectorAll('.btn-cust-new-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-cust-name');
        const age = e.currentTarget.getAttribute('data-cust-age');
        this.app.navigateTo('quotation', { customerName: name, age: Number(age) });
      });
    });
  }
}
