// All vitest globals are available globally due to vitest config globals: true
import * as oasis from '@oasisprotocol/client';
import { decodeCallResult } from '../../../../src/infrastructure/logging/usage-logger.js';

describe('decodeCallResult', () => {
  it('returns "ok" for a successful CallResult', () => {
    const cbor = oasis.misc.toCBOR({ ok: new Uint8Array() });
    expect(decodeCallResult(cbor)).toBe('ok');
  });

  it('throws with module/code/message on a failed (reverted) CallResult', () => {
    const cbor = oasis.misc.toCBOR({
      fail: { module: 'evm', code: 8, message: 'execution reverted' },
    });
    expect(() => decodeCallResult(cbor)).toThrow(
      'logReceipt reverted: module=evm code=8 execution reverted'
    );
  });

  it('returns "unknown" for an opaque/encrypted CallResult', () => {
    const cbor = oasis.misc.toCBOR({ unknown: new Uint8Array([1, 2, 3]) });
    expect(decodeCallResult(cbor)).toBe('unknown');
  });

  it('throws on an unrecognized CallResult shape', () => {
    const cbor = oasis.misc.toCBOR({ weird: 1 });
    expect(() => decodeCallResult(cbor)).toThrow(/Unexpected ROFL CallResult shape/);
  });

  it('throws when the bytes are not a CBOR map', () => {
    const cbor = oasis.misc.toCBOR(42);
    expect(() => decodeCallResult(cbor)).toThrow(/not a CBOR map/);
  });
});
