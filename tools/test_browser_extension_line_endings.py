#!/usr/bin/env python3
"""Regression for the Windows-only v0.2.21 release failure.

Run with: python tools/test_browser_extension_line_endings.py
"""
import unittest
from build_browser_extensions import BROWSERS, ASSETS, canonical_text_bytes, expected, ROOT


class TestWindowsBrowserPackaging(unittest.TestCase):
    def test_crlf_and_lf_are_equivalent_for_text_only(self):
        body = b'{"name":"SNAPVERE"}\n"link":"https://snapvere.com/"\n'
        self.assertEqual(canonical_text_bytes(body), body)
        self.assertEqual(canonical_text_bytes(body.replace(b"\n", b"\r\n")), body)

    def test_real_source_differences_are_rejected(self):
        good = b'{"permissions":["activeTab"]}\n'
        changed = b'{"permissions":["tabs"]}\r\n'
        self.assertNotEqual(canonical_text_bytes(good), canonical_text_bytes(changed))

    def test_stray_carriage_returns_fail_closed(self):
        with self.assertRaisesRegex(AssertionError, "standalone carriage return"):
            canonical_text_bytes(b"invalid\ronly")

    def test_checked_out_manifests_match_generated_in_all_seven_browsers(self):
        for browser in BROWSERS:
            for name, payload in expected(browser).items():
                with self.subTest(browser=browser, asset=name):
                    self.assertEqual(
                        canonical_text_bytes((ROOT / browser / name).read_bytes()),
                        payload,
                    )
            self.assertEqual(len(expected(browser)), len(ASSETS) + 1)


if __name__ == "__main__":
    unittest.main()
