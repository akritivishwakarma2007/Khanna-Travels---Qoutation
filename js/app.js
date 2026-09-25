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
    this.navigate(hash in this.views ? hash : 'quote');
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
    if (!(viewId in this.views)) viewId = 'quote';
    this.currentView = viewId;
    location.hash = viewId;

    // Update active nav button
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Render into #app
    const appEl = document.getElementById('app');
    const view = this.views[viewId];
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
