/**
 * server/utils/crypto.js
 * Application-level encryption at rest using AES-256-GCM.
 * Used for sensitive passport and traveller fields.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derives a 32-byte Buffer key from DATA_ENCRYPTION_KEY
 */
function getEncryptionKey() {
  const envKey = process.env.DATA_ENCRYPTION_KEY || 'khanna_travels_default_secure_key_2026';
  // Ensure exactly 32 bytes via SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypts a string using AES-256-GCM
 * @param {string} text
 * @returns {string} iv:authTag:ciphertext (all in hex)
 */
function encryptText(text) {
  if (text === null || text === undefined) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string produced by encryptText
 * @param {string} encryptedStr
 * @returns {string|null}
 */
function decryptText(encryptedStr) {
  if (!encryptedStr || typeof encryptedStr !== 'string') return null;
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypts an arbitrary JSON-serializable object
 * @param {any} obj
 * @returns {string|null}
 */
function encryptJson(obj) {
  if (obj === null || obj === undefined) return null;
  return encryptText(JSON.stringify(obj));
}

/**
 * Decrypts an encrypted JSON string back into an object
 * @param {string} encryptedStr
 * @returns {any}
 */
function decryptJson(encryptedStr) {
  if (!encryptedStr) return null;
  try {
    const jsonStr = decryptText(encryptedStr);
    return jsonStr ? JSON.parse(jsonStr) : null;
  } catch (err) {
    console.error('[crypto] Decryption error:', err.message);
    return null;
  }
}

module.exports = {
  encryptText,
  decryptText,
  encryptJson,
  decryptJson
};
