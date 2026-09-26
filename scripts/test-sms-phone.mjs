import assert from 'node:assert/strict';
import { normalizeSmsPhone } from '../src/lib/sms-phone.ts';

assert.equal(normalizeSmsPhone('07123 456789'), '+447123456789');
assert.equal(normalizeSmsPhone('+44 7123 456789'), '+447123456789');
assert.equal(normalizeSmsPhone('+1 (415) 555-0134'), '+14155550134');
assert.equal(normalizeSmsPhone('020 7123 4567'), null);
assert.equal(normalizeSmsPhone('not a number'), null);
assert.equal(normalizeSmsPhone(''), null);
console.log('6 SMS phone-format checks passed; no provider messages sent.');
