import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


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
        self.assertEqual(bridge.APP_VERSION, "1.4.0")

    def test_feff_path_metadata_reads_standard_header_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feff0001.dat"
            path.write_text(
                "# nleg=2 degen=6 reff=1.967 scatterer=O\n# k phase magnitude\n",
                encoding="utf-8",
            )
            result = bridge._feff_path_metadata(path, 0)
        self.assertEqual(result["name"], "feff0001.dat")
        self.assertEqual(result["nleg"], 2)
        self.assertEqual(result["degeneracy"], 6.0)
        self.assertEqual(result["reff_A"], 1.967)
        self.assertEqual(result["scatterer"], "O")
        self.assertEqual(len(result["sha256"]), 64)

    def test_prepare_feff_paths_runs_allowlisted_executable_and_returns_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "feff6.exe"
            executable.write_bytes(b"test")
            jobs = root / "jobs"
            jobs.mkdir()
            state = type("State", (), {
                "tools": {"feff": {"installed": True, "path": str(executable)}},
                "jobs_root": jobs,
            })()

            def fake_run(command, cwd, **kwargs):
                Path(cwd, "feff0001.dat").write_text(
                    "# nleg=2 degen=4 reff=2.01 scatterer=O\n", encoding="utf-8")
                Path(cwd, "paths.dat").write_text("paths", encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, "ok", "")

            payload = {
                "project_name": "IrO2",
                "content_base64": base64.b64encode(b"TITLE test\nEND\n").decode("ascii"),
            }
            with patch.object(bridge.subprocess, "run", side_effect=fake_run):
                result = bridge.prepare_feff_paths(state, payload)
        self.assertEqual(result["status"], "paths_ready")
        self.assertTrue(result["paths_dat_available"])
        self.assertEqual(result["paths"][0]["name"], "feff0001.dat")
        self.assertEqual(result["paths"][0]["index"], 0)

    def test_standards_publish_literature_domains_and_professional_warnings(self):
        rules = bridge.standards()["parameter_domains"]
        self.assertEqual(rules["paper_metal_first_shell"]["s02"], [0.75, 1.2])
        self.assertEqual(rules["paper_metal_first_shell"]["cn"], [4.0, 13.0])
        self.assertEqual(rules["paper_metal_first_shell"]["sigma2_A2"], [0.001, 0.02])
        self.assertEqual(rules["professional_warnings"]["correlation"], [0.9, 0.95])

    def test_fit_audit_rejects_parameter_outside_strict_paper_domain(self):
        audit_script = (MODULE_PATH.parents[1] / "vendor" / "artemis-xafs-fit-skill-main" /
                        "scripts" / "audit_fit_log.py")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "fit.log").write_text(
                "Independent points: 10\nNumber of variables: 3\nR-factor: 0.01\n", encoding="utf-8")
            (root / "fit_parameters.tsv").write_text(
                "path\tamplitude_factor\tcn_fit\tdelr_A\tsigma2_A2\te0_eV\ts02\ts02_status\n"
                "FEFF[1] O\t0.5\t3\t0.01\t0.006\t2\t0.9\tfixed_same_edge_standard\n",
                encoding="utf-8")
            output = root / "audit.json"
            completed = subprocess.run(
                [sys.executable, str(audit_script), str(root / "fit.log"),
                 "--analysis-role", "unknown", "--constraint-profile", "paper-metal",
                 "--output", str(output)], capture_output=True, text=True)
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(payload["status"], "fail")
        self.assertTrue(any("outside paper-metal domain" in item for item in payload["flags"]))

    def test_install_catalog_maps_demeter_suite_and_hama(self):
        for tool in ("athena", "artemis", "hephaestus", "feff", "demeter"):
            self.assertEqual(bridge.install_product_for_tool(tool), "demeter")
        self.assertEqual(bridge.install_product_for_tool("hama"), "hama")
        self.assertEqual(bridge.install_product_for_tool("all"), "all")
        self.assertTrue(bridge.INSTALL_CATALOG["demeter"]["url"].startswith("https://"))
        self.assertTrue(bridge.INSTALL_CATALOG["hama"]["url"].startswith("https://"))

    def test_installer_contract_requests_complete_silent_environment(self):
        installer = (MODULE_PATH.parent / "installer" / "XAFSNativeBridge.iss").read_text(encoding="utf-8")
        self.assertIn("--install-all --silent-demeter", installer)
        self.assertIn("waituntilterminated", installer)
        self.assertNotIn("Portable", installer)

    def test_silent_demeter_install_waits_and_uses_unattended_flags(self):
        class CompletedProcess:
            pid = 42

            @staticmethod
            def wait(timeout=None):
                return 0

        with tempfile.TemporaryDirectory() as directory:
            installer = Path(directory) / "demeter.exe"
            installer.write_bytes(b"installer")
            with patch.object(bridge, "_download_official_product", return_value=installer), \
                    patch.object(bridge.subprocess, "Popen", return_value=CompletedProcess()) as popen:
                result = bridge._launch_demeter_installer(silent=True, wait=True)
        command = popen.call_args.args[0]
        self.assertIn("/VERYSILENT", command)
        self.assertIn("/SUPPRESSMSGBOXES", command)
        self.assertTrue(result["installed"])

    def test_hama_archive_extraction_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "unsafe.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("../escape.exe", b"bad")
            with self.assertRaises(ValueError):
                bridge._safe_extract_zip(archive, Path(directory) / "target")
            self.assertFalse((Path(directory) / "escape.exe").exists())

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
