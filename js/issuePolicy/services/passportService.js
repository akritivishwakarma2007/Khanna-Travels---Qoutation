/**
 * Passport OCR Service
 * Handles uploading passport images/PDFs to the backend OCR endpoint (/api/passport/extract)
 * with real upload progress tracking (0-50%), creeping server analysis (60-95%),
 * error code mapping, and concurrent batch extraction.
 */
import { ISSUE_POLICY_CONFIG } from '../config.js';
import { getBaseUrl, getAdminToken } from '../../api.js';
import { generateMrzTd3 } from '../mrzUtils.js';

let mockSampleCursor = 0;

export const passportService = {
  /**
   * Resets mock sample index (used on new flow).
   */
  resetMockCursor() {
    mockSampleCursor = 0;
  },

  /**
   * Extracts passport details from a front file (and optional back file).
   *
   * @param {File} front Passport photo / data page (or 2-page PDF)
   * @param {Object} [options]
   * @param {File} [options.back] Optional last page of passport
   * @param {Function} [options.onProgress] Callback receiving ({ percent, stage })
   * @param {'individual'|'group'} [options.mode]
   * @returns {Promise<Object>} Normalized passport object
   */
  async extract(front, { back = null, onProgress = null, mode = 'individual' } = {}) {
    // If mock flag is explicitly forced on client, return mock sample
    if (ISSUE_POLICY_CONFIG.USE_MOCK_OCR) {
      return this._extractMock(front, onProgress, mode);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${getBaseUrl()}/api/passport/extract`;
      const timeoutMs = ISSUE_POLICY_CONFIG.OCR_TIMEOUT_MS || 60000;

      xhr.open('POST', url, true);
      xhr.timeout = timeoutMs;
      xhr.responseType = 'json';

      // Attach admin token if present
      const token = getAdminToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let creepTimer = null;
      let currentPercent = 0;

      // 1. Real Upload Progress (0% to 50%)
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            currentPercent = Math.min(50, Math.round((event.loaded / event.total) * 50));
            if (onProgress) {
              onProgress({
                percent: currentPercent,
                stage: currentPercent < 50 ? `Uploading document (${currentPercent * 2}%)…` : 'Processing upload…'
              });
            }
          }
        };

        xhr.upload.onload = () => {
          currentPercent = 55;
          if (onProgress) {
            onProgress({ percent: currentPercent, stage: 'Reading passport…' });
          }

          // 2. Creep progress from 60% up to 95% while waiting for OCR engine
          creepTimer = setInterval(() => {
            if (currentPercent < 95) {
              const delta = Math.max(1, Math.round((95 - currentPercent) * 0.12));
              currentPercent = Math.min(95, currentPercent + delta);
              if (onProgress) {
                onProgress({ percent: currentPercent, stage: 'Reading passport…' });
              }
            }
          }, 350);
        };
      }

      // Cleanup helper
      const cleanup = () => {
        if (creepTimer) {
          clearInterval(creepTimer);
          creepTimer = null;
        }
      };

      // 3. Response Handler
      xhr.onload = () => {
        cleanup();

        const status = xhr.status;
        const res = xhr.response || {};

        if (status >= 200 && status < 300) {
          if (onProgress) {
            onProgress({ percent: 100, stage: 'Extraction complete' });
          }
          resolve(res);
          return;
        }

        // Map status codes to user-facing messages
        let message;
        const code = res.code || (status === 401 || status === 403 ? 'AUTH_REQUIRED' : 'OCR_FAILED');

        switch (status) {
          case 400:
            message = code === 'NO_FILE'
              ? 'Attach the passport photo page.'
              : (res.message || 'Upload a JPG, PNG, WEBP or PDF.');
            break;
          case 413:
            message = 'File is larger than 10 MB.';
            break;
          case 422:
            message = 'No passport photo page was found in this file.';
            break;
          case 502:
            message = res.message || "The passport reader didn't respond. Try again.";
            break;
          case 401:
          case 403:
            message = 'Your session has expired. Sign in again and retry.';
            break;
          default:
            message = res.message || `Server returned error (${status}). Try again.`;
            break;
        }

        const err = new Error(message);
        err.code = code;
        err.status = status;
        reject(err);
      };

      // 4. Network & Timeout Error Handlers
      xhr.onerror = () => {
        cleanup();
        const err = new Error("Couldn't reach the server. Check your connection and try again.");
        err.code = 'NETWORK_ERROR';
        reject(err);
      };

      xhr.ontimeout = () => {
        cleanup();
        const err = new Error("The passport reader didn't respond. Try again.");
        err.code = 'OCR_FAILED';
        reject(err);
      };

      xhr.onabort = () => {
        cleanup();
        const err = new Error('Extraction was cancelled.');
        err.code = 'ABORTED';
        reject(err);
      };

      // 5. Send multipart/form-data
      const formData = new FormData();
      if (Array.isArray(front)) {
        front.forEach((item, idx) => {
          const f = item.file || item;
          const fieldName = idx === 0 ? 'front' : 'back';
          formData.append(fieldName, f, f.name || `passport_${fieldName}.jpg`);
        });
      } else {
        formData.append('front', front, front.name || 'passport_front.jpg');
        if (back) {
          formData.append('back', back, back.name || 'passport_back.jpg');
        }
      }

      xhr.send(formData);
    });
  },

  /**
   * Processes multiple passports with configurable concurrency (default 3).
   * Does NOT halt the batch on individual failures.
   *
   * @param {Array<Object>} items Array of { id, front, back, name }
   * @param {Object} options
   * @param {number} [options.concurrency=3]
   * @param {Function} [options.onItem] Callback receiving (index, { percent, stage, status, data, error })
   * @returns {Promise<Array<{ success: boolean, data?: Object, error?: string, item: Object }>>}
   */
  async extractMany(items, { concurrency = 3, onItem = null } = {}) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const i = nextIndex++;
        const item = items[i];

        if (onItem) {
          onItem(i, { percent: 5, stage: 'Queued…', status: 'reading' });
        }

        try {
          const frontFile = item.front || item.file || item;
          const backFile = item.back || null;

          const data = await this.extract(frontFile, {
            back: backFile,
            mode: 'group',
            onProgress: (prog) => {
              if (onItem) {
                onItem(i, { percent: prog.percent, stage: prog.stage, status: 'reading' });
              }
            }
          });

          // Tag with source file name for review grid
          data.sourceFile = frontFile.name || item.name || 'passport.jpg';

          results[i] = { success: true, data, item };
          if (onItem) {
            onItem(i, { percent: 100, stage: 'Extracted', status: 'extracted', data });
          }
        } catch (err) {
          results[i] = { success: false, error: err.message, item };
          if (onItem) {
            onItem(i, { percent: 100, stage: err.message, status: 'failed', error: err.message });
          }
        }
      }
    };

    const pool = [];
    const poolSize = Math.min(concurrency, items.length);
    for (let c = 0; c < poolSize; c++) {
      pool.push(worker());
    }
    await Promise.all(pool);

    return results;
  },

  /**
   * Legacy alias for extractMany
   */
  async extractBatch(files, onFileProgress = null) {
    const items = files.map(f => ({ front: f, name: f.name }));
    return this.extractMany(items, {
      concurrency: ISSUE_POLICY_CONFIG.OCR_CONCURRENCY || 3,
      onItem: onFileProgress
    });
  },

  /**
   * Client-side mock fallback when USE_MOCK_API is explicitly set to true.
   */
  async _extractMock(file, onProgress, mode) {
    if (file && file.name && /fail|corrupt|unreadable/i.test(file.name)) {
      if (onProgress) {
        onProgress({ percent: 30, stage: 'Detecting document boundary...' });
        await new Promise(r => setTimeout(r, 300));
      }
      throw new Error("The passport couldn't be read. Upload a sharper photo with the code lines visible.");
    }

    const stages = [
      { percent: 20, stage: 'Uploading file and checking quality...' },
      { percent: 50, stage: 'Reading passport…' },
      { percent: 80, stage: 'Reading MRZ code lines (ICAO 9303 TD3)...' },
      { percent: 100, stage: 'Extraction complete' }
    ];

    for (const step of stages) {
      if (onProgress) onProgress(step);
      await new Promise(r => setTimeout(r, 120));
    }

    return mode === 'individual'
      ? getIndividualMockSample()
      : getGroupMockSample(mockSampleCursor++, file);
  }
};

function getIndividualMockSample() {
  const mrz = generateMrzTd3({
    issuingCountry: 'IND',
    surname: 'SHARMA',
    givenNames: 'AARAV',
    passportNumber: 'M4592817',
    nationality: 'IND',
    dob: '1992-05-15',
    sex: 'M',
    expiryDate: '2032-05-14'
  });

  return {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M4592817',
    nationality: 'IND',
    sex: 'M',
    dob: '1992-05-15',
    placeOfBirth: 'Delhi',
    placeOfIssue: 'Delhi',
    issueDate: '2022-05-15',
    expiryDate: '2032-05-14',
    fatherName: 'Rajesh Sharma',
    motherName: 'Sunita Sharma',
    spouseName: 'Priya Sharma',
    address: '42 MG Road, Connaught Place, New Delhi 110001',
    fileNumber: 'DL106789123422',
    issuingCountry: 'IND',
    mrz: [mrz.line1, mrz.line2],
    lowConfidence: []
  };
}

function getGroupMockSample(index, file) {
  const slot = index % 6;
  const mrz = generateMrzTd3({
    surname: 'SHARMA',
    givenNames: 'AARAV',
    passportNumber: 'M4592817',
    nationality: 'IND',
    dob: '1992-05-15',
    sex: 'M',
    expiryDate: '2032-05-14'
  });

  return {
    givenNames: 'Aarav',
    surname: 'Sharma',
    passportNumber: 'M4592817',
    nationality: 'IND',
    sex: 'M',
    dob: '1992-05-15',
    placeOfBirth: slot === 1 ? null : 'Delhi',
    placeOfIssue: 'Delhi',
    issueDate: slot === 2 ? null : '2022-05-15',
    expiryDate: slot === 3 ? '2026-12-10' : '2032-05-14',
    fatherName: 'Rajesh Sharma',
    motherName: 'Sunita Sharma',
    spouseName: 'Priya Sharma',
    address: slot === 4 ? null : '42 MG Road, Connaught Place, New Delhi 110001',
    fileNumber: 'DL106789123422',
    issuingCountry: 'IND',
    mrz: [mrz.line1, mrz.line2],
    lowConfidence: slot === 5 ? ['givenNames'] : [],
    sourceFile: file?.name || 'passport.jpg'
  };
}
