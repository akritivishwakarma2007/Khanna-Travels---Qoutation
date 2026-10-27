/**
 * Khanna Travels — Application Router & Access Controller
 * Public Views: 'quote', 'visa', 'login'
 * Admin Views: 'quote', 'visa', 'documents', 'admin'
 */
import { QuoteView } from './quoteView.js';
import { VisaLinksView } from './views/visaLinksView.js';
import { DocumentDetailsView } from './views/documentDetailsView.js';
import { PlansRatesView } from './views/plansRatesView.js';
import { LoginView } from './views/loginView.js';
import { healthCheck, isAdminAuthenticated, logoutAdmin } from './api.js';
import { StorageManager } from './storage.js';

class App {
  constructor() {
    StorageManager.init();
    this.views = {
      quote: new QuoteView(this),
      visa: new VisaLinksView(this),
      documents: new DocumentDetailsView(this),
      admin: new PlansRatesView(this),
      login: new LoginView(this)
    };
    this.currentView = null;
    this.toastContainer = document.getElementById('toastContainer');

    this._setupNav();
    this._checkDbStatus();

    // Route on initial load
    const hash = (location.hash.replace('#', '') || 'quote').toLowerCase();
    this.navigate(hash);
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
        this.navigate('login');
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

    // Handle back/forward navigation and URL changes
    window.addEventListener('hashchange', () => {
      const hash = (location.hash.replace('#', '') || 'quote').toLowerCase();
      if (hash !== this.currentView) {
        this.navigate(hash);
      }
    });
  }

  _updateHeaderUI() {
    const isAuthed = isAdminAuthenticated();

    // Desktop navbar items
    const navDocs = document.getElementById('navDocs');
    if (navDocs) {
      navDocs.style.display = isAuthed ? 'inline-flex' : 'none';
    }
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) {
      navAdmin.style.display = isAuthed ? 'inline-flex' : 'none';
    }

    // Mobile bottom tabs
    const mobNavDocs = document.getElementById('mobNavDocs');
    if (mobNavDocs) {
      mobNavDocs.style.display = isAuthed ? 'flex' : 'none';
    }
    const mobNavAdmin = document.getElementById('mobNavAdmin');
    if (mobNavAdmin) {
      mobNavAdmin.style.display = isAuthed ? 'flex' : 'none';
    }

    // Top logo band (right side auth controls)
    const agentLabel = document.getElementById('agentLabel');
    if (agentLabel) {
      if (isAuthed) {
        agentLabel.innerHTML = `
          <div class="agent-avatar" aria-hidden="true" title="Khanna Travels Admin">KT</div>
          <span class="agent-name">Khanna Agent</span>
          <button type="button" class="btn-header-logout" id="btnHeaderLogout" aria-label="Logout of admin">Logout</button>
        `;
      } else {
        agentLabel.innerHTML = `
          <button type="button" class="btn-header-signin" id="btnHeaderSignIn">
            Sign In to Admin
          </button>
        `;
      }
    }
  }

  navigate(viewId) {
    let targetView = (viewId || 'quote').toLowerCase();

    // Public users cannot reach Document Details or Insurance Plans & Rates
    const adminOnlyViews = ['documents', 'admin'];
    if (adminOnlyViews.includes(targetView) && !isAdminAuthenticated()) {
      targetView = 'login';
    }

    if (!(targetView in this.views)) {
      targetView = 'quote';
    }

    this.currentView = targetView;
    location.hash = targetView;

    this._updateHeaderUI();

    // Update active nav button for both desktop and mobile bottom tabs
    document.querySelectorAll('[data-view]').forEach(btn => {
      const isActive = btn.dataset.view === this.currentView;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    // Render into #app
    const appEl = document.getElementById('app');
    const view = this.views[targetView];
    appEl.innerHTML = view.render();
    if (typeof view.attachEvents === 'function') {
      view.attachEvents(appEl);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  render() {
    const appEl = document.getElementById('app');
    if (!appEl || !this.currentView) return;
    const view = this.views[this.currentView];
    if (view) {
      appEl.innerHTML = view.render();
      if (typeof view.attachEvents === 'function') {
        view.attachEvents(appEl);
      }
    }
  }

  navigateTo(viewId, params = null) {
    const mapped = (viewId || '').toLowerCase();
    if (mapped === 'quotation' || mapped === 'quote') {
      this.navigate('quote');
    } else if (mapped === 'rates' || mapped === 'rate-tables') {
      if (this.views.admin) {
        this.views.admin.activeTab = 'rate-tables';
      }
      this.navigate('admin');
    } else if (mapped === 'companies') {
      if (this.views.admin) {
        this.views.admin.activeTab = 'companies';
      }
      this.navigate('admin');
    } else {
      this.navigate(viewId);
    }
  }

  updateTopBar() {
    this._updateHeaderUI();
  }

  async _checkDbStatus() {
    const banner = document.getElementById('dbBanner');
    try {
      const health = await healthCheck();
      if (banner) {
        if (health.status === 'ok' && health.db === 'connected') {
          banner.classList.remove('show');
        } else if (health.status === 'ok') {
          // Local seed mode - keep unobtrusive
          banner.classList.remove('show');
        }
      }
    } catch {
      if (banner) {
        banner.innerHTML = `
          <div class="db-banner-inner">
            <span>⚠️ API server not reachable. Start local server: <code>cd server &amp;&amp; node server.js</code></span>
            <button type="button" class="db-banner-close" aria-label="Dismiss banner" onclick="document.getElementById('dbBanner')?.classList.remove('show')">✕</button>
          </div>
        `;
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
