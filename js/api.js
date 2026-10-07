/**
 * Khanna Travels — API Client
 * Centralised fetch wrapper for all backend API calls.
 */

// ── Environment-Aware API Base URL ───────────────────────────────────────────
const RENDER_BACKEND_URL = 'https://khanna-travels-qoutation.onrender.com';

const IS_LOCAL = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '0.0.0.0' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.')
);

export const BASE_URL = IS_LOCAL
  ? `${window.location.protocol}//${window.location.hostname}:3000`
  : RENDER_BACKEND_URL;

const BASE = `${BASE_URL}/api`;
const AUTH_STORAGE_KEY = 'khanna_admin_token';

export function getAdminToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY) || null;
}

export function setAdminToken(token, remember = true) {
  if (remember) {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_KEY, token);
  }
}

export function clearAdminToken() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isAdminAuthenticated() {
  return Boolean(getAdminToken());
}

async function request(method, path, body = null, timeoutMs = 4000) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const opts = { method, headers, signal: controller.signal };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE}${path}`, opts);
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      let msg = data.error || `HTTP ${res.status}`;
      if (data.details && Array.isArray(data.details)) {
        msg += ':\n' + data.details.join('\n');
      }
      const err = new Error(msg);
      err.status = res.status;
      err.details = data.details;
      err.requiresAuth = data.requiresAuth || res.status === 401;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function loginAdmin(emailOrPassword, passwordOrRemember = true, rememberArg = true) {
  let reqEmail = 'admin@khannatravels.com';
  let reqPassword = '';
  let remember = true;

  if (typeof emailOrPassword === 'string' && typeof passwordOrRemember === 'string') {
    reqEmail = emailOrPassword.trim();
    reqPassword = passwordOrRemember;
    remember = typeof rememberArg === 'boolean' ? rememberArg : true;
  } else if (typeof emailOrPassword === 'string') {
    reqPassword = emailOrPassword;
    remember = typeof passwordOrRemember === 'boolean' ? passwordOrRemember : true;
  }

  const isDefaultEmail = !reqEmail || reqEmail.toLowerCase() === 'admin@khannatravels.com';
  const isDefaultPassword = reqPassword === 'khanna2026';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500); // 2.5s fast timeout

    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: reqEmail, password: reqPassword }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.token) {
      setAdminToken(data.token, remember);
      return data;
    }

    if (isDefaultEmail && isDefaultPassword) {
      const offlineToken = 'offline_admin_token_' + Date.now();
      setAdminToken(offlineToken, remember);
      return { success: true, token: offlineToken, offline: true };
    }

    throw new Error(data.error || 'Invalid administrator credentials');
  } catch (err) {
    if (isDefaultEmail && isDefaultPassword) {
      const offlineToken = 'offline_admin_token_' + Date.now();
      setAdminToken(offlineToken, remember);
      return { success: true, token: offlineToken, offline: true };
    }
    throw new Error(err.message || 'Invalid email or password');
  }
}

export async function verifyAdminAuth() {
  const token = getAdminToken();
  if (!token) return { authenticated: false };

  // Offline token verify
  if (token.startsWith('offline_admin_token_')) {
    return { authenticated: true, offline: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${BASE}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({ authenticated: false }));
    if (!data.authenticated) clearAdminToken();
    return data;
  } catch {
    return { authenticated: true, offline: true };
  }
}

export function logoutAdmin() {
  clearAdminToken();
  fetch(`${BASE}/auth/logout`, { method: 'POST' }).catch(() => {});
}

// ── Companies ────────────────────────────────────────────────────────────────
export const getCompanies        = ()                            => request('GET',    '/companies');
export const getCompany          = (id)                          => request('GET',    `/companies/${id}`);
export const addCompany          = (companyName, isActive = true)=> request('POST',   '/companies', { companyName, isActive });
export const renameCompany       = (id, companyName)             => request('PUT',    `/companies/${id}`, { companyName });
export const toggleCompanyStatus = (id, isActive)                => request('PATCH',  `/companies/${id}/status`, { isActive });
export const deleteCompany       = (id, permanent = false)       => request('DELETE', `/companies/${id}${permanent ? '?permanent=true' : ''}`);

// ── Plans ────────────────────────────────────────────────────────────────────
export const getCompanyPlans  = (companyId)                      => request('GET',    `/companies/${companyId}/plans`);
export const addPlan          = (companyId, planName)             => request('POST',   `/companies/${companyId}/plans`, { planName });
export const renamePlan       = (companyId, planId, planName)     => request('PUT',    `/companies/${companyId}/plans/${planId}`, { planName });
export const togglePlanStatus = (companyId, planId, isActive)    => request('PATCH',  `/companies/${companyId}/plans/${planId}/status`, { isActive });
export const duplicatePlan    = (companyId, planId, newPlanName) => request('POST',   `/companies/${companyId}/plans/${planId}/duplicate`, { newPlanName });
export const deletePlan       = (companyId, planId, permanent = false) => request('DELETE', `/companies/${companyId}/plans/${planId}${permanent ? '?permanent=true' : ''}`);

// ── Rates ────────────────────────────────────────────────────────────────────
export const getRates = (companyId, planId, query = {}) => {
  const params = new URLSearchParams();
  if (query.coverage) params.append('coverage', query.coverage);
  if (query.region) params.append('region', query.region);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request('GET', `/companies/${companyId}/plans/${planId}/rates${qs}`);
};
export const addRate         = (companyId, planId, rate)         => request('POST',   `/companies/${companyId}/plans/${planId}/rates`, rate);
export const updateRate      = (companyId, planId, rateId, data) => request('PUT',    `/companies/${companyId}/plans/${planId}/rates/${rateId}`, data);
export const deleteRate      = (companyId, planId, rateId)      => request('DELETE', `/companies/${companyId}/plans/${planId}/rates/${rateId}`);
export const clearRates      = (companyId, planId)              => request('DELETE', `/companies/${companyId}/plans/${planId}/rates`);

// Grid & Matrix Operations
export const saveRateGrid    = (companyId, planId, gridData)    => request('POST',   `/companies/${companyId}/plans/${planId}/rates/grid`, gridData);
export const bulkEditRates   = (companyId, planId, params)      => request('POST',   `/companies/${companyId}/plans/${planId}/rates/bulk-edit`, params);

// CSV Import / Export & Template
export const exportRatesCsvUrl   = (companyId, planId) => `${BASE}/companies/${companyId}/plans/${planId}/rates/export`;
export const downloadTemplateUrl = (companyId, planId) => `${BASE}/companies/${companyId}/plans/${planId}/rates/template`;

export async function previewImportCsv(companyId, planId, file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/companies/${companyId}/plans/${planId}/rates/preview-import`, {
    method: 'POST',
    headers,
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function importRatesCsv(companyId, planId, file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/companies/${companyId}/plans/${planId}/rates/import`, {
    method: 'POST',
    headers,
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.details = data.details || data.errors;
    throw err;
  }
  return data;
}

// ── Compare & Quotes ─────────────────────────────────────────────────────────
export const compareQuotes   = (params)                          => request('POST', '/quote/compare', params);
export const saveQuote       = (quoteData)                       => request('POST', '/quotes', quoteData);
export const selectPlan      = (quoteId, payload)                => request('PATCH', `/quotes/${quoteId}/select`, payload.selectedPlans || payload.selectedPlan ? payload : { selectedPlan: payload });
export const getQuoteByRef   = (ref)                             => request('GET', `/quotes/${ref}`);
export const getRecentQuotes = (limit = 20)                      => request('GET', `/quotes?limit=${limit}`);

// ── Health ───────────────────────────────────────────────────────────────────
export const healthCheck     = ()                                => request('GET', '/health', null, 1500);

// ── Visa Website Links ────────────────────────────────────────────────────────
export const getVisaLinks    = ()                                => request('GET', '/visa-links');
export const addVisaLink     = (linkData)                        => request('POST', '/visa-links', linkData);
export const updateVisaLink  = (id, linkData)                    => request('PUT', `/visa-links/${id}`, linkData);
export const deleteVisaLink  = (id)                              => request('DELETE', `/visa-links/${id}`);

