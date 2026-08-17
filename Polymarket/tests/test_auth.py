"""Tests for request signing.

Authentication is the one thing that is wrong in exactly the same way every
time it is wrong: the request looks fine, the venue says 401, and the error
message tells you nothing. These pin down the two details that actually
cause it — what goes into the signed message, and what does not.
"""

import base64

import pytest

from pmbot.auth import AuthError, Credentials, sign

SEED = base64.b64encode(bytes(range(32))).decode()
SEED_64 = base64.b64encode(bytes(range(64))).decode()

CREDS = Credentials(key_id="key-123", secret_key=SEED)


def verify(signature: str, message: bytes, seed_b64: str = SEED) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric import ed25519

    key = ed25519.Ed25519PrivateKey.from_private_bytes(
        base64.b64decode(seed_b64)[:32]
    ).public_key()
    try:
        key.verify(base64.b64decode(signature), message)
        return True
    except InvalidSignature:
        return False


def test_signature_covers_timestamp_method_and_path():
    signature = sign(SEED, "GET", "/v1/portfolio/positions", "1700000000000")
    assert verify(signature, b"1700000000000GET/v1/portfolio/positions")


def test_method_is_upper_cased_before_signing():
    assert sign(SEED, "get", "/v1/orders", "1") == sign(SEED, "GET", "/v1/orders", "1")


def test_signature_is_deterministic_for_a_fixed_timestamp():
    """Ed25519 is deterministic, so a changing signature means changing input."""
    first = sign(SEED, "POST", "/v1/orders", "1700000000000")
    second = sign(SEED, "POST", "/v1/orders", "1700000000000")
    assert first == second


def test_different_paths_sign_differently():
    a = sign(SEED, "GET", "/v1/orders", "1")
    b = sign(SEED, "GET", "/v1/orders/open", "1")
    assert a != b


def test_query_strings_are_not_part_of_the_signed_path():
    """The one that costs an afternoon: sign the path, never the query.

    Matches the official SDK, which passes params separately from the path
    it signs. Including the query yields a 401 with no useful message.
    """
    signature = sign(SEED, "GET", "/v1/markets", "1")
    assert verify(signature, b"1GET/v1/markets")
    assert not verify(signature, b"1GET/v1/markets?limit=10")


def test_headers_carry_the_three_the_venue_wants():
    headers = CREDS.headers("GET", "/v1/orders/open")
    assert headers["X-PM-Access-Key"] == "key-123"
    assert headers["X-PM-Timestamp"].isdigit()
    assert verify(
        headers["X-PM-Signature"],
        f"{headers['X-PM-Timestamp']}GET/v1/orders/open".encode(),
    )


def test_sixty_four_byte_keys_use_the_seed_half():
    """Some exports are seed+public; the signing half is the front 32 bytes."""
    signature = sign(SEED_64, "GET", "/v1/orders", "1")
    assert verify(signature, b"1GET/v1/orders", SEED_64)


# -- bad input ---------------------------------------------------------


def test_non_base64_secret_says_so():
    with pytest.raises(AuthError, match="base64"):
        sign("not base64!!", "GET", "/v1/orders", "1")


def test_wrong_length_secret_suggests_the_likely_mistake():
    """Pasting the key id into the secret field is the common slip."""
    with pytest.raises(AuthError, match="key id"):
        sign(base64.b64encode(b"short").decode(), "GET", "/v1/orders", "1")


def test_missing_credentials_name_both_variables(monkeypatch):
    for name in (
        "POLYMARKET_KEY_ID",
        "POLYMARKET_SECRET_KEY",
        "PMBOT_KEY_ID",
        "PMBOT_SECRET_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(AuthError, match="POLYMARKET_SECRET_KEY"):
        Credentials.from_env()
    assert Credentials.from_env_or_none() is None


def test_credentials_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("POLYMARKET_KEY_ID", "key-123")
    monkeypatch.setenv("POLYMARKET_SECRET_KEY", SEED)
    credentials = Credentials.from_env()
    credentials.validate()
    assert credentials.key_id == "key-123"


def test_validate_rejects_a_bad_key_before_the_venue_does(monkeypatch):
    monkeypatch.setenv("POLYMARKET_KEY_ID", "key-123")
    monkeypatch.setenv("POLYMARKET_SECRET_KEY", "nonsense")
    with pytest.raises(AuthError):
        Credentials.from_env().validate()


def test_redacted_hides_the_secret_entirely():
    rendered = CREDS.redacted()
    assert SEED not in rendered
    assert "hidden" in rendered
