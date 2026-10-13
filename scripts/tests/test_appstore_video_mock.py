import importlib.util
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "appstore_video_mock", Path(__file__).resolve().parents[1] / "appstore-video-mock.py"
)
mock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mock)


class VersionCheckQueryTest(unittest.TestCase):
    def test_accepts_client_query_for_each_platform(self):
        for platform in ("ios", "android"):
            with self.subTest(platform=platform):
                self.assertEqual(
                    mock.version_check_platform(f"app=lampada&app_version=1.3.59&platform={platform}"),
                    platform,
                )

    def test_rejects_missing_or_unexpected_platform(self):
        for query in (
            "app=lampada&app_version=1.3.59",
            "app=lampada&app_version=1.3.59&platform=web",
            "app=lampada&app_version=1.3.59&platform=ios&platform=android",
        ):
            with self.subTest(query=query), self.assertRaises(ValueError):
                mock.version_check_platform(query)


if __name__ == "__main__":
    unittest.main()
