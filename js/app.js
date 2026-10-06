/**
 * Khanna Travels — Application Router
 * Manages 2 views: 'quote' and 'admin'
 */
import { QuoteView } from './quoteView.js';
import { AdminView } from './adminView.js';
import { healthCheck, isAdminAuthenticated, logoutAdmin } from './api.js';

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
    this._updateHeaderUI();

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) {
        e.preventDefault();
        this.navigate(btn.dataset.view);
        return;
      }
      const signInBtn = e.target.closest('#btnHeaderSignIn');
      if (signInBtn) {
        e.preventDefault();
        this.navigate('admin');
        return;
      }
      const logoutBtn = e.target.closest('#btnHeaderLogout');
      if (logoutBtn) {
        e.preventDefault();
        logoutAdmin();
        this.showToast('Logged out of admin portal', 'info');
        this._updateHeaderUI();
        this.navigate('quote');
        return;
      }
      const logo = e.target.closest('.header-logo');
      if (logo) {
        e.preventDefault();
        this.navigate('quote');
      }
    });
  }

  _updateHeaderUI() {
    const isAuthed = isAdminAuthenticated();
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) {
      navAdmin.style.display = isAuthed ? 'inline-flex' : 'none';
    }

    const agentLabel = document.getElementById('agentLabel');
    if (agentLabel) {
      if (isAuthed) {
        agentLabel.innerHTML = `
          <div class="agent-avatar" aria-hidden="true">KT</div>
          <span>Khanna Admin</span>
          <button type="button" class="nav-btn btn-admin-logout" id="btnHeaderLogout" style="margin-left:0.5rem; padding: 0.35rem 0.75rem; border: 1px solid var(--gray-300); font-size: 0.8125rem;">Logout</button>
        `;
      } else {
        agentLabel.innerHTML = `
          <button type="button" class="nav-btn btn-admin-signin" id="btnHeaderSignIn" style="background: var(--navy); color: #fff; border: 1px solid var(--navy-light, #1e293b); padding: 0.4rem 0.85rem; border-radius: var(--radius-md, 6px); font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            Sign In to Admin
          </button>
        `;
      }
    }
  }

  navigate(viewId) {
    let targetView = viewId;

    if (viewId === 'visa') {
      this.views.admin.state.adminSection = 'visa-links';
      targetView = 'admin';
      this.currentView = 'visa';
      location.hash = 'visa';
    } else if (viewId === 'admin') {
      this.views.admin.state.adminSection = 'insurance';
      targetView = 'admin';
      this.currentView = 'admin';
      location.hash = 'admin';
    } else {
      if (!(targetView in this.views)) targetView = 'quote';
      this.currentView = targetView;
      location.hash = targetView;
    }

    this._updateHeaderUI();

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
