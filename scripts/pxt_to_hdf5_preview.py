#!/usr/bin/env python3
"""Convert Igor/Scienta PXT data to website-readable HDF5 plus preview assets.

This is the local half of the website's PXT -> H5 -> preview workflow. GitHub
Pages cannot run Python or erlab in the browser, so this script uses erlab/igor2
locally, writes a compact HDF5 file with clear axis datasets, then reuses
`hdf5_arpes_preview.py` to create a JSON/PNG preview package that the site can
import directly.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


np = None
xr = None
h5py = None
erlab_igor = None
igor_binarywave = None
igor_packed = None
igor_record = None


@dataclass
class SimpleArray:
    name: str
    values: Any
    dims: tuple[str, ...]
    coords: dict[str, Any]
    attrs: dict[str, Any]

    @property
    def shape(self) -> tuple[int, ...]:
        return tuple(int(v) for v in np.asarray(self.values).shape)

    @property
    def ndim(self) -> int:
        return np.asarray(self.values).ndim

    @property
    def dtype(self):
        return np.asarray(self.values).dtype


def add_erlab_path(path: str | None) -> None:
    if not path:
        return
    root = Path(path).expanduser().resolve()
    candidate = root / "src"
    sys.path.insert(0, str(candidate if candidate.exists() else root))


def load_dependencies(erlab_path: str | None = None) -> None:
    global np, xr, h5py, erlab_igor, igor_binarywave, igor_packed, igor_record
    add_erlab_path(erlab_path)
    missing = []
    try:
        import numpy as _np
    except ImportError:
        missing.append("numpy")
    try:
        import xarray as _xr
    except ImportError:
        missing.append("xarray")
    try:
        import h5py as _h5py
    except ImportError:
        missing.append("h5py")
    try:
        import igor2.binarywave as _igor_binarywave
        import igor2.packed as _igor_packed
        import igor2.record as _igor_record
    except ImportError:
        missing.append("igor2")

    erlab_missing = False
    try:
        import erlab.io.igor as _erlab_igor
    except Exception:
        _erlab_igor = None
        erlab_missing = True
    try:
        import xarray as _xr
    except ImportError:
        _xr = None
        erlab_missing = True

    if missing:
        print(
            "Missing Python package(s): {0}\n\n"
            "Install the lightweight converter dependencies:\n"
            "  python3 -m pip install igor2 h5py numpy pillow\n\n"
            "For full erlab support, use Python 3.11+:\n"
            "  python3.11 -m pip install erlab igor2 xarray h5netcdf h5py numpy pillow\n\n"
            "Or point to a local erlab checkout when running under Python 3.11+:\n"
            "  python3.11 scripts/pxt_to_hdf5_preview.py your.pxt --erlab-path /path/to/erlabpy-main".format(
                ", ".join(sorted(set(missing)))
            ),
            file=sys.stderr,
        )
        raise SystemExit(2)

    np = _np
    xr = _xr
    h5py = _h5py
    igor_binarywave = _igor_binarywave
    igor_packed = _igor_packed
    igor_record = _igor_record
    erlab_igor = _erlab_igor
    if erlab_missing:
        print("erlab/xarray not available; using the lightweight igor2 loader.", file=sys.stderr)


def safe_name(value: str, fallback: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "")).strip("_")
    return text or fallback


def unique_name(name: str, used: set[str], fallback: str) -> str:
    base = safe_name(name, fallback)
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f"{base}_{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def decode_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace").strip("\x00")
    if isinstance(value, str):
        return value.strip("\x00")
    try:
        if hasattr(value, "tolist"):
            value = value.tolist()
        if isinstance(value, (list, tuple)):
            raw = b"".join(
                item if isinstance(item, bytes) else bytes([int(item)])
                for item in value
                if item not in {"", 0, b"\x00"}
            )
            return raw.decode("utf-8", "replace").strip("\x00")
    except Exception:
        pass
    return str(value).strip("\x00")


def native_numeric(values: Any):
    arr = np.asarray(values)
    if arr.dtype.byteorder not in {"=", "|"}:
        return arr.byteswap().view(arr.dtype.newbyteorder("="))
    return arr


def field(container: Any, key: str, default: Any = None) -> Any:
    if hasattr(container, "get"):
        return container.get(key, default)
    try:
        return container[key]
    except Exception:
        return getattr(container, key, default)


def axis_kind(name: str) -> str:
    tokens = set(re.split(r"[^a-z0-9]+", str(name or "").lower()))
    if tokens & {"ev", "e", "energy", "kinetic", "binding", "w"}:
        return "energy"
    if tokens & {"alpha", "beta", "theta", "phi", "angle", "angles", "x", "y"}:
        return "angle"
    if tokens & {"k", "kx", "ky", "kz", "momentum"}:
        return "momentum"
    if tokens & {"temp", "temperature", "kelvin"}:
        return "temperature"
    return "axis"


def output_axis_name(dim_name: str, used: set[str]) -> str:
    kind = axis_kind(dim_name)
    lower = str(dim_name or "").lower()
    if kind == "energy":
        base = "eV"
    elif "beta" in lower or "theta_y" in lower:
        base = "beta"
    elif kind in {"angle", "momentum"}:
        base = "alpha"
    elif kind == "temperature":
        base = "temperature"
    else:
        base = safe_name(dim_name, "axis")
    name = base
    suffix = 2
    while name in used:
        name = f"{base}_{suffix}"
        suffix += 1
    used.add(name)
    return name


def wave_axis_units(wave_dict: dict[str, Any], version: int, bin_header: Any, wave_header: Any) -> list[str]:
    if version <= 3:
        return [decode_text(field(wave_header, "xUnits", "")), "", "", ""]

    units = [decode_text(value) for value in field(wave_header, "dimUnits", ["", "", "", ""])]
    if version >= 5 and "dimension_units" in wave_dict:
        sizes = list(field(bin_header, "dimEUnitsSize", []))
        raw_units = field(wave_dict, "dimension_units", b"")
        offset = 0
        for index, size in enumerate(sizes[:4]):
            size = int(size)
            if size > 0:
                units[index] = decode_text(raw_units[offset : offset + size])
            offset += size
    return (units + ["", "", "", ""])[:4]


def wave_dim_labels(wave_dict: dict[str, Any], version: int, bin_header: Any) -> list[str]:
    labels = ["", "", "", ""]
    if version < 5:
        return labels
    sizes = list(field(bin_header, "dimLabelsSize", []))
    raw_labels = field(wave_dict, "labels", [])
    for index, size in enumerate(sizes[:4]):
        if int(size) <= 0:
            continue
        try:
            labels[index] = decode_text(raw_labels[index])
        except Exception:
            labels[index] = ""
    return labels


def load_wave_lightweight(wave: Any, fallback_name: str) -> SimpleArray:
    if isinstance(wave, dict):
        wave_dict = wave
    elif isinstance(wave, igor_record.WaveRecord):
        wave_dict = wave.wave
    else:
        wave_dict = igor_binarywave.load(wave)

    payload = wave_dict["wave"]
    version = int(field(wave_dict, "version", 5))
    bin_header = payload["bin_header"]
    wave_header = payload["wave_header"]
    data = native_numeric(payload["wData"])

    if version <= 3:
        sf_a = [field(wave_header, "hsA", 1)] + [1, 1, 1]
        sf_b = [field(wave_header, "hsB", 0)] + [0, 0, 0]
    else:
        sf_a = list(field(wave_header, "sfA", [1, 1, 1, 1]))
        sf_b = list(field(wave_header, "sfB", [0, 0, 0, 0]))

    axis_units = wave_axis_units(payload, version, bin_header, wave_header)
    dim_labels = wave_dim_labels(payload, version, bin_header)
    default_dims = ["W", "X", "Y", "Z"]
    used_dims: set[str] = set()
    dims: list[str] = []
    coords: dict[str, Any] = {}
    for index, length in enumerate(data.shape):
        label = dim_labels[index] if index < len(dim_labels) else ""
        unit = axis_units[index] if index < len(axis_units) else ""
        dim_name = label or unit or (default_dims[index] if index < len(default_dims) else f"dim_{index}")
        dim_name = unique_name(dim_name, used_dims, f"dim_{index}")
        step = float(sf_a[index]) if index < len(sf_a) else 1.0
        start = float(sf_b[index]) if index < len(sf_b) else 0.0
        dims.append(dim_name)
        coords[dim_name] = np.linspace(start, start + step * (int(length) - 1), int(length))

    attrs: dict[str, Any] = {}
    note = decode_text(field(payload, "note", b""))
    for line in note.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", maxsplit=1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        for parser in (int, float):
            try:
                attrs[key] = parser(value)
                break
            except ValueError:
                continue
        else:
            attrs[key] = value

    name = decode_text(field(wave_header, "bname", "")) or fallback_name
    return SimpleArray(name=safe_name(name, fallback_name), values=data, dims=tuple(dims), coords=coords, attrs=attrs)


def load_experiment_lightweight(path: Path, recursive: bool = True) -> dict[str, SimpleArray]:
    experiment = None
    for byte_order in (">", "=", "<"):
        try:
            _, experiment = igor_packed.load(path, initial_byte_order=byte_order)
            break
        except ValueError:
            continue
    if experiment is None:
        raise OSError("Failed to load the Igor experiment file with igor2.")

    waves: dict[str, SimpleArray] = {}

    def visit(contents: dict[Any, Any], parent: str = "") -> None:
        for raw_name, record in contents.items():
            name = decode_text(raw_name)
            scoped_name = f"{parent}/{name}" if parent else name
            if isinstance(record, igor_record.WaveRecord):
                waves[scoped_name] = load_wave_lightweight(record, fallback_name=safe_name(scoped_name, "wave"))
            elif isinstance(record, dict) and recursive:
                visit(record, scoped_name)

    visit(experiment["root"])
    return waves


def load_pxt_dataset(path: Path, recursive: bool = True):
    suffix = path.suffix.lower()
    if erlab_igor is not None:
        try:
            if suffix in {".pxt", ".pxp"}:
                return erlab_igor.load_experiment(path, recursive=recursive)
            if suffix == ".ibw":
                return erlab_igor.load_wave(path).to_dataset(name=path.stem)
        except Exception as exc:
            print(f"erlab loader failed; falling back to igor2: {exc}", file=sys.stderr)

    if suffix in {".pxt", ".pxp"}:
        return load_experiment_lightweight(path, recursive=recursive)
    if suffix == ".ibw":
        return {path.stem: load_wave_lightweight(path, fallback_name=path.stem)}
    raise SystemExit(f"Unsupported input extension: {suffix}. Use .pxt, .pxp, or .ibw.")


def numeric_score(data_array) -> float:
    if data_array.ndim < 2:
        return -math.inf
    try:
        dtype = data_array.dtype
    except Exception:
        return -math.inf
    if not np.issubdtype(dtype, np.number) and not np.issubdtype(dtype, np.bool_):
        return -math.inf
    size = int(np.prod(data_array.shape)) if data_array.shape else 0
    if size < 16:
        return -math.inf
    text = " ".join([str(data_array.name or ""), *map(str, data_array.dims)]).lower()
    score = math.log10(max(size, 10))
    for word, points in (
        ("fine_cut", 120),
        ("cut", 70),
        ("map", 55),
        ("spectrum", 45),
        ("intensity", 40),
        ("image", 18),
        ("wave", 10),
    ):
        if word in text:
            score += points
    return score


def choose_primary_array(data: Any):
    if isinstance(data, SimpleArray):
        return data
    if xr is not None and isinstance(data, xr.DataArray):
        return data
    if xr is not None and isinstance(data, xr.Dataset):
        candidates = [data[name] for name in data.data_vars]
        scored = [(numeric_score(arr), arr) for arr in candidates]
        scored = [item for item in scored if math.isfinite(item[0])]
        if not scored:
            raise SystemExit("No numeric 2D+ wave was found in the PXT file.")
        return max(scored, key=lambda item: item[0])[1]
    if isinstance(data, dict):
        scored = [(numeric_score(arr), arr) for arr in data.values()]
        scored = [item for item in scored if math.isfinite(item[0])]
        if not scored:
            raise SystemExit("No numeric 2D+ wave was found in the PXT file.")
        return max(scored, key=lambda item: item[0])[1]
    raise SystemExit(f"Unsupported loader output type: {type(data).__name__}")


def squeeze_array(arr):
    if not isinstance(arr, SimpleArray):
        return arr.squeeze(drop=True)
    values = np.asarray(arr.values)
    keep_axes = [index for index, length in enumerate(values.shape) if int(length) != 1]
    squeezed = np.squeeze(values)
    dims = tuple(arr.dims[index] for index in keep_axes)
    coords = {dim: arr.coords[dim] for dim in dims if dim in arr.coords}
    return SimpleArray(name=arr.name, values=squeezed, dims=dims, coords=coords, attrs=dict(arr.attrs))


def coord_values(arr, dim: str, length: int):
    if dim in arr.coords:
        coord = arr.coords[dim]
        values = np.asarray(getattr(coord, "values", coord))
        if values.ndim == 1 and values.size == length:
            return values
    return np.arange(length, dtype=float)


def json_attr(value: Any) -> str | int | float:
    if isinstance(value, (str, int, float)):
        return value
    if isinstance(value, bool):
        return int(value)
    if value is None:
        return ""
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return json.dumps(value, default=str, ensure_ascii=False)


def write_site_hdf5(arr, out_path: Path, input_path: Path, dataset_name: str | None) -> dict[str, Any]:
    arr = squeeze_array(arr)
    if arr.ndim < 2:
        raise SystemExit(f"Selected wave must be at least 2D after squeeze; got shape {arr.shape}.")
    data = np.asarray(arr.values)
    if data.dtype.kind not in "fiu":
        data = data.astype(np.float32)

    main_name = safe_name(dataset_name or arr.name or "intensity", "intensity")
    used_axes: set[str] = set()
    axis_names = [output_axis_name(dim, used_axes) for dim in arr.dims]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with h5py.File(out_path, "w") as h5:
        dset = h5.create_dataset(main_name, data=data, compression="gzip", shuffle=True)
        dset.attrs["source_file"] = input_path.name
        dset.attrs["original_dims"] = json.dumps(list(map(str, arr.dims)), ensure_ascii=False)
        dset.attrs["axis_datasets"] = json.dumps(axis_names, ensure_ascii=False)
        dset.attrs["converter"] = "scripts/pxt_to_hdf5_preview.py"
        for key, value in arr.attrs.items():
            if key in dset.attrs:
                continue
            try:
                dset.attrs[str(key)] = json_attr(value)
            except Exception:
                dset.attrs[str(key)] = str(value)

        for dim, axis_name, length in zip(arr.dims, axis_names, arr.shape):
            axis = h5.create_dataset(axis_name, data=coord_values(arr, dim, int(length)))
            axis.attrs["source_dim"] = str(dim)
            axis.attrs["kind"] = axis_kind(str(dim))

    return {
        "dataset": f"/{main_name}",
        "shape": [int(v) for v in arr.shape],
        "dims": list(map(str, arr.dims)),
        "axes": axis_names,
        "dtype": str(data.dtype),
    }


def run_preview_script(h5_path: Path, json_path: Path, png_path: Path) -> bool:
    script_path = Path(__file__).with_name("hdf5_arpes_preview.py")
    if not script_path.exists():
        print(f"Preview script missing: {script_path}", file=sys.stderr)
        return False
    spec = importlib.util.spec_from_file_location("hdf5_arpes_preview", script_path)
    if spec is None or spec.loader is None:
        print(f"Could not load preview script: {script_path}", file=sys.stderr)
        return False
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main([str(h5_path), "--out", str(json_path), "--png", str(png_path)])
    return True


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert .pxt/.pxp/.ibw to website-readable HDF5 and preview assets.")
    parser.add_argument("input_file", help="Input Igor PXT/PXP/IBW file")
    parser.add_argument("--out-dir", default="pxt_h5_exports", help="Directory for .h5/.json/.png outputs")
    parser.add_argument("--h5", help="Explicit HDF5 output path")
    parser.add_argument("--preview-json", help="Explicit preview JSON package path")
    parser.add_argument("--preview-png", help="Explicit preview PNG path")
    parser.add_argument("--dataset-name", help="Main dataset name inside the output HDF5")
    parser.add_argument("--erlab-path", help="Path to a local erlabpy checkout; its src/ folder is added to sys.path")
    parser.add_argument("--no-preview", action="store_true", help="Only write the HDF5 file")
    parser.add_argument("--no-recursive", dest="recursive", action="store_false", help="Only read waves from the Igor root folder")
    parser.set_defaults(recursive=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv or sys.argv[1:])
    load_dependencies(args.erlab_path)

    input_path = Path(args.input_file).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")
    out_dir = Path(args.out_dir).expanduser().resolve()
    stem = safe_name(input_path.stem, "converted")
    h5_path = Path(args.h5).expanduser().resolve() if args.h5 else out_dir / f"{stem}.h5"
    json_path = Path(args.preview_json).expanduser().resolve() if args.preview_json else out_dir / f"{stem}-preview.json"
    png_path = Path(args.preview_png).expanduser().resolve() if args.preview_png else out_dir / f"{stem}-preview.png"

    loaded = load_pxt_dataset(input_path, recursive=args.recursive)
    primary = choose_primary_array(loaded)
    summary = write_site_hdf5(primary, h5_path, input_path, args.dataset_name)
    print(f"Wrote HDF5: {h5_path}")
    print(f"Primary dataset: {summary['dataset']} shape={summary['shape']} axes={summary['axes']}")

    if not args.no_preview:
        try:
            run_preview_script(h5_path, json_path, png_path)
            print(f"Wrote preview JSON: {json_path}")
            print(f"Wrote preview PNG: {png_path}")
        except Exception as exc:
            print(f"Preview generation failed: {exc}", file=sys.stderr)
            print("The HDF5 file was still written; upload it directly or rerun scripts/hdf5_arpes_preview.py.", file=sys.stderr)


if __name__ == "__main__":
    main()
