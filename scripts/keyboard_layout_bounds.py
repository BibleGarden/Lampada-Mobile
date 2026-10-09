#!/usr/bin/env python3
"""Check native Android layout bounds against OS insets, independently of app geometry."""
import argparse
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


def rectangle(value):
    values = tuple(map(int, re.findall(r'-?\d+', value)))
    if len(values) != 4:
        raise ValueError(f'Expected a native rectangle, got {value!r}')
    return values


def observe(xml, window, width, height):
    elements = {}
    for node in ET.fromstring(xml).iter('node'):
        identifier = node.get('resource-id', '')
        if not identifier or node.get('visible-to-user') == 'false':
            continue
        bounds = rectangle(node.get('bounds', '[0,0][0,0]'))
        if bounds[2] > bounds[0] and bounds[3] > bounds[1]:
            elements[identifier] = {'bounds': bounds, 'focused': node.get('focused') == 'true'}
    viewport = [0, 0, width, height]
    sources = []
    pattern = r'type=(statusBars|navigationBars|ime) frame=(\[-?\d+,-?\d+\]\[-?\d+,-?\d+\])[^\n]*?visible=(true|false)'
    for kind, raw, visible in re.findall(pattern, window):
        r = rectangle(raw)
        if visible != 'true' or r[2] <= r[0] or r[3] <= r[1]:
            continue
        if r[0] < 0 or r[1] < 0 or r[2] > width or r[3] > height:
            continue
        source = (kind, r)
        if source not in sources:
            sources.append(source)
    for kind, r in sources:
        if kind == 'statusBars' and r[1] == 0 and r[2] - r[0] >= width // 2:
            viewport[1] = max(viewport[1], r[3])
        if kind == 'navigationBars':
            if r[3] == height and r[2] - r[0] >= width // 2:
                viewport[3] = min(viewport[3], r[1])
            elif r[0] == 0 and r[3] - r[1] >= height // 2:
                viewport[0] = max(viewport[0], r[2])
            elif r[2] == width and r[3] - r[1] >= height // 2:
                viewport[2] = min(viewport[2], r[0])
    ime = [r for kind, r in sources if kind == 'ime']
    occupied_top = min((r[1] for r in ime if r[3] >= viewport[3] and r[2] - r[0] >= viewport[2] - viewport[0]), default=viewport[3])
    docked = bool(ime) and occupied_top < viewport[3]
    if docked:
        viewport[3] = occupied_top
    return {'viewport': viewport, 'mode': 'docked' if docked else 'floating' if ime else 'hidden', 'elements': elements}


def validate(observation, input_id, action_ids, absent_ids, mode, lower_action_ids=()):
    actual_mode = observation['mode']
    if mode == 'hardware':
        if actual_mode != 'hidden':
            raise AssertionError(f'Expected no onscreen IME, observed {actual_mode}')
    elif actual_mode != mode:
        raise AssertionError(f'Expected {mode}, observed {actual_mode}')
    viewport = observation['viewport']
    elements = observation['elements']
    for identifier in absent_ids:
        if identifier in elements:
            raise AssertionError(f'{identifier} must be absent while editing')
    identifiers = list(dict.fromkeys(([input_id] if input_id else []) + list(action_ids) + list(lower_action_ids)))
    for identifier in identifiers:
        if identifier not in elements:
            raise AssertionError(f'Missing native element {identifier}')
        r = elements[identifier]['bounds']
        if not (viewport[0] <= r[0] < r[2] <= viewport[2] and viewport[1] <= r[1] < r[3] <= viewport[3]):
            raise AssertionError(f'{identifier} clipped: {r}, OS usable viewport: {viewport}')
    if input_id:
        r = elements[input_id]['bounds']
        if mode == 'floating' and r[3] - r[1] > (viewport[3] - viewport[1]) / 2:
            raise AssertionError('Floating keyboard expanded the input to more than half the OS viewport')
        if mode == 'hardware' and not elements[input_id]['focused']:
            raise AssertionError('Hardware-focus contract requires a genuinely focused native input')
        if lower_action_ids and r[3] > min(elements[x]['bounds'][1] for x in lower_action_ids):
            raise AssertionError('Input overlaps its lower actions')
    return observation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', required=True)
    parser.add_argument('--input-id')
    parser.add_argument('--actions', nargs='*', default=[])
    parser.add_argument('--below-input', nargs='*', default=[])
    parser.add_argument('--absent', nargs='*', default=[])
    parser.add_argument('--mode', choices=['hidden', 'hardware', 'floating', 'docked'], required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    def adb(*command):
        return subprocess.check_output(['adb', '-s', args.device, *command], text=True, timeout=30)
    size = adb('shell', 'wm', 'size')
    matches = re.findall(r'(?:Physical|Override) size: (\d+)x(\d+)', size)
    if not matches:
        raise RuntimeError('No Android display dimensions')
    width, height = map(int, matches[-1])
    remote = '/sdcard/lampada-layout-contract.xml'
    adb('shell', 'uiautomator', 'dump', remote)
    xml = adb('shell', 'cat', remote)
    adb('shell', 'rm', remote)
    window = adb('shell', 'dumpsys', 'window')
    observation = observe(xml, window, width, height)
    result = {'device': args.device, 'expected_mode': args.mode, 'viewport': observation['viewport'],
              'observed_mode': observation['mode'],
              'elements': {key: observation['elements'].get(key) for key in ([args.input_id] if args.input_id else []) + args.actions + args.below_input + args.absent}}
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
    validate(observation, args.input_id, args.actions, args.absent, args.mode, args.below_input)
    print('Native OS bounds contract passed')


if __name__ == '__main__':
    main()
