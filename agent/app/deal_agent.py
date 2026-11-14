"""Extract unsigned deal terms from Pidgin, Yoruba or English text.

This is deterministic so the README path works without model keys. Replace the parsing with a
model tool-calling path later if wanted, but keep two rules:

* the message goes through ``guard.screen`` first, and a refusal carries no terms at all;
* nothing here pays, refunds or confirms anything, and nothing here ever returns, logs or
  persists a private key.

Yoruba and Pidgin are matched on accent-free text, and the item keeps the buyer's own spelling
(accents included). Where the text is ambiguous the result says so in ``warning`` instead of
guessing.
"""

from __future__ import annotations

import re
from typing import Any

from .guard import normalise, refusal_message, screen

LANGUAGES = ("pcm", "yo", "en")

_PIDGIN_WORDS = {
    "abeg", "wetin", "dey", "wey", "una", "oga", "jare", "sef", "comot", "sabi", "pikin", "wahala",
}  # fmt: skip
_YORUBA_WORDS = {"jowo", "egberun", "owo", "loni"}
_YORUBA_PHRASES = ("mo fe", "ni ola", "e gbe")

# Yoruba number words after "egberun" (thousand): egberun marun = 5,000.
_YORUBA_NUMBERS = {
    "kan": 1, "meji": 2, "meta": 3, "merin": 4, "marun": 5,
    "mefa": 6, "meje": 7, "mejo": 8, "mesan": 9, "mewa": 10,
}  # fmt: skip

DEFAULT_DEADLINE_HOURS = 48
NEXT_DAY_HOURS = 24


def detect_language(text: str) -> str:
    """Return "pcm", "yo" or "en". Yoruba-only letters (ẹ ọ ṣ) win, then Pidgin, then Yoruba."""
    if any(ch in text.lower() for ch in "ẹọṣ"):
        return "yo"
    folded = normalise(text)
    words = set(re.findall(r"[a-z0-9]+", folded))
    if words & _PIDGIN_WORDS or "no vex" in folded:
        return "pcm"
    spaced = " ".join(re.findall(r"[a-z0-9]+", folded))
    if words & _YORUBA_WORDS or any(phrase in spaced for phrase in _YORUBA_PHRASES):
        return "yo"
    return "en"


# --- amounts ------------------------------------------------------------------------------------

_NUMBER_WORD = "|".join(_YORUBA_NUMBERS)
MIN_PLAUSIBLE_NGN = 100  # "naira 2 days" is a delay, not a price
MAX_PLAUSIBLE_NGN = 100_000_000  # the ceiling of a deal draft; above it there is no price
_AMOUNT_TIERS: list[tuple[int, re.Pattern[str]]] = [
    # explicit currency: ₦3,500 / NGN 3500 / n3500 / naira 2k5
    (
        0,
        re.compile(
            r"(?:₦|ngn|naira|(?<![a-z0-9])n)\s*(\d+(?:\.\d+)?)(?:\s?(k)(\d+)?)?(?![a-z0-9])"
        ),
    ),
    # k notation: 2k5, 2.5k, 10k
    (1, re.compile(r"(?<![a-z0-9.])(\d+(?:\.\d+)?)(k)(\d+)?(?![a-z0-9])")),
    # 4500 naira
    (2, re.compile(r"(?<![a-z0-9.])(\d+(?:\.\d+)?)\s*(?:naira|ngn)\b")),
    # Yoruba number words: egberun marun = 5,000
    (3, re.compile(rf"\begberun\s+({_NUMBER_WORD})\b")),
    # a bare number of three to nine digits
    (4, re.compile(r"(?<![a-z0-9.])(\d{3,9})(?![a-z0-9])")),
]


def _value(tier: int, match: re.Match[str]) -> int:
    """The naira amount of one match. "2k5", "2.5k" and "2500" all mean 2,500."""
    whole = match.group(1)
    if tier == 3:
        return _YORUBA_NUMBERS[whole] * 1000
    if tier in (0, 1) and match.group(2) == "k":
        fraction = match.group(3)
        return round(float(f"{whole}.{fraction}" if fraction else whole) * 1000)
    return round(float(whole))


def _safe_value(tier: int, match: re.Match[str]) -> int | None:
    """`_value`, or None for a number too long to convert (a 1,900 digit "price")."""
    try:
        return _value(tier, match)
    except OverflowError:
        return None


def _amounts(text: str) -> list[tuple[int, int, int]]:
    """Every (tier, position, naira) found, best evidence first within the same position."""
    folded = _without_usdc(text)
    found = []
    for tier, pattern in _AMOUNT_TIERS:
        for match in pattern.finditer(folded):
            amount = _safe_value(tier, match)
            if amount is not None and MIN_PLAUSIBLE_NGN <= amount <= MAX_PLAUSIBLE_NGN:
                found.append((tier, match.start(), amount))
    return found


