import { describe, expect, it } from 'vitest';
import { fromHex, hmacSha256, sha256, toHex, utf8 } from './sha256';

const hex = (s: string) => toHex(sha256(utf8(s)));

describe('sha256 (FIPS 180-4 / NIST vectors)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
  ])('sha256(%j)', (input, expected) => {
    expect(hex(input)).toBe(expected);
  });

  it('one million "a"', () => {
    expect(hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('padding boundaries (55, 56 and 64 bytes)', () => {
    // "a" * n around the 64-byte block boundary; values checked against node:crypto.
    expect(hex('a'.repeat(55))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
    expect(hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });
});

describe('hmacSha256 (RFC 4231)', () => {
  it('test case 1', () => {
    const key = fromHex('0b'.repeat(20));
    expect(toHex(hmacSha256(key, utf8('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('test case 2', () => {
    expect(toHex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('test case 6 (key longer than the block size)', () => {
    const key = fromHex('aa'.repeat(131));
    expect(
      toHex(hmacSha256(key, utf8('Test Using Larger Than Block-Size Key - Hash Key First'))),
    ).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
  });
});

describe('utf8 / hex', () => {
  it('encodes multi-byte characters like TextEncoder', () => {
    expect(toHex(utf8('ñ€😀'))).toBe('c3b1e282acf09f9880');
  });

  it('round-trips hex and rejects malformed input', () => {
    expect(toHex(fromHex('00ff10'))).toBe('00ff10');
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });
});
