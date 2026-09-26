/**
 * Khanna Travels — Application Router
 * Manages 2 views: 'quote' and 'admin'
 */
import { QuoteView } from './quoteView.js';
import { AdminView } from './adminView.js';
import { healthCheck } from './api.js';

class App {
  constructor() {
    this.views = {
      quote: new QuoteView(this),
      admin: new AdminView(this)
    };
    this.currentView = null;
    this.toastContainer = document.getElementById('toastContainer');

    this._setupNav();
    this._checkDbStatus();

    // Route on load
    const hash = location.hash.replace('#', '') || 'quote';
    this.navigate(['quote', 'admin', 'visa'].includes(hash) ? hash : 'quote');
  }

  _setupNav() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) {
        e.preventDefault();
        this.navigate(btn.dataset.view);
        return;
      }
      const logo = e.target.closest('.header-logo');
      if (logo) {
        e.preventDefault();
        this.navigate('quote');
      }
    });
  }

  navigate(viewId) {
    let targetView = viewId;
    if (viewId === 'visa') {
      this.views.admin.state.adminSection = 'visa-links';
      targetView = 'admin';
      this.currentView = 'visa';
      location.hash = 'visa';
    } else {
      if (!(targetView in this.views)) targetView = 'quote';
      if (targetView === 'admin' && location.hash !== '#visa' && !this.views.admin.state.adminSection) {
        this.views.admin.state.adminSection = 'insurance';
      }
      this.currentView = targetView;
      location.hash = targetView;
    }

    // Update active nav button
    document.querySelectorAll('[data-view]').forEach(btn => {
      if (btn.dataset.view === 'visa') {
        btn.classList.toggle('active', this.currentView === 'visa' || (this.currentView === 'admin' && this.views.admin.state.adminSection === 'visa-links'));
      } else if (btn.dataset.view === 'admin') {
        btn.classList.toggle('active', this.currentView === 'admin' && this.views.admin.state.adminSection !== 'visa-links');
      } else {
        btn.classList.toggle('active', btn.dataset.view === this.currentView);
      }
    });

    // Render into #app
    const appEl = document.getElementById('app');
    const view = this.views[targetView];
    appEl.innerHTML = view.render();
    view.attachEvents(appEl);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async _checkDbStatus() {
    try {
      const health = await healthCheck();
      const banner = document.getElementById('dbBanner');
      if (banner && health.db !== 'connected') {
        banner.textContent = '⚠️  Database not connected — running in offline mode. Add MONGODB_URI to server/.env and restart.';
        banner.classList.add('show');
      }
    } catch {
      // Server not running or offline — show banner
      const banner = document.getElementById('dbBanner');
      if (banner) {
        banner.textContent = '⚠️  API server not reachable. Start the server: cd server && node server.js';
        banner.classList.add('show');
      }
    }
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-text">${message}</span>
      <button class="toast-close" aria-label="Dismiss">×</button>
    `;
    this.toastContainer.appendChild(toast);

    const remove = () => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    };
    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