# --- USDC amounts -------------------------------------------------------------------------------
# Escrow is USDC. A USDC price is returned in the draft price unit: USDC x 1000 (so 12 USDC is
# 12000, and 12000 x 1000 = 12,000,000 base units, USDC having 6 decimals).

USDC_PRICE_SCALE = 1000
MAX_PLAUSIBLE_USDC = MAX_PLAUSIBLE_NGN / USDC_PRICE_SCALE
_USDC_WORD = r"(?:usdc|usd|dollars?)"
_USDC_PATTERNS = [
    re.compile(r"\$\s*(\d+(?:\.\d+)?)(?![\d.]*\d)"),  # $12, $ 12.50
    re.compile(rf"(?<![a-z0-9.])(\d+(?:\.\d+)?)\s*{_USDC_WORD}(?![a-z0-9])"),  # 12 USDC, 12usdc
    re.compile(r"(?<![a-z0-9])(?:usdc|usd)\s*(\d+(?:\.\d+)?)(?![a-z0-9]|\.\d)"),  # USDC 12
]


def _fold(text: str) -> str:
    return re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", normalise(text))


def _usdc_matches(folded: str) -> list[tuple[int, int, float]]:
    """Every (start, end, usdc) in already-folded text, in order of appearance."""
    found: dict[int, tuple[int, int, float]] = {}
    for pattern in _USDC_PATTERNS:
        for match in pattern.finditer(folded):
            try:
                value = float(match.group(1))
            except (OverflowError, ValueError):
                continue
            if 0 < value <= MAX_PLAUSIBLE_USDC and match.start() not in found:
                found[match.start()] = (match.start(), match.end(), value)
    return sorted(found.values())


def usdc_amounts(text: str) -> list[float]:
    """The different USDC amounts in order of appearance ("$12", "12 USDC", "USDC 12")."""
    seen: list[float] = []
    for _, _, value in _usdc_matches(_fold(text)):
        if value not in seen:
            seen.append(value)
    return seen


def _without_usdc(text: str) -> str:
    """The folded text with every USDC amount blanked out, so its digits are not read as naira."""
    folded = _fold(text)
    for start, end, _ in _usdc_matches(folded):
        folded = folded[:start] + " " * (end - start) + folded[end:]
    return folded


def parse_amount_ngn(text: str) -> int | None:
    """The price in naira: an explicit currency or "k" amount first, a bare number last."""
    found = _amounts(text)
    if not found:
        return None
    _, _, amount = min(found, key=lambda f: (f[0], f[1]))
    return amount


def _distinct_amounts(text: str) -> list[int]:
    """The different amounts in order of appearance."""
    ordered = sorted(_amounts(text), key=lambda f: f[1])
    seen: list[int] = []
    for _, _, amount in ordered:
        if amount not in seen:
            seen.append(amount)
    return seen


# --- deadline -----------------------------------------------------------------------------------


def parse_deadline_hours(text: str) -> int:
    """24 for tomorrow or today, N x 24 for "N days", otherwise the 48 hour default."""
    spaced = " ".join(re.findall(r"[a-z0-9]+", normalise(text)))
    days = re.search(r"\b(\d{1,2}) (?:days?|ojo)\b", spaced)
    if days:
        return int(days.group(1)) * 24
    next_day = r"\b(?:tomorrow|tmrw|2moro|today|tonight|loni)\b|\b(?:ni|wa) (?:ola|oni)\b"
    if re.search(next_day, spaced):
        return NEXT_DAY_HOURS
    return DEFAULT_DEADLINE_HOURS


# --- item ---------------------------------------------------------------------------------------

_DROP_PHRASES = sorted(
    [
        # English
        ("i", "want", "to", "buy"), ("i", "would", "like", "to", "buy"),
        ("id", "like", "to", "buy"),
        ("i", "want"), ("i", "would", "like"), ("can", "you", "hold"), ("could", "you", "hold"),
        ("please",), ("kindly",), ("hold",), ("reserve",), ("book",), ("deliver", "tomorrow"),
        ("delivered", "tomorrow"), ("deliver", "today"), ("for", "delivery"), ("deliver",),
        ("tomorrow",), ("today",), ("tonight",), ("tmrw",), ("for", "the"), ("for",), ("the",),
        ("a",), ("an",),
        # Pidgin
        ("abeg", "hold"), ("abeg",), ("make", "i"), ("i", "wan", "buy"), ("i", "wan"), ("oga",),
        ("di",),
        # Yoruba
        ("e", "jowo"), ("jowo",), ("mo", "fe", "ra"), ("mo", "fe"),
        ("e", "gbe", "e", "wa", "ola"), ("e", "gbe", "wa", "ola"), ("e", "gbe", "e", "wa"),
        ("e", "gbe", "wa"), ("ni", "ola"), ("ni",),
    ],
    key=len,
    reverse=True,
)  # fmt: skip
_PRICE_TOKEN = re.compile(r"^(?:₦|ngn|n)?(\d[\d,]*)(?:\.(\d+))?(?:(k)(\d*))?$")
_CURRENCY_TOKENS = {"₦", "ngn", "naira"}
_USDC_TOKENS = {"$", "usdc", "usd", "dollar", "dollars"}
_USDC_TOKEN = re.compile(r"^(?:\$|usdc|usd)?(\d+(?:\.\d+)?)(usdc|usd|dollars?)?$")


