"""Map typed demo text to AXe HID events using the installed macOS layouts."""
from __future__ import annotations


def key_for(character: str, layout: dict) -> tuple[int, bool]:
    matches = [
        (int(hid), shifted)
        for shifted, mode in ((False, "plain"), (True, "shift"))
        for hid, output in layout[mode].items()
        if output == character
    ]
    if not matches:
        raise ValueError(f"No physical key for {character!r}")
    return min(matches, key=lambda item: (item[1], item[0]))


def typing_steps(value: str, layout: dict, delay: float, special: dict[str, float]) -> list[str]:
    steps = []
    sequence = []

    def flush():
        if sequence:
            steps.append("key-sequence --keycodes " + ",".join(map(str, sequence))
                         + f" --delay {delay}")
            sequence.clear()

    for character in value:
        hid, shifted = key_for(character, layout)
        if character in ",.":
            flush()
            steps.append(f"sleep {special['before_punctuation']}")
            steps.append(f"key-combo --modifiers 225 --key {hid}" if shifted else f"key {hid}")
            steps.append(f"sleep {special['after_punctuation']}")
        elif shifted:
            flush()
            steps.append(f"key-combo --modifiers 225 --key {hid}")
            if character.isupper():
                steps.append(f"sleep {special['after_uppercase']}")
        else:
            sequence.append(hid)
    flush()
    return steps


def validate_fixture(fixture: dict, layouts: dict, pacing: dict) -> None:
    for locale, item in fixture["locales"].items():
        layout = layouts.get(locale)
        if layout is None:
            raise ValueError(f"Missing system keyboard layout for {locale}")
        expected_probe = item["capture"]["keyboard_probe"]
        if layout["plain"].get("22") != expected_probe:
            raise ValueError(f"Keyboard probe differs from the system layout for {locale}")
        for device, settings in pacing["devices"].items():
            for field in ("intention", "answer", "takeaway"):
                try:
                    typing_steps(item["typed"][field], layout,
                                 settings["typing_delay_seconds"]["reflection" if field == "takeaway" else field],
                                 pacing["special_key_pause_seconds"])
                except (KeyError, ValueError) as error:
                    raise ValueError(f"Unmappable {device}.{locale}.{field}: {error}") from error
