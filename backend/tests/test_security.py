from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_plaintext() -> None:
    hashed = hash_password("admin123")
    assert hashed != "admin123"
    assert verify_password("admin123", hashed)
    assert not verify_password("wrong", hashed)


def test_verify_password_rejects_broken_hash() -> None:
    assert verify_password("admin123", "not-a-bcrypt-hash") is False


def test_access_token_roundtrip() -> None:
    token = create_access_token(42)
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"


def test_decode_invalid_token_returns_none() -> None:
    assert decode_access_token("abc.def.ghi") is None
