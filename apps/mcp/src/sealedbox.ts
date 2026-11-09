// libsodium's crypto_box_seal, which GitHub requires for Actions secrets:
//   ephemeral keypair; nonce = BLAKE2b-192(ephemeral_pk || recipient_pk);
//   output = ephemeral_pk || crypto_box(message, nonce, recipient_pk, ephemeral_sk)
import nacl from "tweetnacl";
import { blake2b } from "blakejs";

export function sealedBox(message: Uint8Array, recipientPk: Uint8Array): Uint8Array {
  const eph = nacl.box.keyPair();
  const nonceInput = new Uint8Array(64);
  nonceInput.set(eph.publicKey, 0);
  nonceInput.set(recipientPk, 32);
  const nonce = blake2b(nonceInput, undefined, 24);
  const boxed = nacl.box(message, nonce, recipientPk, eph.secretKey);
  const out = new Uint8Array(32 + boxed.length);
  out.set(eph.publicKey, 0);
  out.set(boxed, 32);
  return out;
}

// For tests: libsodium's crypto_box_seal_open.
export function openSealedBox(sealed: Uint8Array, pk: Uint8Array, sk: Uint8Array): Uint8Array | null {
  const epk = sealed.slice(0, 32);
  const nonceInput = new Uint8Array(64);
  nonceInput.set(epk, 0);
  nonceInput.set(pk, 32);
  return nacl.box.open(sealed.slice(32), blake2b(nonceInput, undefined, 24), epk, sk);
}

export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
