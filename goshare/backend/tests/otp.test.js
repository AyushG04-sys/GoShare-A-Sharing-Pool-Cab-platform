import { generateOtp, hashOtp, verifyOtp } from '../src/services/otp.service.js';

describe('OTP Security Service', () => {
  test('generateOtp produces a 4-digit string', () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      expect(typeof otp).toBe('string');
      expect(otp).toHaveLength(4);
      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThan(10000);
    }
  });

  test('hashOtp produces standard 64-char hex SHA-256 string', () => {
    const hash = hashOtp('1234');
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
  });

  test('verifyOtp succeeds with exact matching code', () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    expect(verifyOtp(otp, hash)).toBe(true);
  });

  test('verifyOtp fails with incorrect code', () => {
    const hash = hashOtp('1234');
    expect(verifyOtp('9999', hash)).toBe(false);
    expect(verifyOtp('', hash)).toBe(false);
    expect(verifyOtp(null, hash)).toBe(false);
  });
});
