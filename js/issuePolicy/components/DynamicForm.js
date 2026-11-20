/**
 * Dynamic Form Schema Renderer
 * Component: <DynamicForm schema values onChange errors />
 *
 * Renders forms dynamically from JSON schemas returned by policyService.getFormSchema().
 * // TODO(FORMAT): Extend or modify field types and layout wrappers to match future insurer formats.
 */

export class DynamicForm {
  /**
   * @param {Object} options
   * @param {Object} options.schema
   * @param {Object} options.values
   * @param {Function} options.onChange Callback receiving (fieldKey, newValue, updatedValues)
   * @param {Object} [options.errors]
   * @param {Object} [options.contextData] Data for prefill resolution (e.g. { quote, passport })
   */
  constructor({ schema = {}, values = {}, onChange = null, errors = {}, contextData = {} } = {}) {
    this.schema = schema;
    this.values = { ...values };
    this.onChange = onChange;
    this.errors = { ...errors };
    this.contextData = contextData;
    this._container = null;

    // Apply defaults and prefill for fields missing a value
    this._applyDefaultsAndPrefill();
  }

  /**
   * Resolves a dot path string like 'quote.destination' in contextData.
   */
  static resolvePath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr == null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  _applyDefaultsAndPrefill() {
    if (!this.schema || !Array.isArray(this.schema.sections)) return;

    for (const section of this.schema.sections) {
      if (!Array.isArray(section.fields)) continue;
      for (const field of section.fields) {
        if (this.values[field.key] === undefined || this.values[field.key] === null || this.values[field.key] === '') {
          if (field.prefill && this.contextData) {
            const prefilled = DynamicForm.resolvePath(this.contextData, field.prefill);
            if (prefilled !== undefined) {
              this.values[field.key] = prefilled;
              continue;
            }
          }
          if (field.default !== undefined) {
            this.values[field.key] = field.default;
          }
        }
      }
    }
  }

