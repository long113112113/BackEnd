require('dotenv').config();
const { computeHmac, deriveAesKey, encryptAesGcm, decryptAesGcm, verifyNonce, verifySeq } = require('../../src/utils/crypto');

const TEST_KEY = '5a5ff51cd6dd32ee9fcdd7dce7715a39ba4f3417e0951e42cefa21f61ba38d30';
const ALT_KEY = '6b6ee62de7ee43ff0adee8edf8826b4acb5e4528f1962f53dbfb32e72cb49e41';

describe('computeHmac', () => {
    test('produces deterministic 64-char hex output', () => {
        const hmac = computeHmac(TEST_KEY, 'hello');
        expect(hmac).toHaveLength(64);
        expect(computeHmac(TEST_KEY, 'hello')).toBe(hmac);
    });

    test('different message produces different output', () => {
        const a = computeHmac(TEST_KEY, 'hello');
        const b = computeHmac(TEST_KEY, 'world');
        expect(a).not.toBe(b);
    });

    test('different key produces different output', () => {
        const a = computeHmac(TEST_KEY, 'hello');
        const b = computeHmac(ALT_KEY, 'hello');
        expect(a).not.toBe(b);
    });

    test('empty string is valid', () => {
        const hmac = computeHmac(TEST_KEY, '');
        expect(hmac).toHaveLength(64);
    });
});

describe('deriveAesKey', () => {
    test('produces deterministic 64-char hex output', () => {
        const key = deriveAesKey(TEST_KEY);
        expect(key).toHaveLength(64);
        expect(deriveAesKey(TEST_KEY)).toBe(key);
    });

    test('different HMAC key produces different AES key', () => {
        const a = deriveAesKey(TEST_KEY);
        const b = deriveAesKey(ALT_KEY);
        expect(a).not.toBe(b);
    });

    test('derived key is not equal to original hmac key', () => {
        const aesKey = deriveAesKey(TEST_KEY);
        expect(aesKey).not.toBe(TEST_KEY);
    });
});

describe('encryptAesGcm / decryptAesGcm roundtrip', () => {
    const aesKey = deriveAesKey(TEST_KEY);

    test('encrypt then decrypt returns original text', () => {
        const plaintext = '{"card_uid":"A1B2C3D4","nonce":"abc123"}';
        const encrypted = encryptAesGcm(aesKey, plaintext);
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).toHaveProperty('ciphertext');
        expect(encrypted).toHaveProperty('auth_tag');
        const decrypted = decryptAesGcm(aesKey, encrypted);
        expect(decrypted).toBe(plaintext);
    });

    test('empty string roundtrip', () => {
        const encrypted = encryptAesGcm(aesKey, '');
        const decrypted = decryptAesGcm(aesKey, encrypted);
        expect(decrypted).toBe('');
    });

    test('unicode text roundtrip', () => {
        const plaintext = 'Tên: Nguyễn Văn A';
        const encrypted = encryptAesGcm(aesKey, plaintext);
        const decrypted = decryptAesGcm(aesKey, encrypted);
        expect(decrypted).toBe(plaintext);
    });

    test('large payload roundtrip', () => {
        const plaintext = 'x'.repeat(5000);
        const encrypted = encryptAesGcm(aesKey, plaintext);
        const decrypted = decryptAesGcm(aesKey, encrypted);
        expect(decrypted).toBe(plaintext);
    });

    test('wrong key throws', () => {
        const encrypted = encryptAesGcm(aesKey, 'secret');
        const wrongKey = deriveAesKey(ALT_KEY);
        expect(() => decryptAesGcm(wrongKey, encrypted)).toThrow();
    });

    test('tampered ciphertext throws', () => {
        const encrypted = encryptAesGcm(aesKey, 'secret');
        encrypted.ciphertext = 'AAAA' + encrypted.ciphertext.slice(4);
        expect(() => decryptAesGcm(aesKey, encrypted)).toThrow();
    });

    test('tampered auth tag throws', () => {
        const encrypted = encryptAesGcm(aesKey, 'secret');
        encrypted.auth_tag = 'AAAA' + encrypted.auth_tag.slice(4);
        expect(() => decryptAesGcm(aesKey, encrypted)).toThrow();
    });

    test('wrong IV throws', () => {
        const encrypted = encryptAesGcm(aesKey, 'secret');
        encrypted.iv = 'AAAA' + encrypted.iv.slice(4);
        expect(() => decryptAesGcm(aesKey, encrypted)).toThrow();
    });
});

describe('verifyNonce', () => {
    test('accepts valid 32-char hex string', () => {
        const result = verifyNonce('abcd1234abcd1234abcd1234abcd1234');
        expect(result.ok).toBe(true);
    });

    test('rejects non-string', () => {
        const result = verifyNonce(123);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('invalid_nonce_format');
    });

    test('rejects wrong length', () => {
        const result = verifyNonce('tooshort');
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('invalid_nonce_format');
    });

    test('rejects null/undefined', () => {
        expect(verifyNonce(null).ok).toBe(false);
        expect(verifyNonce(undefined).ok).toBe(false);
    });

    test('rejects reused nonce', () => {
        const nonce = 'deadbeef12345678deadbeef12345678';
        expect(verifyNonce(nonce).ok).toBe(true);
        expect(verifyNonce(nonce).ok).toBe(false);
        expect(verifyNonce(nonce).reason).toBe('nonce_reused');
    });

    test('accepts different nonce', () => {
        expect(verifyNonce('aaaa1111bbbb2222cccc3333dddd4444').ok).toBe(true);
        expect(verifyNonce('eeee5555ffff6666eeee5555ffff6666').ok).toBe(true);
    });
});

describe('verifySeq', () => {
    test('accepts seq > lastSeq', () => {
        const result = verifySeq(5, 3);
        expect(result.ok).toBe(true);
        expect(result.nvs_reset).toBeUndefined();
    });

    test('accepts seq === 1 with nvs_reset flag', () => {
        const result = verifySeq(1, 500);
        expect(result.ok).toBe(true);
        expect(result.nvs_reset).toBe(true);
    });

    test('accepts seq < lastSeq with large delta as nvs_reset', () => {
        const result = verifySeq(1, 2000);
        expect(result.ok).toBe(true);
        expect(result.nvs_reset).toBe(true);
    });

    test('accepts seq = 50, lastSeq = 1500 (delta > 1000)', () => {
        const result = verifySeq(50, 1500);
        expect(result.ok).toBe(true);
        expect(result.nvs_reset).toBe(true);
    });

    test('rejects seq == lastSeq', () => {
        const result = verifySeq(3, 3);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('seq_not_monotonic');
    });

    test('rejects seq < lastSeq within threshold (no nvs reset)', () => {
        const result = verifySeq(600, 1500);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('seq_not_monotonic');
    });

    test('rejects NaN', () => {
        const result = verifySeq('abc', 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('invalid_seq');
    });

    test('rejects zero', () => {
        const result = verifySeq(0, 0);
        expect(result.ok).toBe(false);
    });

    test('rejects negative', () => {
        const result = verifySeq(-1, 0);
        expect(result.ok).toBe(false);
    });

    test('accepts string representation of number', () => {
        const result = verifySeq('10', 5);
        expect(result.ok).toBe(true);
        expect(result.nvs_reset).toBeUndefined();
    });

    test('rejects seq beyond Number.MAX_SAFE_INTEGER', () => {
        const result = verifySeq(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('overflow_seq');
    });

    test('rejects when lastSeq is not safe integer', () => {
        const result = verifySeq(5, Number.MAX_SAFE_INTEGER + 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('overflow_last_seq');
    });
});
