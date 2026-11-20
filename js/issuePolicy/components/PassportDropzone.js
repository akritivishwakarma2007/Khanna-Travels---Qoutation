/**
 * Passport Dropzone & File List Component
 * Supports single/dual file (Individual) and multi-file (Group) modes with drag-and-drop,
 * "Choose files" button, previews with remove buttons, customer consent notice,
 * client-side format/size validation, thumbnail generation, and extraction progress.
 */
import { ISSUE_POLICY_CONFIG } from '../config.js';

export class PassportDropzone {
  /**
   * @param {Object} options
   * @param {'single'|'multiple'} options.mode
   * @param {Array<Object>} [options.initialFiles]
   * @param {Object} [options.initialBackFile]
   * @param {Function} options.onFilesChanged
   * @param {Function} options.onExtractRequested
   */
  constructor({
    mode = 'single',
    initialFiles = [],
    initialBackFile = null,
    onFilesChanged = null,
    onExtractRequested = null
  } = {}) {
    this.mode = mode;
    this.files = [...initialFiles];
    this.backFile = initialBackFile;
    this.onFilesChanged = onFilesChanged;
    this.onExtractRequested = onExtractRequested;
    this.isExtracting = false;
    this._container = null;
    this._createdUrls = [];
  }

  destroy() {
    this._createdUrls.forEach(url => URL.revokeObjectURL(url));
    this._createdUrls = [];
  }

  /**
   * Validates a single file against configuration rules.
   * @param {File} file
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateFile(file) {
    const { acceptedMimeTypes, acceptedExtensions, maxSizeBytes, maxSizeMB } = ISSUE_POLICY_CONFIG.FILES;

    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        reason: `Exceeds max allowed size of ${maxSizeMB} MB (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
      };
    }

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const typeValid = acceptedMimeTypes.includes(file.type) || acceptedExtensions.includes(ext);

    if (!typeValid) {
      return {
        valid: false,
        reason: `Unsupported format (${ext || file.type}). Allowed: JPG, PNG, WEBP, PDF`
      };
    }

    return { valid: true };
  }

  /**
   * Adds new files from drag-drop or file input.
   * In single/individual mode, accepts up to 2 files total (front + back).
   * @param {FileList|File[]} newFileList
   * @returns {{ accepted: number, skipped: Array<{ name: string, reason: string }> }}
   */
  addFiles(newFileList) {
    const skipped = [];
    let acceptedCount = 0;
    const fileArray = Array.from(newFileList);

    if (this.mode === 'single') {
      for (const file of fileArray) {
        if (this.files.length >= 2) {
          skipped.push({ name: file.name, reason: 'Maximum 2 passport files allowed (front + back)' });
          continue;
        }

        const val = this.validateFile(file);
        if (!val.valid) {
          skipped.push({ name: file.name, reason: val.reason });
          continue;
        }

        const thumb = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        if (thumb) this._createdUrls.push(thumb);

        this.files.push({
          id: 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          thumbnail: thumb,
          status: 'ready',
          stage: 'Ready to extract',
          percent: 0,
          error: null,
          data: null
        });
        acceptedCount++;
      }
    } else {
      // Group mode
      for (const file of fileArray) {
        const val = this.validateFile(file);
        if (!val.valid) {
          skipped.push({ name: file.name, reason: val.reason });
          continue;
        }

        const thumb = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        if (thumb) this._createdUrls.push(thumb);

        this.files.push({
          id: 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          thumbnail: thumb,
          back: null,
          status: 'ready',
          stage: 'Ready to extract',
          percent: 0,
          error: null,
          data: null
        });
        acceptedCount++;
      }
    }

    this._notifyChange(skipped);
    this.updateDom();
    return { accepted: acceptedCount, skipped };
  }

