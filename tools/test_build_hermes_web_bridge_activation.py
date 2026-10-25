import hashlib
import io
from pathlib import Path
import shlex
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from tools import build_hermes_web_bridge_activation as builder


class ProductConsoleTests(unittest.TestCase):
    repo = Path(__file__).absolute().parent.parent

    def test_bounded_readable_parts_rebuild_exact_source_and_metadata(self):
        parts, source, manifest = builder.build(self.repo)
        self.assertEqual((parts, source, manifest), builder.build(self.repo))
        self.assertTrue(all(size <= 3600 for size in manifest["part_bytes"]))
        assembled = ''.join(parts).split("\n", 1)[1].rsplit(builder.TAG + "\n", 1)[0]
        self.assertEqual(assembled.encode(), source)
        self.assertEqual(hashlib.sha256(source).hexdigest(), manifest["source_sha256"])
        self.assertIn('--restart',shlex.split(parts[0].splitlines()[0]))

    def test_ast_checksum_accepts_blank_lines_and_checks_whole_program_before_execution(self):
        parts, source, _ = builder.build(self.repo)
        args = shlex.split(parts[0].splitlines()[0])
        code = args[args.index("-c") + 1]
        for raw, accepted in ((source, True), (source + b"\n", True),
                              (b"\n" + source, True),
                              (source.replace(b"0o640", b"0o644"), False), (b"\n" * 65537, False)):
            execute = Mock()
            with self.subTest(accepted=accepted), patch.object(sys, "stdin", SimpleNamespace(buffer=io.BytesIO(raw))):
                if accepted:
                    exec(code, {"exec": execute})
                    execute.assert_called_once()
                    self.assertEqual(execute.call_args.args[0].co_filename, "<verified-hermes-bridge-activation>")
                else:
                    with self.assertRaisesRegex(SystemExit, "HERMES_WEB_BRIDGE_ACTIVATION_SOURCE_INVALID"):
                        exec(code, {"exec": execute})
                    execute.assert_not_called()

    def test_source_and_business_data_pins_require_review(self):
        for name in ("SOURCE_SHA",):
            with patch.object(builder, name, "0" * 64), self.assertRaisesRegex(ValueError, "UNREVIEWED_HERMES_WEB_BRIDGE_ACTIVATION_SOURCE"):
                builder.build(self.repo)


if __name__ == "__main__":
    unittest.main()
