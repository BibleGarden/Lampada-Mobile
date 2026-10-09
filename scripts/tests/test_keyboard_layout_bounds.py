import unittest
from scripts.keyboard_layout_bounds import observe, validate, hierarchy_xml, has_hardware_keyboard


class LayoutContractTests(unittest.TestCase):
    def snapshot(self, field, button, ime=None, focused=False):
        xml = f'<hierarchy><node resource-id="field" bounds="{field}" focused="{str(focused).lower()}"/><node resource-id="save" bounds="{button}"/></hierarchy>'
        window = 'type=statusBars frame=[0,0][904,85] visible=true\ntype=navigationBars frame=[0,2190][904,2316] visible=true'
        if ime:
            window += f'\ntype=ime frame={ime} visible=true'
        return observe(xml, window, 904, 2316)

    def test_nav_bar_clipping_fails_even_when_button_exists(self):
        s = self.snapshot('[50,350][850,1800]', '[50,2150][850,2250]')
        with self.assertRaisesRegex(AssertionError, 'save clipped'):
            validate(s, 'field', ['save'], [], 'hidden')

    def test_original_floating_giant_field_is_rejected(self):
        s = self.snapshot('[50,350][850,1900]', '[50,2000][850,2100]', '[0,2190][904,2316]')
        with self.assertRaisesRegex(AssertionError, 'more than half'):
            validate(s, 'field', ['save'], [], 'floating')

    def test_compact_floating_form_with_safe_actions(self):
        s = self.snapshot('[50,350][850,750]', '[50,2000][850,2100]', '[0,2190][904,2316]')
        validate(s, 'field', ['save'], [], 'floating')

    def test_docked_keyboard_is_an_os_boundary_not_an_app_report(self):
        s = self.snapshot('[50,350][850,1300]', '[50,1350][850,1400]', '[0,1450][904,2316]')
        self.assertEqual(s['viewport'][3], 1450)
        validate(s, 'field', ['save'], [], 'docked')

    def test_focus_does_not_imply_software_keyboard(self):
        s = self.snapshot('[50,350][850,1300]', '[50,2000][850,2100]', focused=True)
        validate(s, 'field', ['save'], [], 'hardware')

    def test_hidden_action_cannot_pass_merely_because_it_is_disabled(self):
        s = self.snapshot('[50,350][850,750]', '[50,2000][850,2100]', '[0,2190][904,2316]')
        with self.assertRaisesRegex(AssertionError, 'must be absent'):
            validate(s, 'field', [], ['save'], 'floating')

    def test_foreign_display_insets_do_not_contaminate_active_display(self):
        s = observe('<hierarchy/>', 'type=navigationBars frame=[0,2700][1280,2856] visible=true', 904, 2316)
        self.assertEqual(s['viewport'], [0, 0, 904, 2316])

    def test_landscape_side_navigation_bar(self):
        s = observe('<hierarchy/>', 'type=navigationBars frame=[2130,0][2176,1812] visible=true', 2176, 1812)
        self.assertEqual(s['viewport'], [0, 0, 2130, 1812])

    def test_overlap_is_rejected_even_when_both_elements_are_inside_viewport(self):
        s = self.snapshot('[50,350][850,2050]', '[50,2000][850,2100]')
        with self.assertRaisesRegex(AssertionError, 'overlaps'):
            validate(s, 'field', ['save'], [], 'hidden', ['save'])

    def test_dismiss_button_can_be_above_input(self):
        s = self.snapshot('[50,350][850,750]', '[700,280][850,330]', '[0,2190][904,2316]')
        validate(s, 'field', ['save'], [], 'floating')

    def test_native_maestro_hierarchy_preserves_real_bounds(self):
        tree = {'attributes': {}, 'children': [{'attributes': {'resource-id': 'field', 'bounds': '[50,350][850,750]', 'focused': 'true'}}]}
        s = observe(hierarchy_xml(tree), '', 904, 2316)
        self.assertEqual(s['elements']['field']['bounds'], (50, 350, 850, 750))
        self.assertTrue(s['elements']['field']['focused'])

    def test_hardware_presence_uses_native_configuration_not_the_ime_catalog(self):
        self.assertTrue(has_hardware_keyboard('  mGlobalConfiguration={port finger qwerty/v/v dpad/v}'))
        self.assertFalse(has_hardware_keyboard('  mGlobalConfiguration={port finger nokeys/v/h dpad/v}'))
        self.assertFalse(has_hardware_keyboard('IME layout type=qwerty; enabled=true'))

    def test_finished_hardware_input_must_release_its_native_responder(self):
        s = self.snapshot('[50,350][850,1300]', '[50,2000][850,2100]', focused=True)
        with self.assertRaisesRegex(AssertionError, 'Expected input focus=False'):
            validate(s, 'field', ['save'], [], 'hidden', expected_focus=False)
        s = self.snapshot('[50,350][850,1300]', '[50,2000][850,2100]', focused=False)
        validate(s, 'field', ['save'], [], 'hidden', expected_focus=False)
