import crypto from 'crypto';

/**
 * Generates a cryptographically secure 4-digit numeric OTP.
 * Range: 1000 to 9999 inclusive.
 * @returns {string} 4-digit string
 */
export function generateOtp() {
  const code = crypto.randomInt(1000, 10000);
  return code.toString();
}

/**
 * Hashes an OTP using SHA-256 for secure database persistence.
 * @param {string|number} otp
 * @returns {string} Hex-encoded SHA-256 digest
 */
export function hashOtp(otp) {
  const cleanOtp = String(otp).trim();
  return crypto.createHash('sha256').update(cleanOtp).digest('hex');
}

/**
 * Verifies a candidate OTP against a stored SHA-256 hash in constant time.
 * @param {string|number} candidateOtp
 * @param {string} storedHash
 * @returns {boolean}
 */
export function verifyOtp(candidateOtp, storedHash) {
  if (!candidateOtp || !storedHash) return false;

  const candidateHash = hashOtp(candidateOtp);
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (candidateBuf.length !== storedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

// Precomputed lookup map for 4-digit codes 1000..9999 to resolve plaintext OTP for rider display
const hashToOtpMap = new Map();
for (let i = 1000; i <= 9999; i++) {
  const code = i.toString();
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  hashToOtpMap.set(hash, code);
}

/**
 * Recovers 4-digit plaintext OTP from its SHA-256 hash.
 * Allows rider to always view their PIN even across page reloads.
 * @param {string} hash
 * @returns {string|null}
 */
export function recoverOtpFromHash(hash) {
  if (!hash) return null;
  const clean = String(hash).trim();
  if (/^\d{4}$/.test(clean)) return clean;
  return hashToOtpMap.get(clean) || null;
}
