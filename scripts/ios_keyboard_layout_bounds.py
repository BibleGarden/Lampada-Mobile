#!/usr/bin/env python3
"""Check complete native form bounds against UIKit keyboard/window frames.

UIKit accessibility exposes inputView and window frames, not safe-area insets.
Android's OS navigation-inset contract remains separate.
"""
import json
import xml.etree.ElementTree as ET
from .keyboard_layout_bounds import rectangle, observe, hierarchy_xml, validate


def observe_ios(tree):
    xml = hierarchy_xml(tree)
    frames = [rectangle(n.get('bounds')) for n in ET.fromstring(xml).iter('node')]
    windows = [r for r in frames if r[0] == 0 and r[1] == 0 and r[2] > 0 and r[3] > 0]
    if not windows:
        raise ValueError('UIKit hierarchy has no native window frame')
    window = max(windows, key=lambda r: r[2] * r[3])
    observation = observe(xml, '', window[2], window[3])
    keyboard = observation['elements'].get('inputView')
    if keyboard:
        r = keyboard['bounds']
        docked = r[0] == 0 and r[2] == window[2] and r[3] == window[3]
        observation['mode'] = 'docked' if docked else 'floating'
        if docked:
            observation['viewport'][3] = r[1]
    return observation


def check(tree, form, mode, output):
    from .keyboard_contract_forms import FORMS
    input_id, lower_actions, deferred = FORMS[form]
    observation = observe_ios(tree)
    actions = [*lower_actions, f'{form}-keyboard-dismiss']
    ids = [input_id, *actions, *deferred]
    result = {'platform': 'ios', 'expected_mode': mode,
              'viewport': observation['viewport'], 'observed_mode': observation['mode'],
              'boundary_source': 'UIKit native inputView and window frames; safe-area insets are not exposed',
              'elements': {key: observation['elements'].get(key) for key in ids}}
    output.write_text(json.dumps(result, indent=2) + '\n')
    validate(observation, input_id, actions, deferred, mode, lower_actions)