  removeFile(fileId) {
    const idx = this.files.findIndex(f => f.id === fileId);
    if (idx !== -1) {
      if (this.files[idx].thumbnail) URL.revokeObjectURL(this.files[idx].thumbnail);
      if (this.files[idx].back?.thumbnail) URL.revokeObjectURL(this.files[idx].back.thumbnail);
      this.files.splice(idx, 1);
      this._notifyChange([]);
      this.updateDom();
    }
  }

  updateFileStatus(indexOrId, updates) {
    let item;
    if (typeof indexOrId === 'number') {
      item = this.files[indexOrId];
    } else {
      item = this.files.find(f => f.id === indexOrId);
    }
    if (item) {
      Object.assign(item, updates);
      this.updateDom();
    }
  }

  _notifyChange(skipped = []) {
    if (typeof this.onFilesChanged === 'function') {
      this.onFilesChanged(this.files, skipped, this.backFile);
    }
  }

  render() {
    const isSingle = this.mode === 'single';
    const fileCount = this.files.length;
    const canAddMore = isSingle ? fileCount < 2 : true;
    const acceptStr = ISSUE_POLICY_CONFIG.FILES.acceptedExtensions.join(',');
    const maxSizeStr = ISSUE_POLICY_CONFIG.FILES.maxSizeMB;
    const consentText = ISSUE_POLICY_CONFIG.CONSENT_TEXT;

    return `
      <div class="dropzone-wrapper" id="dropzoneWrapper">
        <!-- 1. Drag & Drop Area (Above Consent Note) -->
        ${canAddMore ? `
          <div class="dropzone-area" id="dropArea" tabindex="0" role="button" aria-label="Upload passport files">
            <input
              type="file"
              id="filePickerInput"
              class="dropzone-hidden-input"
              accept="${acceptStr}"
              multiple
              tabindex="-1"
            />
            <div class="dropzone-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m8 16 4-4 4 4" />
              </svg>
            </div>
            <div class="dropzone-text-group">
              <span class="dropzone-primary-text">
                <strong>Click to upload</strong> or drag and drop passport files
              </span>
              <button type="button" class="btn-choose-file" id="btnChooseFiles" tabindex="0">
                Choose files
              </button>
              <span class="dropzone-hint" style="margin-top: 6px;">
                Upload the front page, or a PDF/photo with both pages. Back page adds address and parents' names.
              </span>
              <span class="dropzone-subhint" style="font-size: 0.78rem; color: #94a3b8;">
                Accepted: JPG, PNG, WEBP, PDF (up to ${maxSizeStr} MB each, 1–2 files).
              </span>
            </div>
          </div>
        ` : `
          <div class="dropzone-max-notice" style="padding: 12px 16px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; text-align: center; margin-bottom: 12px; color: #475569; font-size: 0.88rem;">
            <span>✓ 2 passport files attached (Front &amp; Back). To replace a file, remove it below.</span>
          </div>
        `}

        <!-- 2. Attached File Cards List with Previews & Remove Buttons -->
        ${fileCount > 0 ? this._renderFilesList() : ''}

        <!-- 3. Customer Identity Consent Notice (Cleanly Below Dropzone & Previews) -->
        <div class="customer-consent-notice" role="note" style="margin-top: 14px;">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" class="consent-svg">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          <span class="consent-text">${consentText}</span>
        </div>
      </div>
    `;
  }

