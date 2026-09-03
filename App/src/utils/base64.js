/**
 * react-native-ble-plx moves characteristic values around as base64 strings,
 * so text has to be converted both ways. Hermes has no Buffer, and atob/btoa
 * are not guaranteed, so the conversion is done by hand here (UTF-8 aware).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toUtf8Bytes(text) {
  const bytes = [];

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair (emoji and similar): combine the two halves.
      const low = text.charCodeAt(i + 1);
      i += 1;
      code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  return bytes;
}

function fromUtf8Bytes(bytes) {
  let text = '';

  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];

    if (byte < 0x80) {
      text += String.fromCharCode(byte);
    } else if (byte < 0xe0) {
      text += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++i] & 0x3f));
    } else if (byte < 0xf0) {
      text += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
      );
    } else {
      const code =
        (((byte & 0x07) << 18) |
          ((bytes[++i] & 0x3f) << 12) |
          ((bytes[++i] & 0x3f) << 6) |
          (bytes[++i] & 0x3f)) -
        0x10000;

      text += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    }
  }

  return text;
}

/** Text -> base64, ready to write to a characteristic. */
export function encodeBase64(text) {
  const bytes = toUtf8Bytes(text);
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const remaining = bytes.length - i;

    output += ALPHABET[(chunk >> 18) & 63];
    output += ALPHABET[(chunk >> 12) & 63];
    output += remaining > 1 ? ALPHABET[(chunk >> 6) & 63] : '=';
    output += remaining > 2 ? ALPHABET[chunk & 63] : '=';
  }

  return output;
}

/** base64 (as returned by a characteristic read) -> text. */
export function decodeBase64(value) {
  if (!value) return '';

  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];

  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (ALPHABET.indexOf(clean[i]) << 18) |
      (ALPHABET.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? ALPHABET.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? ALPHABET.indexOf(clean[i + 3]) : 0);

    bytes.push((chunk >> 16) & 255);
    if (i + 2 < clean.length) bytes.push((chunk >> 8) & 255);
    if (i + 3 < clean.length) bytes.push(chunk & 255);
  }

  return fromUtf8Bytes(bytes);
}
