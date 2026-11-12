"""Screen a chat message before the deal-term parser reads it (issue #2, benchmark A01).

The agent can never move money: it has no route, no key and no method that pays, refunds or
confirms a delivery. This module is defence in depth and a clear answer for the person typing.
It refuses three things, and only these:

* ``secret_request``   asking the agent for a private key, seed phrase, access key or credentials
* ``secret_in_input``  pasting key material into the chat (so nobody leaks one by accident)
* ``fund_movement``    telling the agent to release, send, refund or confirm money
* ``injection``        trying to change the agent's rules ("ignore previous instructions")

It is a deterministic heuristic, not a language model. It is tuned to refuse the attack and to
leave an honest deal alone: "release the funds after delivery" is a deal term, "release the funds
now" is a command. What it does not cover is written in docs/api.md.

Text is normalised first, so accents, zero-width characters, full-width letters, look-alike
Cyrillic letters, "l33tspeak" and "r e l e a s e" do not hide an attack.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Refusal:
    """Why a message was refused. ``code`` follows the ERR_* convention of docs/api.md."""

    code: str
    reason: str


SECRET_REQUEST = Refusal("ERR_REFUSED_SECRET_REQUEST", "secret_request")
SECRET_IN_INPUT = Refusal("ERR_REFUSED_SECRET_IN_INPUT", "secret_in_input")
FUND_MOVEMENT = Refusal("ERR_REFUSED_FUND_MOVEMENT", "fund_movement")
INJECTION = Refusal("ERR_REFUSED_INJECTION", "injection")

# --- normalisation ------------------------------------------------------------------------------

# Lower-case Cyrillic and Greek letters that look like Latin ones.
_LOOKALIKES = str.maketrans(
    {
        "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i",
        "ѕ": "s", "ј": "j", "ԁ": "d", "ɡ": "g", "һ": "h", "ԛ": "q", "ԝ": "w", "к": "k",
        "м": "m", "н": "h", "т": "t", "в": "b", "ο": "o", "α": "a", "ε": "e", "ι": "i",
        "κ": "k", "ν": "v", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
    }
)  # fmt: skip
_LEET = str.maketrans(
    {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"}
)


def normalise(text: str) -> str:
    """Lower-case text without accents, format characters or look-alike letters."""
    text = unicodedata.normalize("NFKD", text).lower()
    text = "".join(
        ch for ch in text if not unicodedata.combining(ch) and unicodedata.category(ch) != "Cf"
    )
    return text.translate(_LOOKALIKES)


_DOTTED = re.compile(r"(?<![a-z0-9])[a-z0-9](?:[._\-*][a-z0-9]){3,}(?![a-z0-9])")
_SPACED = re.compile(r"(?<![a-z0-9])[a-z0-9](?: [a-z0-9]){2,}(?![a-z0-9])")


def _join_letters(text: str) -> str:
    """Rejoin "r e l e a s e" and "r.e.l.e.a.s.e"; two spaces or more still separate words."""
    text = _DOTTED.sub(lambda m: re.sub(r"[._\-*]", "", m.group(0)), text)
    return _SPACED.sub(lambda m: m.group(0).replace(" ", ""), text)


def _variants(text: str) -> list[str]:
    """The message as typed, with letters rejoined, and with l33tspeak undone (all cleaned)."""
    cleaned = normalise(text)
    leet = cleaned.translate(_LEET)
    seen: list[str] = []
    for variant in (cleaned, _join_letters(cleaned), leet, _join_letters(leet)):
        if variant not in seen:
            seen.append(variant)
    return seen


def _words(text: str) -> str:
    """Letters and digits only, one space between words."""
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


# --- patterns -----------------------------------------------------------------------------------

_DET = (
    r"(?:the|di|this|dis|that|dat|my|your|ur|all|any|every|full|entire|whole|some|a|"
    r"me|us|him|her|them)"
)
_STRONG_VERB = (
    r"(?:release|releasing|send|transfer|payout|pay out|refund|withdraw|unlock|disburse|wire|"
    r"remit|drain|cash out|forward)"
)
_WEAK_VERB = r"(?:pay|give|move|settle)"
_OBJ_ANY = (
    r"(?:funds?|money|escrow|payments?|deposits?|balance|cash|naira|ngn|usdc|usdt|tokens?|near)"
)
_OBJ_MONEY = r"(?:funds?|money|escrow|payments?|deposits?|balance|cash)"

_FUND = [
    re.compile(
        rf"\b{_STRONG_VERB}\s+(?:{_DET}\s+){{0,3}}(?:\d+\s+){{0,2}}(?:escrow\s+)?{_OBJ_ANY}\b"
    ),
    re.compile(rf"\b{_WEAK_VERB}\s+(?:{_DET}\s+){{0,3}}(?:escrow\s+)?{_OBJ_MONEY}\b"),
    re.compile(r"\b(?:release|unlock)\s+am\b"),  # Pidgin: "release am"
    re.compile(  # confirming a delivery or payment is what releases escrow
        rf"\b(?:confirm|approve|verify|accept)\s+(?:{_DET}\s+){{0,2}}"
        r"(?:delivery|payment|receipt|transfer|transaction|release)\b"
    ),
    re.compile(
        rf"\b(?:mark|set|declare)\s+(?:{_DET}\s+){{0,2}}(?:\w+\s+){{0,2}}as\s+"
        r"(?:delivered|paid|confirmed|complete|completed|received|done|successful)\b"
    ),
    re.compile(  # Yoruba: tu owo (release money), san owo (pay), fi owo ranse (send money)
        r"\b(?:tu|san|fi|gbe|fun mi ni|yo|mu)\s+(?:\w+\s+){0,2}?owo\b"
    ),
]
_TOOL_NAMES = re.compile(
    r"\b(?:confirm_delivery|claim_timeout_refund|open_dispute|ft_transfer(?:_call)?|"
    r"create_deal|storage_deposit)\b"
)
_IMMEDIATE = re.compile(
    r"\b(?:now|immediately|asap|right away|at once|straight ?away|directly|urgent(?:ly)?|quickly|"
    r"this minute|oya|lesekese|nisinsinyi|bayi)\b"
)
_ADDRESSED = re.compile(
    r"\b(?:you|u|una|oga)\s+(?:must|should|need|have to|go ahead|can|could|will|would)\b|"
    r"\b(?:can|could|would|will)\s+(?:you|u)\b|\bplease\b|\bkindly\b|\babeg\b|"
    r"\b(?:order|command|instruct|require|demand|ask|tell|authori[sz]e)(?:ed|s)?\s+"
    r"(?:you|u|the agent)\s+to\b"
)
_RECIPIENT = re.compile(
    r"\bto\s+(?:my|this|that|the following|your|another|a|an)\s+(?:\w+\s+)?"
    r"(?:account|wallet|address)\b|\bto\s+(?:account|wallet|address)\b"
)
_ACCOUNT = re.compile(r"[a-z0-9_-]+\.(?:near|testnet)\b")
# A condition about the delivery is an honest deal term; "after you read this" is not.
_DELIVERY_CONDITION = re.compile(
    r"\b(?:after|when|once|upon|until|as soon as|if)\b.{0,25}?\b(?:deliver\w*|rider|buyer|goods?|"
    r"item|package|parcel|order|arrive\w*|reach\w*)\b|\bon delivery\b|\bpod\b"
)
_FILLER_START = re.compile(
    r"^(?:(?:please|kindly|abeg|just|now|then|ok|okay|so|and|e|jowo|oya|oga|boss|sir|"
    r"go ahead and|can you|could you|would you|will you|you must|you should|you need to|"
    r"you have to)\s+)*"
)

_INJECTION = [
    re.compile(
        r"\b(?:ignore|disregard|forget|override|bypass|skip|drop|neglect)\b(?:\s+\w+){0,4}?\s+"
        r"(?:previous|prior|above|earlier|preceding|former|all|any|every|your|the|di|ur|these|"
        r"those|system|safety|security|initial|original)(?:\s+\w+){0,3}?\s+"
        r"(?:instructions?|rules?|prompts?|guidelines?|policy|policies|constraints?|"
        r"restrictions?|guardrails?|programming|directives?|orders|commands)\b"
    ),
    re.compile(r"\b(?:system|developer|admin|root|sudo|god)\s*(?:prompt|mode|override|message)\b"),
    re.compile(
        r"\b(?:you are now|you re now|act as|pretend(?: to be| you are)?|roleplay as|"
        r"from now on you)\b"
        r".{0,30}\b(?:admin|root|owner|developer|escrow|judge|unrestricted|dan|jailbroken)\b"
    ),
    re.compile(r"\bjailbreak(?:ed)?\b|\bdan mode\b"),
    re.compile(  # Pidgin: "forget wetin dem tell you"
        r"\b(?:forget|ignore|no mind)\b.{0,20}\b"
        r"(?:wetin|di rules?|di instructions?|dem (?:tell|talk))\b"
    ),
    re.compile(  # Yoruba: "foju fo ilana" = ignore the instructions
        r"\b(?:foju fo|fojufo|gbagbe|mase tele|ma tele|ma gbo)\b(?:\s+\w+){0,3}\s+"
        r"(?:ilana|ofin|ase)\b"
    ),
]

_SECRET_NOUN = re.compile(
    r"\b(?:(?:private|secret|signing|access|recovery|seed|master|wallet|escrow|rider|payout|api|ssh|"
    r"deployer|credential|full access|function call|near)\s+(?:keys?|phrases?|words?|tokens?|"
    r"credentials?)(?!\s+(?:holder|chain|ring|card|case|cover|board|pad|duplicat\w*))|"
    r"mnemonic|passphrase|passwords?|credentials?|jwt|bearer token|kokoro asiri|"
    r"oro asina|oro asiri)\b"
)
_YOUR_KEY = re.compile(r"\b(?:your|ur|agent s|the agent s|escrow s)\s+(?:\w+\s+){0,2}keys?\b")
_KEY_YOU_HOLD = re.compile(r"\bkeys?\s+(?:you|u|dem|they)\s+(?:hold|have|use|got|keep|store|get)\b")
_SECRET_FILES = re.compile(r"near_private_key|private_key|seed_phrase|near-credentials|id_rsa")
_SECRET_PASTED = re.compile(
    r"\b(?:my|our|the)\s+(?:seed phrase|private key|secret key|recovery phrase|password|mnemonic)"
    r"\s+(?:is|are|was)\b"
)
_REQUEST_VERB = re.compile(
    r"\b(?:give|show|tell|reveal|print|return|send|share|display|dump|output|paste|read|leak|"
    r"expose|list|echo|cat|provide|hand|bring|fetch|get|need|want|post|copy|export|decrypt|"
    r"recover|what|whats|wetin|comot|open|check|fun mi|so fun mi|fi han mi|ran mi)\b"
)
_KEY_MATERIAL = re.compile(r"ed25519")


# --- decision -----------------------------------------------------------------------------------


def _clauses(variant: str) -> list[str]:
    """Split a message into clauses at punctuation, "and", "then" and "but".

    The whole message with punctuation removed is checked too, so "Release. The. Funds." is
    still read as one sentence.
    """
    parts = re.split(r"[.!?;,\n:]| and | then | but ", variant)
    clauses = [c for c in (_words(p) for p in parts) if c]
    flat = _words(variant)
    if flat and flat not in clauses:
        clauses.append(flat)
    return clauses


def _fund_movement(variant: str) -> bool:
    """True if a clause tells the agent to move money (and is not a delivery condition)."""
    if _TOOL_NAMES.search(variant):
        return True
    recipient_in_text = bool(_ACCOUNT.search(variant))
    for clause in _clauses(variant):
        for pattern in _FUND:
            match = pattern.search(clause)
            if not match:
                continue
            start = _FILLER_START.match(clause).end()
            commanding = (
                match.start() <= start
                or bool(_IMMEDIATE.search(clause))
                or bool(_ADDRESSED.search(clause))
                or bool(_RECIPIENT.search(clause))
                or recipient_in_text
            )
            urgent = bool(_IMMEDIATE.search(clause)) or bool(_RECIPIENT.search(clause))
            honest_term = bool(_DELIVERY_CONDITION.search(clause)) and not (
                urgent or recipient_in_text
            )
            if commanding and not honest_term:
                return True
    return False


def _secret_request(variant: str, words: str) -> bool:
    """True if the message asks the agent for a key, phrase or credential."""
    if _SECRET_FILES.search(variant):
        return True
    asking = bool(_REQUEST_VERB.search(words))
    if asking and (_SECRET_NOUN.search(words) or _YOUR_KEY.search(words)):
        return True
    return asking and bool(_KEY_YOU_HOLD.search(words))


def screen(text: str) -> Refusal | None:
    """Return a Refusal if ``text`` tries to move money, get a key or change the rules."""
    found: set[Refusal] = set()
    for variant in _variants(text):
        words = _words(variant)
        if _secret_request(variant, words):
            found.add(SECRET_REQUEST)
        if _KEY_MATERIAL.search(variant) or _SECRET_PASTED.search(words):
            found.add(SECRET_IN_INPUT)
        if _fund_movement(variant):
            found.add(FUND_MOVEMENT)
        if any(p.search(words) for p in _INJECTION):
            found.add(INJECTION)
    # The most dangerous leak wins: keys first, then money, then a plain rules attack.
    for refusal in (SECRET_REQUEST, SECRET_IN_INPUT, FUND_MOVEMENT, INJECTION):
        if refusal in found:
            return refusal
    return None


REFUSAL_MESSAGES: dict[str, dict[str, str]] = {
    SECRET_REQUEST.reason: {
        "en": (
            "I can't share or return keys, seed phrases or credentials, and nobody should ever "
            "paste them into a chat. The TrustLock agent holds no key that can move funds."
        ),
        "pcm": (
            "I no fit share or return key, seed phrase or any secret, and make you no ever paste "
            "dem for chat. Di agent no get any key wey fit move money."
        ),
    },
    SECRET_IN_INPUT.reason: {
        "en": (
            "That looks like a private key. Never paste a key into a chat: treat it as leaked and "
            "replace it. I did not read or keep it."
        ),
        "pcm": (
            "Dis one resemble private key. Never paste key for chat: treat am as leaked and change "
            "am. I no read or keep am."
        ),
    },
    FUND_MOVEMENT.reason: {
        "en": (
            "I can't release, send or refund money, or confirm a delivery. Funds are released only "
            "by the buyer's confirmation or the rider's one-time QR scan on the contract, never by "
            "this agent."
        ),
        "pcm": (
            "I no fit release, send or refund money, or confirm delivery. Na only di buyer "
            "confirmation or di rider QR scan fit release di money for di contract, no be "
            "dis agent."
        ),
    },
    INJECTION.reason: {
        "en": (
            "I can't follow instructions that try to change my rules. I only turn a deal message "
            "into unsigned terms: item, price and deadline."
        ),
        "pcm": (
            "I no fit follow instruction wey wan change my rules. I only dey turn deal message to "
            "unsigned terms: item, price and deadline."
        ),
    },
}


def refusal_message(refusal: Refusal, language: str) -> str:
    """The refusal text in the message's language (English until Yoruba copy is reviewed)."""
    texts = REFUSAL_MESSAGES[refusal.reason]
    return texts.get(language, texts["en"])
