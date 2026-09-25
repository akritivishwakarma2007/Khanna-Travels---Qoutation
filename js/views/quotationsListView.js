/**
 * Saved Quotations Ledger View
 */
import { StorageManager } from '../storage.js';
import { QuotationExporter } from '../pdf-export.js';

export class QuotationsListView {
  constructor(app) {
    this.app = app;
    this.state = {
      searchTerm: '',
      statusFilter: 'all'
    };
  }

  render() {
    let quotes = StorageManager.getQuotations();

    if (this.state.searchTerm) {
      const term = this.state.searchTerm.toLowerCase();
      quotes = quotes.filter(q => 
        (q.customerName && q.customerName.toLowerCase().includes(term)) ||
        (q.id && q.id.toLowerCase().includes(term)) ||
        (q.destinationCountry && q.destinationCountry.toLowerCase().includes(term)) ||
        (q.planName && q.planName.toLowerCase().includes(term))
      );
    }

    if (this.state.statusFilter !== 'all') {
      quotes = quotes.filter(q => (q.status || 'Active').toLowerCase() === this.state.statusFilter.toLowerCase());
    }

    return `
      <div class="quotes-list-page-container">
        <!-- Header -->
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Quotation Ledger & Archives</h1>
            <p class="page-subtitle">Track, reprint, email, and convert generated travel insurance proposals</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-orange" id="btnNewQuoteFromList">➕ Create New Quotation</button>
          </div>
        </div>

        <!-- Toolbar / Search -->
        <div class="matrix-filter-card">
          <div class="filter-group-grid" style="grid-template-columns: 2fr 1fr auto;">
            <div class="filter-item">
              <label class="filter-label">Search Quotations</label>
              <input type="text" id="quoteSearchInput" class="form-control" placeholder="Search by customer name, quote reference, or destination..." value="${this.state.searchTerm}">
            </div>
            <div class="filter-item">
              <label class="filter-label">Filter by Status</label>
              <select id="quoteStatusSelect" class="form-control">
                <option value="all" ${this.state.statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="active" ${this.state.statusFilter === 'active' ? 'selected' : ''}>Active</option>
                <option value="sent" ${this.state.statusFilter === 'sent' ? 'selected' : ''}>Sent</option>
                <option value="accepted" ${this.state.statusFilter === 'accepted' ? 'selected' : ''}>Accepted</option>
                <option value="draft" ${this.state.statusFilter === 'draft' ? 'selected' : ''}>Draft</option>
              </select>
            </div>
            <div class="filter-item" style="align-self: flex-end;">
              <button class="btn btn-outline" id="btnClearQuoteSearch">Clear</button>
            </div>
          </div>
        </div>

        <!-- Table Card -->
        <div class="table-card">
          <div class="table-scroll-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Quote Ref</th>
                  <th>Created Date</th>
                  <th>Customer Name</th>
                  <th>Destination</th>
                  <th>Dates & Duration</th>
                  <th>Sum Insured</th>
                  <th>Plan Selected</th>
                  <th>Premium</th>
                  <th>Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${quotes.length === 0 ? `
                  <tr>
                    <td colspan="10" style="text-align:center; padding: 2.5rem; color: #64748b;">
                      No quotations match the specified criteria.
                    </td>
                  </tr>
                ` : quotes.map(q => `
                  <tr>
                    <td><strong class="text-navy">${q.id}</strong></td>
                    <td>${q.date || '2026-09-15'}</td>
                    <td>
                      <div><strong>${q.customerName}</strong></div>
                      <div class="cust-age">${q.customerAge} yrs • ${q.travelersCount || 1} traveler(s)</div>
                    </td>
                    <td><strong>✈️ ${q.destinationCountry}</strong></td>
                    <td>
                      <div>${q.departureDate} → ${q.returnDate}</div>
                      <div class="cust-age">${q.durationDays} Days (${q.slabId || 'Slab'})</div>
                    </td>
                    <td>USD $${Number(q.coverageAmount).toLocaleString()}</td>
                    <td>
                      <span class="plan-cell">${q.planName}</span>
                    </td>
                    <td><strong class="text-teal">$${q.premium || q.totalPremium}</strong></td>
                    <td>
                      <span class="status-pill status-${(q.status || 'Active').toLowerCase()}">${q.status || 'Active'}</span>
                    </td>
                    <td style="text-align:right;">
                      <div class="action-btn-group">
                        <button class="btn btn-xs btn-outline btn-print-row-quote" data-quote-id="${q.id}" title="Print / PDF">🖨️</button>
                        <button class="btn btn-xs btn-outline btn-email-row-quote" data-quote-id="${q.id}" title="Email">✉️</button>
                        <button class="btn btn-xs btn-secondary btn-view-row-quote" data-quote-id="${q.id}">View</button>
                        <button class="btn btn-xs btn-danger-outline btn-delete-row-quote" data-quote-id="${q.id}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div id="quoteListModalContainer"></div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btnNewQuoteFromList')?.addEventListener('click', () => {
      this.app.navigateTo('quotation');
    });

    const searchInput = document.getElementById('quoteSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.state.searchTerm = e.target.value;
      this.app.render();
      const input = document.getElementById('quoteSearchInput');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.getElementById('quoteStatusSelect')?.addEventListener('change', (e) => {
      this.state.statusFilter = e.target.value;
      this.app.render();
    });

    document.getElementById('btnClearQuoteSearch')?.addEventListener('click', () => {
      this.state.searchTerm = '';
      this.state.statusFilter = 'all';
      this.app.render();
    });

    // View quote modal
    document.querySelectorAll('.btn-view-row-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-quote-id');
        this.openQuoteModal(id);
      });
    });

    // Print quote
    document.querySelectorAll('.btn-print-row-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-quote-id');
        const quotes = StorageManager.getQuotations();
        const quote = quotes.find(q => q.id === id);
        if (quote) QuotationExporter.printQuotation(quote);
      });
    });

    // Email quote
    document.querySelectorAll('.btn-email-row-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-quote-id');
        const quotes = StorageManager.getQuotations();
        const quote = quotes.find(q => q.id === id);
        if (quote) this.openEmailModal(quote);
      });
    });

    // Delete quote
    document.querySelectorAll('.btn-delete-row-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-quote-id');
        if (confirm(`Are you sure you want to delete quotation ${id}?`)) {
          StorageManager.deleteQuotation(id);
          this.app.showToast(`Quotation ${id} deleted.`, 'info');
          this.app.render();
        }
      });
    });
  }

  openQuoteModal(quoteId) {
    const quotes = StorageManager.getQuotations();
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

    const modalContainer = document.getElementById('quoteListModalContainer');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-backdrop" id="quoteListModalBackdrop">
        <div class="modal-dialog modal-lg">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Quotation Details — ${quote.id}</h3>
              <div class="modal-subtitle">Customer: ${quote.customerName} • Status: ${quote.status || 'Active'}</div>
            </div>
            <button class="modal-close" id="btnCloseListQuoteModal">&times;</button>
          </div>

          <div class="modal-body quotation-modal-body">
            ${QuotationExporter.renderQuotationDocument(quote)}
          </div>

          <div class="modal-footer">
            <div class="modal-footer-left">
              <button class="btn btn-outline" id="btnListModalEmail">✉️ Email Client</button>
              <button class="btn btn-primary" id="btnListModalPrint">🖨️ Print / Download PDF</button>
            </div>
            <button class="btn btn-secondary" id="btnListModalClose">Close</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalContainer.innerHTML = ''; };
    document.getElementById('btnCloseListQuoteModal')?.addEventListener('click', close);
    document.getElementById('btnListModalClose')?.addEventListener('click', close);
    document.getElementById('quoteListModalBackdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'quoteListModalBackdrop') close();
    });

    document.getElementById('btnListModalPrint')?.addEventListener('click', () => {
      QuotationExporter.printQuotation(quote);
    });

    document.getElementById('btnListModalEmail')?.addEventListener('click', () => {
      this.openEmailModal(quote);
    });
  }

  openEmailModal(quote) {
    const emailData = QuotationExporter.getEmailContent(quote);

    const emailModalHtml = `
      <div class="modal-backdrop" id="emailModalBackdrop" style="z-index: 1060;">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Send Quotation Email</h3>
            <button class="modal-close" id="btnCloseEmailModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Recipient Email</label>
              <input type="email" id="emailRecipientInput" class="form-control" value="${emailData.to}">
            </div>
            <div class="form-group">
              <label class="form-label">Subject</label>
              <input type="text" id="emailSubjectInput" class="form-control" value="${emailData.subject}">
            </div>
            <div class="form-group">
              <label class="form-label">Body</label>
              <textarea id="emailBodyInput" class="form-control" rows="8" style="font-family: monospace; font-size: 0.85rem;">${emailData.body}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelEmailModal">Cancel</button>
            <button class="btn btn-primary" id="btnSendEmailAction">Send Email</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.id = 'emailListModalWrapper';
    div.innerHTML = emailModalHtml;
    document.body.appendChild(div);

    const closeEmail = () => { div.remove(); };
    document.getElementById('btnCloseEmailModal')?.addEventListener('click', closeEmail);
    document.getElementById('btnCancelEmailModal')?.addEventListener('click', closeEmail);
    document.getElementById('btnSendEmailAction')?.addEventListener('click', () => {
      this.app.showToast('Email sent to client.', 'success');
      closeEmail();
    });
  }
}
