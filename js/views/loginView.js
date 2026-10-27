/**
 * Khanna Travels — Admin Login View
 * Clean, accessible sign-in screen with inline error validation and JWT auth
 */
import { loginAdmin } from '../api.js';

export class LoginView {
  constructor(app) {
    this.app = app;
  }

  render() {
    return `
      <div class="admin-login-wrapper" style="min-height: calc(100vh - 240px); display: flex; align-items: center; justify-content: center; padding: 24px 16px;">
        <div class="admin-login-card" style="width: 100%; max-width: 440px; background: #ffffff; border: 1px solid var(--line); border-radius: 16px; padding: 32px 28px; box-shadow: 0 4px 20px rgba(20, 35, 63, 0.06);">
          
          <div class="admin-login-header" style="text-align: center; margin-bottom: 24px;">
            <div style="margin-bottom: 16px;">
              <img src="logo.png" alt="Khanna Travels" style="height: 48px; width: auto; object-fit: contain;" />
            </div>
            <h1 class="admin-login-title" style="font-size: 20px; font-weight: 800; color: var(--navy); margin-bottom: 6px;">Sign In to Admin</h1>
            <p class="admin-login-subtitle" style="font-size: 13px; color: var(--muted); line-height: 1.4;">
              Enter your administrator credentials to access agency tools and rate tables.
            </p>
          </div>

          <form id="adminLoginForm" class="admin-login-form" novalidate>
            <!-- Email -->
            <div class="form-group" style="margin-bottom: 18px;">
              <label class="form-label" for="adminEmailInput" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                Email Address <span class="required" style="color: var(--red);">*</span>
              </label>
              <input
                type="email"
                id="adminEmailInput"
                class="form-input"
                placeholder="admin@khannatravels.com"
                value="admin@khannatravels.com"
                required
                autocomplete="username"
                style="width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
              />
            </div>

            <!-- Password -->
            <div class="form-group" style="margin-bottom: 18px;">
              <label class="form-label" for="adminPasswordInput" style="display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                Administrator Password <span class="required" style="color: var(--red);">*</span>
              </label>
              <div class="password-input-wrapper" style="position: relative;">
                <input
                  type="password"
                  id="adminPasswordInput"
                  class="form-input"
                  placeholder="Enter password"
                  required
                  autocomplete="current-password"
                  style="width: 100%; height: 44px; padding: 0 42px 0 14px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box;"
                />
                <button
                  type="button"
                  class="btn-toggle-pwd"
                  id="btnTogglePassword"
                  aria-label="Toggle password visibility"
                  style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; padding: 6px; font-size: 16px;"
                >
                  👁️
                </button>
              </div>
            </div>

            <!-- Credentials Hint -->
            <div style="margin-bottom: 16px; padding: 10px 12px; background: var(--tint); border: 1px solid var(--line); border-radius: 8px; font-size: 12px; color: var(--muted); line-height: 1.4;">
              🔑 <strong>Admin Credentials:</strong> <code>admin@khannatravels.com</code> &bull; Password: <code>khanna2026</code>
            </div>

            <!-- Inline Error Box -->
            <div
              id="adminLoginError"
              role="alert"
              style="display: none; margin-bottom: 18px; padding: 12px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; font-weight: 600;"
            ></div>

            <!-- Submit Button -->
            <button
              type="submit"
              class="btn btn-primary"
              id="btnAdminLoginSubmit"
              style="width: 100%; height: 44px; min-height: 44px; background: var(--navy); color: #ffffff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.15s ease;"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
              </svg>
              <span>Sign In to Admin</span>
            </button>
          </form>

          <div style="margin-top: 20px; text-align: center; border-top: 1px solid var(--line); padding-top: 16px;">
            <button type="button" id="btnCancelLogin" style="background: none; border: none; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer;">
              ← Back to Insurance Quotation
            </button>
          </div>

        </div>
      </div>
    `;
  }

  attachEvents(container) {
    const form = container.querySelector('#adminLoginForm');
    const emailInput = container.querySelector('#adminEmailInput');
    const pwdInput = container.querySelector('#adminPasswordInput');
    const togglePwdBtn = container.querySelector('#btnTogglePassword');
    const errBox = container.querySelector('#adminLoginError');
    const submitBtn = container.querySelector('#btnAdminLoginSubmit');
    const cancelBtn = container.querySelector('#btnCancelLogin');

    if (togglePwdBtn && pwdInput) {
      togglePwdBtn.addEventListener('click', () => {
        const isPwd = pwdInput.type === 'password';
        pwdInput.type = isPwd ? 'text' : 'password';
        togglePwdBtn.textContent = isPwd ? '🔒' : '👁️';
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.app.navigate('quote');
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput ? emailInput.value.trim() : '';
        const password = pwdInput ? pwdInput.value.trim() : '';

        if (!password) {
          if (errBox) {
            errBox.textContent = 'Please enter administrator password.';
            errBox.style.display = 'block';
          }
          if (pwdInput) pwdInput.focus();
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying credentials...';
          }
          if (errBox) errBox.style.display = 'none';

          await loginAdmin(email, password, true);
          this.app.showToast('Signed in to admin successfully', 'success');
          this.app._updateHeaderUI();
          this.app.navigate('quote');
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message || 'Invalid administrator email or password.';
            errBox.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
              </svg>
              <span>Sign In to Admin</span>
            `;
          }
        }
      });
    }
  }
}
