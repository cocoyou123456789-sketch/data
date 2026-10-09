import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "xafs-native" / "native_bridge.py"
SPEC = importlib.util.spec_from_file_location("xafs_native_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(bridge)


class NativeBridgeTests(unittest.TestCase):
    def test_windows_helpers_use_no_console_window(self):
        options = bridge._hidden_subprocess_options("nt")
        self.assertEqual(options["creationflags"], 0x08000000)
        self.assertEqual(bridge._hidden_subprocess_options("posix"), {})

    def test_bridge_reports_installer_version(self):
        self.assertEqual(bridge.APP_VERSION, "1.0.4")

    def test_running_demeter_process_reveals_launchers_root_and_bundled_feff(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "DemeterPerl"
            perl = root / "perl" / "bin" / "perl.exe"
            athena = root / "perl" / "site" / "bin" / "dathena.bat"
            feff = root / "c" / "bin" / "feff6.exe"
            for executable in (perl, athena, feff):
                executable.parent.mkdir(parents=True, exist_ok=True)
                executable.write_bytes(b"test")
            processes = [{
                "ProcessId": 101, "Name": "perl.exe", "ExecutablePath": str(perl),
                "CommandLine": f'perl -x -S "{athena}"',
            }]
            tools = bridge.infer_tool_paths_from_processes(bridge.discover_tools({}), processes)
            self.assertTrue(tools["athena"]["installed"])
            self.assertEqual(Path(tools["athena"]["path"]), athena.resolve())
            self.assertEqual(bridge.demeter_root_from_processes(processes), str(root.resolve()))

    def test_configured_executable_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "dathena.exe"
            executable.write_bytes(b"test")
            tools = bridge.discover_tools({"tools": {"athena": str(executable)}})
            self.assertTrue(tools["athena"]["installed"])
            self.assertEqual(tools["athena"]["source"], "config")
            self.assertEqual(Path(tools["athena"]["path"]), executable.resolve())

    def test_job_preserves_hashes_and_paper_constraints(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = {
                "project_name": "Ni sample/../bad",
                "files": [{
                    "name": "sample.xdi",
                    "role": "sample_raw",
                    "content_base64": base64.b64encode(b"energy mu\n1 2\n").decode("ascii"),
                }],
                "options": {"final_kweights": [1, 2, 3]},
            }
            result = bridge.create_job(payload, Path(directory))
            job_dir = Path(result["job_dir"])
            self.assertEqual(job_dir.parent, Path(directory).resolve())
            manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
            self.assertEqual(manifest["files"][0]["role"], "sample_raw")
            self.assertEqual(len(manifest["files"][0]["sha256"]), 64)
            self.assertEqual(manifest["standards"]["fit"]["kweights"], [1, 2, 3])
            self.assertTrue(manifest["provenance"]["native_execution_required"])

    def test_non_loopback_binding_is_rejected_by_contract(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('args.host not in ("127.0.0.1", "localhost", "::1")', source)

    def test_vendored_skill_is_discovered(self):
        skill = bridge.discover_skill({})
        self.assertTrue(skill["installed"])
        self.assertTrue(Path(skill["runner"]).is_file())

    def test_browser_origin_allowlist_is_not_wildcard(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertNotIn('Access-Control-Allow-Origin", "*"', source)
        self.assertIn("https://cocoyou123456789-sketch.github.io", source)

    def test_running_processes_detect_demeter_and_hama(self):
        processes = [
            {"ProcessId": 101, "Name": "dathena.exe", "ExecutablePath": r"C:\\Demeter\\dathena.exe", "CommandLine": "dathena.exe"},
            {"ProcessId": 202, "Name": "perl.exe", "ExecutablePath": r"C:\\Demeter\\perl.exe", "CommandLine": r"perl.exe C:\\Demeter\\dartemis.exe"},
            {"ProcessId": 303, "Name": "HAMA-Fortran.exe", "ExecutablePath": r"C:\\HAMA\\HAMA-Fortran.exe", "CommandLine": "HAMA-Fortran.exe"},
        ]
        running = bridge._running_tools_from_processes(processes)
        self.assertEqual(running["athena"], [101])
        self.assertEqual(running["artemis"], [202])
        self.assertEqual(running["hama"], [303])
        self.assertEqual(running["hephaestus"], [])

    def test_status_exposes_installed_and_running_separately(self):
        tools = {"athena": {"installed": True, "path": "dathena.exe"}}
        original = bridge._windows_processes
        try:
            bridge._windows_processes = lambda: [{"ProcessId": 7, "Name": "dathena.exe"}]
            status = bridge.with_running_status(tools)["athena"]
        finally:
            bridge._windows_processes = original
        self.assertTrue(status["installed"])
        self.assertTrue(status["running"])
        self.assertEqual(status["process_ids"], [7])

    def test_windowed_request_logging_does_not_require_stderr(self):
        with tempfile.TemporaryDirectory() as directory:
            original_root = bridge.APP_ROOT
            original_stderr = bridge.sys.stderr
            try:
                bridge.APP_ROOT = Path(directory)
                bridge.sys.stderr = None
                handler = object.__new__(bridge.Handler)
                handler.client_address = ("127.0.0.1", 12345)
                handler.log_message("GET %s", "/api/status")
            finally:
                bridge.APP_ROOT = original_root
                bridge.sys.stderr = original_stderr
            log = (Path(directory) / "bridge.log").read_text(encoding="utf-8")
            self.assertIn("GET /api/status", log)

    def test_bridge_server_disables_port_reuse(self):
        self.assertFalse(bridge.BridgeHTTPServer.allow_reuse_address)
        self.assertFalse(bridge.BridgeHTTPServer.allow_reuse_port)


if __name__ == "__main__":
    unittest.main()
