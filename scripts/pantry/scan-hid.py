#!/usr/bin/env python3
"""Headless scanner station using a USB HID barcode scanner (keyboard-wedge
mode). Grabs the scanner input device exclusively (so scans don't type into
whatever console has focus), assembles digits into barcodes, and forwards
each to Barcode Buddy, which resolves it (Grocy -> Open Food Facts) and
applies the current add/consume mode to Grocy stock.

Setup:
  sudo apt install python3-evdev
  BBUDDY_URL=http://localhost:9284/ BBUDDY_API_KEY=xxx \
    sudo -E ./scan-hid.py [/dev/input/by-id/<scanner-device>]

Without a device argument, the first input device whose name mentions
"barcode"/"scanner" (or failing that, the device list) is shown. Most
scanners have a built-in beeper, so unlike the webcam variant no host audio
feedback is needed; failures are still reported on stdout/journal.
"""
import os
import sys
import urllib.parse
import urllib.request

try:
    from evdev import InputDevice, categorize, ecodes, list_devices
except ImportError:
    sys.exit("python3-evdev is required: sudo apt install python3-evdev")

BBUDDY_URL = os.environ.get("BBUDDY_URL")
BBUDDY_API_KEY = os.environ.get("BBUDDY_API_KEY")
if not BBUDDY_URL or not BBUDDY_API_KEY:
    sys.exit("Set BBUDDY_URL and BBUDDY_API_KEY")

KEYMAP = {
    "KEY_0": "0", "KEY_1": "1", "KEY_2": "2", "KEY_3": "3", "KEY_4": "4",
    "KEY_5": "5", "KEY_6": "6", "KEY_7": "7", "KEY_8": "8", "KEY_9": "9",
    "KEY_MINUS": "-", "KEY_DOT": ".",
}
# Letters for command barcodes (BBUDDY-C etc.)
for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    KEYMAP[f"KEY_{letter}"] = letter


def find_scanner() -> str:
    devices = [InputDevice(path) for path in list_devices()]
    for device in devices:
        name = device.name.lower()
        if "barcode" in name or "scanner" in name or "keyboard" in name:
            return device.path
    listing = "\n".join(f"  {d.path}  {d.name}" for d in devices)
    sys.exit(
        f"No scanner-like input device found. Pass one explicitly:\n{listing}"
    )


def send_scan(barcode: str) -> None:
    url = (
        f"{BBUDDY_URL.rstrip('/')}/api/action/scan?"
        f"apikey={urllib.parse.quote(BBUDDY_API_KEY)}"
        f"&text={urllib.parse.quote(barcode)}"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            response.read()
        print(f"scanned: {barcode}", flush=True)
    except Exception as error:  # noqa: BLE001 - station must keep running
        print(f"FAILED:  {barcode} ({error})", file=sys.stderr, flush=True)


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else find_scanner()
    device = InputDevice(path)
    device.grab()
    print(f"Listening on {path} ({device.name}); scans go to {BBUDDY_URL}")

    buffer = ""
    for event in device.read_loop():
        if event.type != ecodes.EV_KEY:
            continue
        key = categorize(event)
        if key.keystate != key.key_down:
            continue
        if key.keycode == "KEY_ENTER":
            if buffer:
                send_scan(buffer)
            buffer = ""
        else:
            buffer += KEYMAP.get(key.keycode, "")


if __name__ == "__main__":
    main()