def _is_usdc_token(norm: list[str], i: int, usdc: set[float]) -> bool:
    """True for a USDC amount token: "$12", "12usdc", "usdc12", or "12" next to a USDC word."""
    token = norm[i]
    if token in _USDC_TOKENS:
        return bool(usdc)
    plain = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", token)
    match = _USDC_TOKEN.match(plain)
    if not match or float(match.group(1)) not in usdc:
        return False
    if plain != match.group(1):  # the currency is attached
        return True
    beside = {norm[j] for j in (i - 1, i + 1) if 0 <= j < len(norm)}
    return bool(beside & _USDC_TOKENS)
_EDGE_PUNCTUATION = ".,;:!?()\"'"


def _token_value(token: str) -> int | None:
    """The naira value a price-looking token stands for ("2k5" is 2500), or None."""
    match = _PRICE_TOKEN.match(token)
    if not match or len(match.group(1)) > 15:
        return None
    whole, decimals, k, k_digits = match.groups()
    whole = whole.replace(",", "")
    fraction = (k_digits or decimals) if k else decimals
    number = float(f"{whole}.{fraction}" if fraction else whole)
    return round(number * 1000) if k else round(number)


def extract_item(text: str) -> str:
    """The item, in the buyer's own spelling, without price, delivery and filler words."""
    original = [t.strip(_EDGE_PUNCTUATION) for t in text.split()]
    original = [t for t in original if t]
    norm = [normalise(t) for t in original]
    prices = set(_distinct_amounts(text))
    usdc = set(usdc_amounts(text))
    kept: list[str] = []
    i = 0
    while i < len(norm):
        phrase = next((p for p in _DROP_PHRASES if tuple(norm[i : i + len(p)]) == p), None)
        if phrase:
            i += len(phrase)
            continue
        token = norm[i]
        if token == "egberun":
            i += 1
            word = re.sub(r"\W", "", norm[i]) if i < len(norm) else ""
            if word in _YORUBA_NUMBERS or word.removesuffix("un") in _YORUBA_NUMBERS:
                i += 1  # "marun" or "marun-un"
            continue
        in_days = (
            token in ("in", "within")
            and i + 2 < len(norm)
            and norm[i + 1].isdigit()
            and norm[i + 2] in ("day", "days")
        )
        if in_days:
            i += 3
            continue
        if token.isdigit() and i + 1 < len(norm) and norm[i + 1] in ("day", "days", "ojo"):
            i += 2
            continue
        if _is_usdc_token(norm, i, usdc):
            i += 1
            continue
        if token in _CURRENCY_TOKENS or _token_value(token) in prices:
            i += 1
            continue
        kept.append(original[i])
        i += 1
    return " ".join(kept).strip(" ,.") or "item"


def _usdc_label(value: float) -> str:
    return f"{value:g}"


# --- the preview --------------------------------------------------------------------------------


def preview_terms(text: str, language_hint: str | None = None) -> dict[str, Any]:
    """Unsigned deal terms, or a refusal with no terms if the message tries to move money.

    A refusal is ``{"refused": True, "code", "reason", "language", "message"}``: it never repeats
    the user's text and never contains a key. Terms are ``{item, price_ngn, currency,
    deadline_hours, language, notes, warning}`` and are never signed. With ``currency`` "USDC",
    ``price_ngn`` is USDC x 1000 (the draft price unit); with "NGN" it is naira.
    """
    language = language_hint if language_hint in LANGUAGES else detect_language(text)
    refusal = screen(text)
    if refusal is not None:
        return {
            "refused": True,
            "code": refusal.code,
            "reason": refusal.reason,
            "language": language,
            "message": refusal_message(refusal, language),
        }
    usdc = usdc_amounts(text)
    naira = _distinct_amounts(text)
    if usdc:
        # A USDC amount wins: escrow is USDC. price_ngn carries it in the draft unit (USDC x 1000).
        currency = "USDC"
        price = round(usdc[0] * USDC_PRICE_SCALE)
        labels = [f"{_usdc_label(v)} USDC" for v in usdc] + [f"{n} NGN" for n in naira]
    else:
        currency = "NGN"
        price = parse_amount_ngn(text)
        labels = [str(n) for n in naira]
    warning = None
    if price is None:
        warning = "No price found: confirm the amount with the buyer."
    elif len(labels) > 1:
        warning = f"More than one amount found ({', '.join(labels)}): confirm the price."
    return {
        "item": extract_item(text),
        "price_ngn": price,
        "currency": currency,
        "deadline_hours": parse_deadline_hours(text),
        "language": language,
        "notes": [],
        "warning": warning,
    }
