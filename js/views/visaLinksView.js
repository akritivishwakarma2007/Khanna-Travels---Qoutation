/**
 * Khanna Travels — Visa Links View (Public & Admin)
 * Official government visa portals and partner portals directory.
 */
import {
  getVisaLinks,
  addVisaLink,
  updateVisaLink,
  deleteVisaLink,
  isAdminAuthenticated
} from '../api.js';

const COUNTRY_CODE_MAP = {
  'usa': 'US',
  'united states': 'US',
  'uk': 'GB',
  'united kingdom': 'GB',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'dubai': 'AE',
  'schengen': 'EU',
  'europe': 'EU',
  'thailand': 'TH',
  'singapore': 'SG',
  'turkey': 'TR',
  'türkiye': 'TR',
  'canada': 'CA',
  'australia': 'AU',
  'japan': 'JP',
  'india': 'IN',
  'vietnam': 'VN',
  'malaysia': 'MY',
  'indonesia': 'ID',
  'saudi arabia': 'SA',
  'saudi': 'SA',
  'russia': 'RU',
  'china': 'CN',
  'philippines': 'PH',
  'sri lanka': 'LK',
  'egypt': 'EG',
  'qatar': 'QA',
  'oman': 'OM',
  'kuwait': 'KW',
  'bahrain': 'BH',
  'georgia': 'GE',
  'azerbaijan': 'AZ'
};

const CHIP_COUNTRIES = [
  { label: 'All countries', value: 'all' },
  { label: 'UAE', value: 'UAE' },
  { label: 'USA', value: 'USA' },
  { label: 'UK', value: 'UK' },
  { label: 'Schengen', value: 'Schengen' },
  { label: 'Thailand', value: 'Thailand' },
  { label: 'Singapore', value: 'Singapore' },
  { label: 'Turkey', value: 'Turkey' },
  { label: 'More', value: 'more' }
];

export class VisaLinksView {
  constructor(app) {
    this.app = app;
    this.links = [];
    this.isLoading = false;
    this.state = {
      searchQuery: '',
      portalFilter: 'all', // 'all' | 'visa' | 'partner'
      selectedCountry: 'all',
      showDuplicatesOnly: false,
      isModalOpen: false,
      editingLink: null
    };
  }

  _getCountryCode(country, title) {
    if (country) {
      const c = country.trim().toLowerCase();
      if (COUNTRY_CODE_MAP[c]) return COUNTRY_CODE_MAP[c];
      if (country.trim().length === 2) return country.trim().toUpperCase();
      const words = country.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return country.trim().substring(0, 2).toUpperCase();
    }
    if (title) {
      const t = title.trim().toLowerCase();
      for (const [k, v] of Object.entries(COUNTRY_CODE_MAP)) {
        if (t.includes(k)) return v;
      }
      return title.trim().substring(0, 2).toUpperCase();
    }
    return 'KT';
  }

  _getCleanDomain(rawUrl) {
    if (!rawUrl) return '';
    try {
      let u = rawUrl.trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      const parsed = new URL(u);
      return parsed.hostname.replace(/^www\./i, '');
    } catch {
      return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }
  }

