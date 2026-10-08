# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

project_root = Path(SPECPATH).parent
skill_root = project_root / "vendor" / "artemis-xafs-fit-skill-main"

a = Analysis(
    [str(project_root / "xafs-native" / "native_bridge.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=[(str(skill_root), "vendor/artemis-xafs-fit-skill-main")],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="XAFSNativeBridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