  /**
   * Validates values against the schema rules.
   *
   * @param {Object} schema
   * @param {Object} values
   * @returns {{ valid: boolean, errors: Object }}
   */
  static validate(schema, values = {}) {
    const errors = {};
    if (!schema || !Array.isArray(schema.sections)) {
      return { valid: true, errors };
    }

    for (const section of schema.sections) {
      if (!Array.isArray(section.fields)) continue;

      for (const field of section.fields) {
        // Check visibility condition
        if (field.visibleIf) {
          const depVal = values[field.visibleIf.field];
          if (depVal !== field.visibleIf.equals) {
            continue; // Field is hidden, skip validation
          }
        }

        const val = values[field.key];
        const valStr = (val === undefined || val === null) ? '' : String(val).trim();

        // 1. Required check
        if (field.required) {
          if (field.type === 'checkbox') {
            if (!val) {
              errors[field.key] = field.validation?.message || 'This confirmation is required';
              continue;
            }
          } else if (valStr === '') {
            errors[field.key] = field.validation?.message || `${field.label || field.key} is required`;
            continue;
          }
        }

        // If optional and empty, skip further format checks
        if (valStr === '') continue;

        // 2. Custom validation rules
        const v = field.validation || {};

        if (v.pattern) {
          try {
            const rx = new RegExp(v.pattern);
            if (!rx.test(valStr)) {
              errors[field.key] = v.message || `Invalid format for ${field.label || field.key}`;
              continue;
            }
          } catch (e) {
            console.warn(`Invalid regex in schema for field ${field.key}:`, v.pattern);
          }
        }

        if (v.minLength && valStr.length < v.minLength) {
          errors[field.key] = v.message || `Must be at least ${v.minLength} characters`;
          continue;
        }

        if (v.maxLength && valStr.length > v.maxLength) {
          errors[field.key] = v.message || `Must not exceed ${v.maxLength} characters`;
          continue;
        }

        if (field.type === 'number') {
          const num = parseFloat(valStr);
          if (isNaN(num)) {
            errors[field.key] = 'Must be a number';
            continue;
          }
          if (v.min !== undefined && num < v.min) {
            errors[field.key] = v.message || `Minimum value is ${v.min}`;
            continue;
          }
          if (v.max !== undefined && num > v.max) {
            errors[field.key] = v.message || `Maximum value is ${v.max}`;
            continue;
          }
        }

        if (field.type === 'date') {
          if (v.after) {
            const otherVal = values[v.after];
            if (otherVal && new Date(valStr) <= new Date(otherVal)) {
              errors[field.key] = v.message || `Date must be after ${v.after}`;
              continue;
            }
          }
          if (v.before) {
            const otherVal = values[v.before];
            if (otherVal && new Date(valStr) >= new Date(otherVal)) {
              errors[field.key] = v.message || `Date must be before ${v.before}`;
              continue;
            }
          }
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Evaluates if a field is visible based on visibleIf.
   */
  isFieldVisible(field) {
    if (!field.visibleIf) return true;
    const cond = field.visibleIf;
    const depVal = this.values[cond.field];
    return depVal === cond.equals;
  }

  /**
   * Generates HTML markup for the form.
   * @returns {string}
   */
  render() {
    if (!this.schema || !Array.isArray(this.schema.sections)) {
      return '<div class="dynamic-form-empty">No form schema loaded</div>';
    }

    const sectionsHtml = this.schema.sections.map(section => {
      const visibleFields = (section.fields || []).filter(f => this.isFieldVisible(f));
      if (visibleFields.length === 0) return '';

      const fieldsHtml = visibleFields.map(field => this.renderField(field)).join('');

      return `
        <fieldset class="dyn-form-section" id="dynSection-${section.id}">
          <legend class="dyn-section-title">${section.title || ''}</legend>
          <div class="dyn-fields-grid">
            ${fieldsHtml}
          </div>
        </fieldset>
      `;
    }).join('');

    return `
      <div class="dynamic-form-container" id="dynFormRoot">
        ${sectionsHtml}
      </div>
    `;
  }

  /**
   * Renders an individual form control.
   */
  renderField(field) {
    const key = field.key;
    const label = field.label || key;
    const type = (field.type || 'text').toLowerCase();
    const rawVal = this.values[key];
    const val = (rawVal === undefined || rawVal === null || rawVal === 'null' || rawVal === 'undefined') ? '' : rawVal;
    const error = this.errors[key];
    const isRequired = !!field.required;
    const isReadOnly = !!field.readOnly;
    const widthClass = field.width === 'half' ? 'field-half' : 'field-full';
    const errorClass = error ? 'has-error' : '';

    let inputMarkup = '';

    switch (type) {
      case 'select': {
        const optionsHtml = (field.options || []).map(opt => {
          const optVal = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const selected = String(optVal) === String(val) ? 'selected' : '';
          return `<option value="${optVal}" ${selected}>${optLabel}</option>`;
        }).join('');

        inputMarkup = `
          <select
            name="${key}"
            id="field-${key}"
            class="dyn-input dyn-select ${errorClass}"
            ${isRequired ? 'required' : ''}
            ${isReadOnly ? 'disabled' : ''}
            aria-describedby="${error ? `err-${key}` : ''}"
          >
            <option value="">-- Select ${label} --</option>
            ${optionsHtml}
          </select>
        `;
        break;
      }

      case 'textarea': {
        inputMarkup = `
          <textarea
            name="${key}"
            id="field-${key}"
            rows="3"
            class="dyn-input dyn-textarea ${errorClass}"
            placeholder="${field.placeholder || ''}"
            ${isRequired ? 'required' : ''}
            ${isReadOnly ? 'readonly' : ''}
            aria-describedby="${error ? `err-${key}` : ''}"
          >${val}</textarea>
        `;
        break;
      }

      case 'checkbox': {
        inputMarkup = `
          <label class="dyn-checkbox-label">
            <input
              type="checkbox"
              name="${key}"
              id="field-${key}"
              class="dyn-checkbox"
              ${val ? 'checked' : ''}
              ${isRequired ? 'required' : ''}
              ${isReadOnly ? 'disabled' : ''}
              aria-describedby="${error ? `err-${key}` : ''}"
            />
            <span class="dyn-checkbox-text">${label}${isRequired ? ' <span class="required-star" aria-hidden="true">*</span>' : ''}</span>
          </label>
        `;
        // Checkboxes have label integrated
        return `
          <div class="dyn-field-group ${widthClass} ${errorClass}">
            ${inputMarkup}
            ${field.helpText ? `<small class="dyn-help-text">${field.helpText}</small>` : ''}
            ${error ? `<span class="dyn-error-text" id="err-${key}" role="alert">${error}</span>` : ''}
          </div>
        `;
      }

      case 'radio': {
        const radiosHtml = (field.options || []).map((opt, i) => {
          const optVal = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const checked = String(optVal) === String(val) ? 'checked' : '';
          return `
            <label class="dyn-radio-option">
              <input type="radio" name="${key}" value="${optVal}" ${checked} ${isReadOnly ? 'disabled' : ''} />
              <span>${optLabel}</span>
            </label>
          `;
        }).join('');

        inputMarkup = `<div class="dyn-radio-group">${radiosHtml}</div>`;
        break;
      }

      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'date': {
        if (type === 'date') {
          const cleanDateVal = (val && val !== 'null' && val !== 'undefined' && /^\d{4}-\d{2}-\d{2}$/.test(String(val).trim()))
            ? String(val).trim()
            : '';
          inputMarkup = `
            <input
              type="date"
              name="${key}"
              id="field-${key}"
              value="${cleanDateVal}"
              class="dyn-input ${errorClass}"
              placeholder="${field.placeholder || ''}"
              ${isRequired ? 'required' : ''}
              ${isReadOnly ? 'readonly' : ''}
              aria-describedby="${error ? `err-${key}` : ''}"
            />
          `;
          break;
        }
      }
      default: {
        if (!['text', 'email', 'tel', 'number', 'date'].includes(type)) {
          console.warn(`[DynamicForm] Unknown field type '${type}' for field '${key}', defaulting to text input.`);
        }
        const cleanTextVal = (val === null || val === undefined || val === 'null' || val === 'undefined') ? '' : String(val);
        inputMarkup = `
          <input
            type="${['text', 'email', 'tel', 'number'].includes(type) ? type : 'text'}"
            name="${key}"
            id="field-${key}"
            value="${cleanTextVal.replace(/"/g, '&quot;')}"
            class="dyn-input ${errorClass}"
            placeholder="${field.placeholder || ''}"
            ${isRequired ? 'required' : ''}
            ${isReadOnly ? 'readonly' : ''}
            aria-describedby="${error ? `err-${key}` : ''}"
          />
        `;
        break;
      }
    }

    return `
      <div class="dyn-field-group ${widthClass} ${errorClass}">
        <label for="field-${key}" class="dyn-label">
          ${label}
          ${isRequired ? '<span class="required-star" aria-hidden="true">*</span>' : ''}
        </label>
        ${inputMarkup}
        ${field.helpText ? `<small class="dyn-help-text">${field.helpText}</small>` : ''}
        ${error ? `<span class="dyn-error-text" id="err-${key}" role="alert">${error}</span>` : ''}
      </div>
    `;
  }

  /**
   * Attaches event listeners for user input and change events.
   * @param {HTMLElement} rootEl
   */
  attachEvents(rootEl) {
    this._container = rootEl;

    const formRoot = rootEl.querySelector('#dynFormRoot');
    if (!formRoot) return;

    formRoot.addEventListener('input', (e) => this._handleInput(e));
    formRoot.addEventListener('change', (e) => this._handleInput(e));
  }

  _handleInput(e) {
    const target = e.target;
    const name = target.name;
    if (!name) return;

    let newVal;
    if (target.type === 'checkbox') {
      newVal = target.checked;
    } else {
      newVal = target.value;
    }

    this.values[name] = newVal;

    // Clear error for this field as user types
    if (this.errors[name]) {
      delete this.errors[name];
      const grp = target.closest('.dyn-field-group');
      if (grp) {
        grp.classList.remove('has-error');
        const errSpan = grp.querySelector('.dyn-error-text');
        if (errSpan) errSpan.remove();
      }
    }

    if (typeof this.onChange === 'function') {
      this.onChange(name, newVal, this.values);
    }
  }

  setErrors(errors) {
    this.errors = { ...errors };
    if (this._container) {
      const scrollPos = window.scrollY;
      const root = this._container.querySelector('#dynFormRoot');
      if (root) {
        root.outerHTML = this.render();
        this.attachEvents(this._container);
        window.scrollTo({ top: scrollPos });
      }
    }
  }
}