  _renderFilesList() {
    const isSingle = this.mode === 'single';
    const pendingCount = this.files.filter(f => f.status === 'ready' || f.status === 'failed').length;

    const cardsHtml = this.files.map((fileObj, idx) => {
      const sizeStr = (fileObj.size / (1024 * 1024)).toFixed(2) + ' MB';
      const isPdf = fileObj.type === 'application/pdf' || fileObj.name.toLowerCase().endsWith('.pdf');

      let statusBadge = '';
      if (fileObj.status === 'reading') {
        statusBadge = `<span class="badge-status badge-reading"><span class="spinner-inline"></span> Reading…</span>`;
      } else if (fileObj.status === 'extracted') {
        statusBadge = `<span class="badge-status badge-extracted">✓ Extracted</span>`;
      } else if (fileObj.status === 'failed') {
        statusBadge = `<span class="badge-status badge-failed">✕ Couldn't read</span>`;
      } else {
        statusBadge = `<span class="badge-status badge-ready">Ready</span>`;
      }

      const slotLabel = isSingle
        ? (idx === 0 ? 'File 1' : 'File 2')
        : `#${idx + 1}`;

      return `
        <div class="file-card ${fileObj.status}" id="card-${fileObj.id}">
          <div class="file-card-preview">
            ${fileObj.thumbnail
              ? `<img src="${fileObj.thumbnail}" alt="Passport preview" class="file-card-thumb-img"/>`
              : (isPdf
                ? `<div class="file-pdf-thumb"><span>PDF</span></div>`
                : `<div class="file-generic-thumb"><span>IMG</span></div>`)
            }
          </div>
          <div class="file-card-details">
            <div class="file-card-header">
              <span class="file-name" title="${fileObj.name}">
                <small style="color: #64748b; font-weight: 700; margin-right: 4px;">[${slotLabel}]</small>${fileObj.name}
              </span>
              ${statusBadge}
            </div>
            <div class="file-card-meta">
              <span class="file-size">${sizeStr}</span>
              ${fileObj.stage ? `<span class="file-stage-text">${fileObj.stage}</span>` : ''}
            </div>

            <!-- Error alert if extraction failed -->
            ${fileObj.status === 'failed' && fileObj.error ? `
              <div class="file-error-alert" role="alert" style="margin-top: 6px;">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                <span>${fileObj.error}</span>
              </div>
            ` : ''}
          </div>

          <div class="file-card-actions">
            <button
              type="button"
              class="btn-file-remove"
              data-action="remove-file"
              data-id="${fileObj.id}"
              title="Remove file"
            >
              ✕
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="file-list-container" style="margin-top: 14px;">
        <div class="file-cards-grid">
          ${cardsHtml}
        </div>

        ${!isSingle && pendingCount > 0 ? `
          <div class="batch-action-bar">
            <button
              type="button"
              class="btn-primary"
              id="btnExtractBatch"
              ${this.isExtracting ? 'disabled' : ''}
            >
              ${this.isExtracting ? 'Extracting passports…' : `Extract details from ${pendingCount} passport${pendingCount > 1 ? 's' : ''}`}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  attachEvents(container) {
    this._container = container;
    const wrapper = container.querySelector('#dropzoneWrapper');
    if (!wrapper) return;

    const dropArea = wrapper.querySelector('#dropArea');
    const fileInput = wrapper.querySelector('#filePickerInput');
    const btnChoose = wrapper.querySelector('#btnChooseFiles');

    if (dropArea && fileInput) {
      dropArea.addEventListener('click', (e) => {
        // If clicking choose files button or area
        if (e.target.closest('#btnChooseFiles') || !e.target.closest('button')) {
          fileInput.click();
        }
      });

      if (btnChoose) {
        btnChoose.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });
      }

      dropArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.addFiles(e.target.files);
          fileInput.value = '';
        }
      });

      ['dragenter', 'dragover'].forEach(name => {
        dropArea.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.add('drag-active');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropArea.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.remove('drag-active');
        });
      });

      dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          this.addFiles(dt.files);
        }
      });
    }

    // Remove buttons on file cards
    wrapper.querySelectorAll('[data-action="remove-file"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) {
          this.removeFile(id);
        }
      });
    });

    // Batch extract button for group mode
    const btnExtractBatch = wrapper.querySelector('#btnExtractBatch');
    if (btnExtractBatch && this.onExtractRequested) {
      btnExtractBatch.addEventListener('click', () => {
        this.onExtractRequested();
      });
    }
  }

  updateDom() {
    if (this._container) {
      this._container.innerHTML = this.render();
      this.attachEvents(this._container);
    }
  }
}
