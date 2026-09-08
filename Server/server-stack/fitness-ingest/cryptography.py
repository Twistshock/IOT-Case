from __future__ import annotations

import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_VERSION = 1
KEY = bytes.fromhex(os.environ["FITNESS_PROFILE_ENCRYPTION_KEY"])

if len(KEY) != 32:
    raise RuntimeError("Encryption key must be 64 hex characters")


def encrypt_profile(user_id: str, profile: dict[str, Any]) -> tuple[bytes, bytes, int]:
    nonce = os.urandom(12)
    plaintext = json.dumps(
        profile,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    ciphertext = AESGCM(KEY).encrypt(
        nonce,
        plaintext,
        user_id.encode("utf-8"),
    )
    return ciphertext, nonce, KEY_VERSION


def decrypt_profile(
    user_id: str,
    ciphertext: bytes,
    nonce: bytes,
    key_version: int,
) -> dict[str, Any]:
    if key_version != KEY_VERSION:
        raise ValueError(f"Wrong {key_version}")

    plaintext = AESGCM(KEY).decrypt(
        nonce,
        ciphertext,
        user_id.encode("utf-8"),
    )
    return json.loads(plaintext.decode("utf-8"))