  _findDuplicates() {
    const counts = {};
    const dupMap = new Set();
    this.links.forEach(l => {
      const key = (this._getCleanDomain(l.url) || l.title || '').toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    this.links.forEach(l => {
      const key = (this._getCleanDomain(l.url) || l.title || '').toLowerCase();
      if (counts[key] > 1) {
        dupMap.add(l._id);
      }
    });
    return dupMap;
  }

  render() {
    const isAuthed = isAdminAuthenticated();
    const query = (this.state.searchQuery || '').toLowerCase().trim();
    const selCountry = this.state.selectedCountry;
    const portalFilter = this.state.portalFilter;
    const dupMap = isAuthed ? this._findDuplicates() : new Set();
    const dupCount = dupMap.size;

    // Filter list
    let filtered = [...this.links];

    // Filter by Public vs Admin access
    if (!isAuthed) {
      // Public visitors do not see partner portals or partner links
      filtered = filtered.filter(l => (l.category || '').toLowerCase() !== 'partner portal');
    }

    // Portal filter
    if (portalFilter === 'visa') {
      filtered = filtered.filter(l => (l.category || '').toLowerCase() !== 'partner portal');
    } else if (portalFilter === 'partner' && isAuthed) {
      filtered = filtered.filter(l => (l.category || '').toLowerCase() === 'partner portal');
    }

    // Country filter
    if (selCountry && selCountry !== 'all') {
      if (selCountry === 'more') {
        const standard = ['uae', 'united arab emirates', 'dubai', 'usa', 'united states', 'uk', 'united kingdom', 'schengen', 'europe', 'thailand', 'singapore', 'turkey', 'türkiye'];
        filtered = filtered.filter(l => {
          const c = (l.country || '').toLowerCase().trim();
          return c && !standard.includes(c);
        });
      } else {
        const sc = selCountry.toLowerCase();
        filtered = filtered.filter(l => {
          const c = (l.country || '').toLowerCase();
          const t = (l.title || '').toLowerCase();
          return c.includes(sc) || t.includes(sc);
        });
      }
    }

    // Search query filter
    if (query) {
      filtered = filtered.filter(l => {
        const t = (l.title || '').toLowerCase();
        const u = (l.url || '').toLowerCase();
        const c = (l.country || '').toLowerCase();
        const n = (l.notes || '').toLowerCase();
        return t.includes(query) || u.includes(query) || c.includes(query) || n.includes(query);
      });
    }

    // Show duplicates only
    if (this.state.showDuplicatesOnly && isAuthed) {
      filtered = filtered.filter(l => dupMap.has(l._id));
    }

    // Separate into Visa Portals vs Partner Portals
    const visaPortals = filtered.filter(l => (l.category || '').toLowerCase() !== 'partner portal');
    const partnerPortals = isAuthed ? filtered.filter(l => (l.category || '').toLowerCase() === 'partner portal') : [];

    return `
      <div class="visa-page-container">

        <!-- Top Header -->
        <div class="page-header-row" style="margin-bottom: 20px;">
          <div>
            <h1 class="page-title">Visa Links</h1>
            <p class="page-subtitle">Official government visa portals and authorized application links.</p>
          </div>
          ${isAuthed ? `
            <div class="page-header-actions">
              <button type="button" class="btn btn-primary" id="btnOpenAddVisaModal" style="background: var(--navy); color: #fff; height: 44px; padding: 0 18px; border-radius: 8px; font-weight: 700; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                + Add Link
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Filter Card -->
        <div class="visa-filter-card" style="background: #ffffff; border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(20, 35, 63, 0.04);">
          
          <!-- Search box & Portal Toggle Row -->
          <div class="visa-filter-top-row" style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 16px;">
            
            <!-- Search Box -->
            <div class="visa-search-box" style="flex: 1; min-width: 240px; position: relative;">
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none;" aria-hidden="true">
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
              </svg>
              <input
                type="text"
                id="visaSearchInput"
                placeholder="Search visa links by country or title..."
                value="${this._esc(this.state.searchQuery)}"
                style="width: 100%; height: 44px; padding: 0 14px 0 42px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
              />
              ${this.state.searchQuery ? `
                <button type="button" id="btnClearVisaSearch" aria-label="Clear search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; font-size: 14px;">✕</button>
              ` : ''}
            </div>

            <!-- Toggle (All / Visa portals / Partner portals [Admin only]) -->
            <div class="visa-portal-toggle" style="display: inline-flex; background: var(--tint); border: 1px solid var(--line); border-radius: 8px; padding: 3px; height: 44px; box-sizing: border-box;">
              <button type="button" class="visa-toggle-opt ${portalFilter === 'all' ? 'active' : ''}" data-portal-filter="all" style="border: none; background: ${portalFilter === 'all' ? '#ffffff' : 'transparent'}; color: ${portalFilter === 'all' ? 'var(--navy)' : 'var(--muted)'}; font-weight: 700; font-size: 13px; padding: 0 14px; border-radius: 6px; cursor: pointer; box-shadow: ${portalFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                All
              </button>
              <button type="button" class="visa-toggle-opt ${portalFilter === 'visa' ? 'active' : ''}" data-portal-filter="visa" style="border: none; background: ${portalFilter === 'visa' ? '#ffffff' : 'transparent'}; color: ${portalFilter === 'visa' ? 'var(--navy)' : 'var(--muted)'}; font-weight: 700; font-size: 13px; padding: 0 14px; border-radius: 6px; cursor: pointer; box-shadow: ${portalFilter === 'visa' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                Visa portals
              </button>
              ${isAuthed ? `
                <button type="button" class="visa-toggle-opt ${portalFilter === 'partner' ? 'active' : ''}" data-portal-filter="partner" style="border: none; background: ${portalFilter === 'partner' ? '#ffffff' : 'transparent'}; color: ${portalFilter === 'partner' ? 'var(--navy)' : 'var(--muted)'}; font-weight: 700; font-size: 13px; padding: 0 14px; border-radius: 6px; cursor: pointer; box-shadow: ${portalFilter === 'partner' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                  Partner portals
                </button>
              ` : ''}
            </div>

          </div>

          <!-- One row of country chips (PC: wraps, Mobile: scrolls sideways) -->
          <div class="visa-country-chips-row" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px;">
            ${CHIP_COUNTRIES.map(chip => {
              const isActive = selCountry === chip.value;
              return `
                <button
                  type="button"
                  class="visa-chip ${isActive ? 'active' : ''}"
                  data-country-chip="${chip.value}"
                  style="white-space: nowrap; height: 34px; padding: 0 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid ${isActive ? 'var(--red)' : 'var(--line)'}; background: ${isActive ? 'var(--red)' : 'var(--white)'}; color: ${isActive ? '#ffffff' : 'var(--ink)'}; transition: all 0.15s ease;"
                >
                  ${chip.label}
                </button>
              `;
            }).join('')}
          </div>

        </div>

        <!-- Admin Only: Amber duplicate notice if duplicates exist -->
        ${(isAuthed && dupCount > 0) ? `
          <div class="visa-dup-notice" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; margin-bottom: 24px; color: #92400e; font-size: 13px;">
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 600;">
              <span style="font-size: 16px;">⚠️</span>
              <span>${dupCount} duplicate link${dupCount !== 1 ? 's' : ''} found. Review and remove one.</span>
            </div>
            <button
              type="button"
              id="btnReviewDuplicates"
              style="padding: 6px 14px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; color: #78350f; font-weight: 700; font-size: 12px; cursor: pointer;"
            >
              ${this.state.showDuplicatesOnly ? 'Show All Links' : 'Review'}
            </button>
          </div>
        ` : ''}

        <!-- Section 1: VISA PORTALS -->
        <div class="visa-section-block" style="margin-bottom: 32px;">
          <div class="visa-section-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
            <h2 style="font-size: 12px; font-weight: 800; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase;">
              VISA PORTALS
            </h2>
            <span class="admin-badge-count" style="background: var(--tint); color: var(--navy); font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--line);">
              ${visaPortals.length}
            </span>
          </div>

          ${visaPortals.length === 0 ? `
            <div style="background: #ffffff; border: 1px solid var(--line); border-radius: 16px; padding: 36px 20px; text-align: center; color: var(--muted); font-size: 14px;">
              No visa portals matching your filters.
            </div>
          ` : `
            <div class="visa-cards-grid">
              ${visaPortals.map(link => this._renderLinkCard(link, isAuthed)).join('')}
            </div>
          `}
        </div>

        <!-- Section 2: PARTNER PORTALS (Admin only) -->
        ${isAuthed ? `
          <div class="visa-section-block" style="margin-bottom: 32px;">
            <div class="visa-section-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
              <h2 style="font-size: 12px; font-weight: 800; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase;">
                PARTNER PORTALS
              </h2>
              <span class="admin-badge-count" style="background: var(--tint); color: var(--navy); font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--line);">
                ${partnerPortals.length}
              </span>
              <span style="font-size: 11px; font-weight: 700; color: var(--red); background: #fdeceb; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                Admin only
              </span>
            </div>

            ${partnerPortals.length === 0 ? `
              <div style="background: #ffffff; border: 1px solid var(--line); border-radius: 16px; padding: 36px 20px; text-align: center; color: var(--muted); font-size: 14px;">
                No partner portals found.
              </div>
            ` : `
              <div class="visa-cards-grid">
                ${partnerPortals.map(link => this._renderLinkCard(link, isAuthed)).join('')}
              </div>
            `}
          </div>
        ` : ''}

        <!-- Add / Edit Modal -->
        ${this.state.isModalOpen ? this._renderAddEditModal() : ''}

      </div>
    `;
  }

  _renderLinkCard(link, isAuthed) {
    const code = this._getCountryCode(link.country, link.title);
    const domain = this._getCleanDomain(link.url);
    const isPartner = (link.category || '').toLowerCase() === 'partner portal';

    return `
      <div class="visa-link-card" data-link-id="${link._id}">
        
        <!-- PC Card Body / Mobile compact flex -->
        <div class="vlc-main-row">
          
          <!-- 44px Square Badge with Country Code -->
          <div class="vlc-badge" aria-hidden="true">${code}</div>

          <!-- Info Block -->
          <div class="vlc-info">
            <div class="vlc-title-row">
              <span class="vlc-title" title="${this._esc(link.title)}">${this._esc(link.title)}</span>
              <span class="vlc-tag ${isPartner ? 'tag-partner' : 'tag-visa'}">
                ${isPartner ? 'Partner portal' : 'Visa portal'}
              </span>
            </div>
            <div class="vlc-domain" title="${this._esc(domain)}">${this._esc(domain)}</div>
          </div>

        </div>

        <!-- Buttons Row (Open & Copy, plus Admin ⋯ menu / Edit & Delete) -->
        <div class="vlc-actions-row">
          <a
            href="${this._esc(link.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="vlc-btn-open"
            aria-label="Open ${this._esc(link.title)} in new tab"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
            </svg>
            <span class="vlc-btn-text">Open</span>
          </a>

          <button
            type="button"
            class="vlc-btn-copy"
            data-copy-url="${this._esc(link.url)}"
            aria-label="Copy ${this._esc(link.title)} URL"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
            </svg>
            <span class="vlc-btn-text">Copy</span>
          </button>

          ${isAuthed ? `
            <div class="vlc-admin-actions">
              <button
                type="button"
                class="vlc-btn-edit"
                data-edit-link-id="${link._id}"
                aria-label="Edit ${this._esc(link.title)}"
                title="Edit Link"
              >
                ✏️
              </button>
              <button
                type="button"
                class="vlc-btn-del"
                data-del-link-id="${link._id}"
                aria-label="Delete ${this._esc(link.title)}"
                title="Delete Link"
              >
                🗑️
              </button>
            </div>
          ` : ''}
        </div>

      </div>
    `;
  }

  _renderAddEditModal() {
    const edit = this.state.editingLink;
    const isEditing = Boolean(edit);

    return `
      <div class="modal-backdrop" id="visaModalBackdrop" style="position: fixed; inset: 0; background: rgba(20, 35, 63, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div class="modal-card" style="width: 100%; max-width: 480px; background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border: 1px solid var(--line);">
          
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h2 style="font-size: 18px; font-weight: 800; color: var(--navy); margin: 0;">
              ${isEditing ? 'Edit Visa Link' : 'Add New Visa Link'}
            </h2>
            <button type="button" id="btnCloseVisaModal" aria-label="Close modal" style="background: none; border: none; font-size: 20px; color: var(--muted); cursor: pointer; padding: 4px;">✕</button>
          </div>

          <form id="visaLinkForm" novalidate>
            <div style="margin-bottom: 16px;">
              <label for="vfTitle" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                Link Title <span style="color: var(--red);">*</span>
              </label>
              <input
                type="text"
                id="vfTitle"
                class="form-input"
                placeholder="e.g. USA Visa Official Portal"
                value="${this._esc(edit ? edit.title : '')}"
                required
                style="width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
              />
            </div>

            <div style="margin-bottom: 16px;">
              <label for="vfUrl" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                Website URL <span style="color: var(--red);">*</span>
              </label>
              <input
                type="url"
                id="vfUrl"
                class="form-input"
                placeholder="https://..."
                value="${this._esc(edit ? edit.url : '')}"
                required
                style="width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
              />
            </div>

            <div style="display: flex; gap: 14px; margin-bottom: 16px;">
              <div style="flex: 1;">
                <label for="vfCountry" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                  Country
                </label>
                <input
                  type="text"
                  id="vfCountry"
                  class="form-input"
                  placeholder="e.g. USA, UK, UAE"
                  value="${this._esc(edit ? edit.country || '' : '')}"
                  style="width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
                />
              </div>

              <div style="flex: 1;">
                <label for="vfCategory" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                  Portal Type
                </label>
                <select
                  id="vfCategory"
                  style="width: 100%; height: 44px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; background: #fff;"
                >
                  <option value="Visa portal" ${!edit || edit.category !== 'Partner portal' ? 'selected' : ''}>Visa portal</option>
                  <option value="Partner portal" ${edit && edit.category === 'Partner portal' ? 'selected' : ''}>Partner portal</option>
                </select>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <label for="vfNotes" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                Notes (Optional)
              </label>
              <input
                type="text"
                id="vfNotes"
                class="form-input"
                placeholder="Optional notes or instructions"
                value="${this._esc(edit ? edit.notes || '' : '')}"
                style="width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
              />
            </div>

            <div id="vfError" style="display: none; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; margin-bottom: 16px;"></div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button
                type="button"
                id="btnCancelVisaModal"
                style="height: 44px; padding: 0 16px; border: 1.5px solid var(--line); border-radius: 8px; background: transparent; font-size: 13px; font-weight: 700; color: var(--ink); cursor: pointer;"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btnSubmitVisaForm"
                style="height: 44px; padding: 0 20px; border: none; border-radius: 8px; background: var(--navy); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;"
              >
                ${isEditing ? 'Save Changes' : 'Add Link'}
              </button>
            </div>
          </form>

        </div>
      </div>
    `;
  }

  async loadData() {
    try {
      this.isLoading = true;
      const data = await getVisaLinks();
      this.links = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('Could not load visa links:', err.message);
    } finally {
      this.isLoading = false;
    }
  }

  attachEvents(container) {
    // Initial fetch if list is empty
    if (this.links.length === 0 && !this.isLoading) {
      this.loadData().then(() => {
        container.innerHTML = this.render();
        this.attachEvents(container);
      });
    }

    // Search input
    const searchInput = container.querySelector('#visaSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value;
        this._refresh(container);
      });
    }

    // Clear search
    const clearSearch = container.querySelector('#btnClearVisaSearch');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.state.searchQuery = '';
        this._refresh(container);
      });
    }

    // Portal filter toggle (All / Visa / Partner)
    container.querySelectorAll('[data-portal-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.portalFilter = btn.dataset.portalFilter;
        this._refresh(container);
      });
    });

    // Country chips
    container.querySelectorAll('[data-country-chip]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.selectedCountry = btn.dataset.countryChip;
        this._refresh(container);
      });
    });

    // Review duplicates button
    const reviewDupBtn = container.querySelector('#btnReviewDuplicates');
    if (reviewDupBtn) {
      reviewDupBtn.addEventListener('click', () => {
        this.state.showDuplicatesOnly = !this.state.showDuplicatesOnly;
        this._refresh(container);
      });
    }

    // Copy link buttons
    container.querySelectorAll('[data-copy-url]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = btn.dataset.copyUrl;
        try {
          await navigator.clipboard.writeText(url);
          this.app.showToast('Link copied to clipboard: ' + url, 'success');
        } catch {
          // Fallback prompt
          window.prompt('Copy URL:', url);
        }
      });
    });

    // Admin: Open Add Modal
    const openAddBtn = container.querySelector('#btnOpenAddVisaModal');
    if (openAddBtn) {
      openAddBtn.addEventListener('click', () => {
        this.state.editingLink = null;
        this.state.isModalOpen = true;
        this._refresh(container);
      });
    }

    // Admin: Edit Link
    container.querySelectorAll('[data-edit-link-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editLinkId;
        const link = this.links.find(l => String(l._id) === String(id));
        if (link) {
          this.state.editingLink = link;
          this.state.isModalOpen = true;
          this._refresh(container);
        }
      });
    });

    // Admin: Delete Link
    container.querySelectorAll('[data-del-link-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delLinkId;
        const link = this.links.find(l => String(l._id) === String(id));
        if (!link) return;
        if (window.confirm(`Delete "${link.title}"?`)) {
          try {
            await deleteVisaLink(id);
            this.app.showToast('Visa link deleted', 'info');
            this.links = this.links.filter(l => String(l._id) !== String(id));
            this._refresh(container);
          } catch (err) {
            this.app.showToast(err.message || 'Failed to delete link', 'error');
          }
        }
      });
    });

    // Modal Close
    const closeBtn = container.querySelector('#btnCloseVisaModal');
    const cancelBtn = container.querySelector('#btnCancelVisaModal');
    const backdrop = container.querySelector('#visaModalBackdrop');
    const closeModal = () => {
      this.state.isModalOpen = false;
      this.state.editingLink = null;
      this._refresh(container);
    };
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    // Modal Form Submit
    const form = container.querySelector('#visaLinkForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = container.querySelector('#vfTitle')?.value.trim();
        const url = container.querySelector('#vfUrl')?.value.trim();
        const country = container.querySelector('#vfCountry')?.value.trim();
        const category = container.querySelector('#vfCategory')?.value;
        const notes = container.querySelector('#vfNotes')?.value.trim();
        const errEl = container.querySelector('#vfError');

        if (!title || !url) {
          if (errEl) {
            errEl.textContent = 'Title and URL are required.';
            errEl.style.display = 'block';
          }
          return;
        }

        try {
          if (this.state.editingLink) {
            const updated = await updateVisaLink(this.state.editingLink._id, {
              title,
              url,
              country,
              category,
              notes
            });
            const idx = this.links.findIndex(l => String(l._id) === String(this.state.editingLink._id));
            if (idx !== -1) {
              this.links[idx] = updated;
            }
            this.app.showToast('Visa link updated', 'success');
          } else {
            const created = await addVisaLink({
              title,
              url,
              country,
              category,
              notes
            });
            this.links.unshift(created);
            this.app.showToast('Visa link added', 'success');
          }
          this.state.isModalOpen = false;
          this.state.editingLink = null;
          this._refresh(container);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Error saving link';
            errEl.style.display = 'block';
          }
        }
      });
    }
  }

  _refresh(container) {
    container.innerHTML = this.render();
    this.attachEvents(container);
  }

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
