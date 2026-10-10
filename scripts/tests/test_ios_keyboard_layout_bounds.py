import unittest
from scripts.ios_keyboard_layout_bounds import observe_ios
from scripts.keyboard_layout_bounds import validate


class UIKitBoundsTests(unittest.TestCase):
    def tree(self, keyboard):
        nodes = [{'attributes': {'bounds': '[0,0][834,1210]'}},
                 {'attributes': {'resource-id': 'field', 'bounds': '[76,301][757,818]'}},
                 {'attributes': {'resource-id': 'save', 'bounds': '[76,820][757,860]'}}]
        if keyboard:
            nodes.append({'attributes': {'resource-id': 'inputView', 'bounds': keyboard}})
        return {'attributes': {}, 'children': nodes}

    def test_complete_field_and_action_fit_above_native_docked_keyboard(self):
        s = observe_ios(self.tree('[0,870][834,1210]'))
        self.assertEqual(s['viewport'], [0, 0, 834, 870])
        validate(s, 'field', ['save'], [], 'docked', ['save'])

    def test_partial_action_clipping_fails_even_when_the_action_center_is_usable(self):
        s = observe_ios(self.tree('[0,840][834,1210]'))
        with self.assertRaisesRegex(AssertionError, 'save clipped'):
            validate(s, 'field', ['save'], [], 'docked')

    def test_narrow_floating_keyboard_does_not_occupy_the_full_bottom(self):
        s = observe_ios(self.tree('[510,950][830,1200]'))
        self.assertEqual(s['mode'], 'floating')
        self.assertEqual(s['viewport'], [0, 0, 834, 1210])

    def test_missing_native_window_cannot_pass_as_a_valid_layout(self):
        with self.assertRaisesRegex(ValueError, 'no native window'):
            observe_ios({'attributes': {}, 'children': []})
