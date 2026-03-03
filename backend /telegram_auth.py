import hmac
import hashlib
from urllib.parse import parse_qsl

def validate_init_data(init_data: str, bot_token: str) -> dict:
    """
    Validates Telegram WebApp initData.
    Returns parsed data dict (includes "user" JSON string in 'user') if valid, else raises ValueError.
    """
    if not init_data:
        raise ValueError("Missing initData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise ValueError("Missing hash")

    # Create data-check-string
    data_check_arr = [f"{k}={v}" for k, v in sorted(pairs.items())]
    data_check_string = "\n".join(data_check_arr)

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()

    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("Invalid initData hash")

    return pairs
