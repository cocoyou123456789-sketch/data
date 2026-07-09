#!/usr/bin/env python3
"""Create an ImageTool-style ARPES preview package from an HDF5 file.

The browser HDF5 reader is convenient, but it cannot reliably decode every
storage layout. This script uses the native Python HDF5 stack, renders a clear
ARPES map with top/right line profiles, and writes a JSON package that the
website can import.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

h5py = None
np = None
Image = None
ImageDraw = None
ImageFont = None


def load_dependencies():
    global h5py, np, Image, ImageDraw, ImageFont
    missing = []
    try:
        import h5py as _h5py
    except ImportError:
        missing.append("h5py")
    try:
        import numpy as _np
    except ImportError:
        missing.append("numpy")
    try:
        from PIL import Image as _Image
        from PIL import ImageDraw as _ImageDraw
        from PIL import ImageFont as _ImageFont
    except ImportError:
        missing.append("pillow")

    if missing:
        print(
            "Missing Python package(s): {0}\n"
            "Install them once, then run the command again:\n"
            "  python3 -m pip install h5py numpy pillow".format(", ".join(sorted(set(missing)))),
            file=sys.stderr,
        )
        raise SystemExit(2)

    h5py = _h5py
    np = _np
    Image = _Image
    ImageDraw = _ImageDraw
    ImageFont = _ImageFont


def is_numeric_dtype(dtype):
    return np.issubdtype(dtype, np.number) or np.issubdtype(dtype, np.bool_)


def safe_json_value(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def dataset_path(name):
    return name if name.startswith("/") else f"/{name}"


def iter_datasets(h5):
    rows = []

    def visit(name, obj):
        if isinstance(obj, h5py.Dataset):
            rows.append({
                "path": dataset_path(name),
                "name": os.path.basename(name) or name,
                "shape": tuple(int(v) for v in (obj.shape or ())),
                "dtype": str(obj.dtype),
                "attrs": {str(k): safe_json_value(v) for k, v in obj.attrs.items()},
                "object": obj,
            })

    h5.visititems(visit)
    return rows


def tokens_for_path(path):
    return [token for token in re.split(r"[^a-z0-9]+", path.lower()) if token]


def axis_kind(path):
    tokens = tokens_for_path(path)
    text = " ".join(tokens)
    if any(token in {"ev", "e", "energy", "binding", "kinetic"} for token in tokens):
        return "energy"
    if any(token in {"alpha", "beta", "theta", "phi", "angle", "ang"} for token in tokens):
        return "angle"
    if any(token in {"kx", "ky", "kz", "k", "momentum"} for token in tokens):
        return "momentum"
    if any(token in {"temp", "temperature", "tc", "kelvin"} for token in tokens):
        return "temperature"
    if "energy" in text:
        return "energy"
    return "axis"


def axis_label(path, kind):
    base = os.path.basename(path).strip("/") or kind
    lower = base.lower()
    if kind == "energy":
        return "Kinetic Energy [eV]" if "kinetic" in lower else "Energy [eV]"
    if kind == "angle":
        return f"{base} [deg]"
    if kind == "momentum":
        return base
    if kind == "temperature":
        return "Temperature [K]"
    return base


def read_axis_range(ds):
    try:
        values = np.asarray(ds[...], dtype=float).reshape(-1)
    except Exception:
        return None
    values = values[np.isfinite(values)]
    if values.size < 2:
        return None
    return [float(values[0]), float(values[-1])]


def raw_array_quality(values):
    finite = np.asarray(values, dtype=float)
    finite = finite[np.isfinite(finite)]
    if finite.size == 0:
        return -np.inf
    abs_values = np.sort(np.abs(finite))
    p50, p95, p99 = np.nanpercentile(abs_values, [50, 95, 99])
    score = finite.size / max(1, np.size(values)) * 100.0
    if p99 < 1e6:
        score += 90
    elif p99 < 1e12:
        score += 35
    elif p99 > 1e30:
        score -= 180
    if p50 > 0 and p95 / max(p50, 1e-30) < 1e6:
        score += 30
    if p95 == 0 and p99 == 0:
        score -= 10
    return score


def maybe_byteswap_numeric_array(values):
    arr = np.asarray(values)
    if arr.dtype.kind not in "fiu" or arr.dtype.itemsize <= 1:
        return arr, False
    try:
        swapped = arr.byteswap().view(arr.dtype)
    except Exception:
        return arr, False
    normal_score = raw_array_quality(arr)
    swapped_score = raw_array_quality(swapped)
    if swapped_score > normal_score + 28:
        return swapped, True
    return arr, False


def collect_axes(datasets):
    axes = []
    for info in datasets:
        ds = info["object"]
        if ds.ndim != 1 or not is_numeric_dtype(ds.dtype) or not ds.shape or ds.shape[0] < 2:
            continue
        kind = axis_kind(info["path"])
        axes.append({
            "path": info["path"],
            "length": int(ds.shape[0]),
            "kind": kind,
            "label": axis_label(info["path"], kind),
            "range": read_axis_range(ds),
        })
    return axes


def best_axis_for_length(axes, length, preferred=()):
    matches = [axis for axis in axes if axis["length"] == int(length)]
    if not matches:
        return None
    preferred = tuple(preferred or ())

    def score(axis):
        value = 0
        if axis["kind"] in preferred:
            value += 100 - preferred.index(axis["kind"]) * 8
        if axis["range"]:
            value += 10
        path = axis["path"].lower()
        if "/axis" in path or "/axes" in path:
            value += 4
        return value

    return max(matches, key=score)


def dataset_score(info):
    shape = info["shape"]
    if len(shape) < 2:
        return -1
    if not is_numeric_dtype(info["object"].dtype):
        return -1
    size = math.prod(shape) if shape else 0
    if size < 64:
        return -1
    text = info["path"].lower()
    score = math.log10(max(size, 10))
    for word, points in (
        ("fine_cut", 90),
        ("fine", 40),
        ("cut", 65),
        ("map", 55),
        ("spectrum", 40),
        ("spectra", 40),
        ("intensity", 35),
        ("band", 25),
        ("image", 15),
        ("root", 5),
    ):
        if word in text:
            score += points
    if any(word in text for word in ("axis", "energy", "alpha", "theta", "phi")) and len(shape) == 2 and min(shape) <= 4:
        score -= 50
    return score


def choose_dataset(datasets, requested):
    if requested:
        requested = dataset_path(requested)
        for info in datasets:
            if info["path"] == requested:
                if len(info["shape"]) < 2 or not is_numeric_dtype(info["object"].dtype):
                    raise SystemExit(f"Dataset is not a numeric 2D/3D array: {requested}")
                return info
        raise SystemExit(f"Dataset not found: {requested}")
    scored = [(dataset_score(info), info) for info in datasets]
    scored = [item for item in scored if item[0] >= 0]
    if not scored:
        raise SystemExit("No numeric 2D/3D dataset was found in this HDF5 file.")
    return max(scored, key=lambda item: item[0])[1]


def dim_kind(shape, dim, axes):
    axis = best_axis_for_length(axes, shape[dim], ("energy", "angle", "momentum", "temperature", "axis"))
    return axis["kind"] if axis else ""


def select_dims(shape, axes, args):
    ndim = len(shape)
    if args.x_dim is not None or args.y_dim is not None:
        if args.x_dim is None or args.y_dim is None:
            raise SystemExit("--x-dim and --y-dim must be used together.")
        if not (0 <= args.x_dim < ndim and 0 <= args.y_dim < ndim and args.x_dim != args.y_dim):
            raise SystemExit("Invalid --x-dim/--y-dim values for the selected dataset.")
        return args.x_dim, args.y_dim

    if ndim == 2:
        pair = (0, 1)
    else:
        candidates = []
        for a in range(ndim):
            for b in range(a + 1, ndim):
                area = max(1, int(shape[a]) * int(shape[b]))
                kinds = {dim_kind(shape, a, axes), dim_kind(shape, b, axes)}
                score = math.log10(area)
                if "energy" in kinds:
                    score += 20
                if "angle" in kinds or "momentum" in kinds:
                    score += 16
                if min(shape[a], shape[b]) >= 16:
                    score += 6
                candidates.append((score, (a, b)))
        pair = max(candidates, key=lambda item: item[0])[1]

    kinds = {dim: dim_kind(shape, dim, axes) for dim in pair}
    if args.energy_axis == "x":
        energy_dims = [dim for dim in pair if kinds[dim] == "energy"]
        if energy_dims:
            x_dim = energy_dims[0]
            y_dim = pair[0] if pair[1] == x_dim else pair[1]
            return x_dim, y_dim
    if args.energy_axis == "y":
        energy_dims = [dim for dim in pair if kinds[dim] == "energy"]
        if energy_dims:
            y_dim = energy_dims[0]
            x_dim = pair[0] if pair[1] == y_dim else pair[1]
            return x_dim, y_dim
    return pair[1], pair[0]


def extract_slice(ds, x_dim, y_dim):
    selector = []
    fixed = {}
    for dim, length in enumerate(ds.shape):
        if dim in {x_dim, y_dim}:
            selector.append(slice(None))
        else:
            index = int(length // 2)
            selector.append(index)
            fixed[f"dim_{dim}"] = index
    raw = np.asarray(ds[tuple(selector)])
    raw, swapped = maybe_byteswap_numeric_array(raw)
    arr = np.asarray(raw, dtype=np.float64)
    arr = np.squeeze(arr)
    if arr.ndim != 2:
        raise SystemExit(f"Selected slice is not 2D after slicing; got shape {arr.shape}.")
    result_dims = [dim for dim in range(ds.ndim) if dim in {x_dim, y_dim}]
    if result_dims == [x_dim, y_dim]:
        arr = arr.T
    if swapped:
        fixed["byte_order"] = "auto-byteswapped"
    return arr, fixed


def smooth_matrix(values, passes=1):
    out = values
    for _ in range(max(0, int(passes))):
        padded = np.pad(out, 1, mode="edge")
        out = (
            padded[:-2, :-2] + 2 * padded[:-2, 1:-1] + padded[:-2, 2:] +
            2 * padded[1:-1, :-2] + 4 * padded[1:-1, 1:-1] + 2 * padded[1:-1, 2:] +
            padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        ) / 16.0
    return out


def normalize_intensity(arr, gamma=0.72, smooth=1):
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        raise SystemExit("Selected data slice contains no finite values.")
    low, high = np.nanpercentile(finite, [1.0, 99.6])
    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        low = float(np.nanmin(finite))
        high = float(np.nanmax(finite))
    if high <= low:
        high = low + 1.0
    clean = np.nan_to_num(arr, nan=low, posinf=high, neginf=low)
    norm = np.clip((clean - low) / (high - low), 0.0, 1.0)
    if smooth:
        norm = smooth_matrix(norm, smooth)
    if gamma and gamma != 1:
        norm = np.power(np.clip(norm, 0, 1), float(gamma))
    return norm, float(low), float(high)


def hot_rgb(norm):
    value = np.clip(norm, 0.0, 1.0)
    r = np.clip(3.1 * value, 0, 1)
    g = np.clip(3.1 * value - 0.95, 0, 1)
    b = np.clip(3.4 * value - 2.25, 0, 1)
    rgb = np.dstack([r, g, b])
    return (rgb * 255).astype(np.uint8)


def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def fmt_tick(value):
    if value is None or not np.isfinite(value):
        return ""
    abs_value = abs(value)
    if abs_value >= 1000:
        return f"{value:.0f}"
    if abs_value >= 100:
        return f"{value:.1f}"
    if abs_value >= 10:
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return f"{value:.3g}"


def axis_value(axis_range, index, count):
    if not axis_range or count <= 1:
        return float(index)
    start, end = axis_range
    return float(start) + (float(end) - float(start)) * index / max(1, count - 1)


def is_energy_label(label):
    text = str(label or "").lower()
    return "energy" in text or "ev" in text or "e_v" in text


def should_flip_y(info):
    y_range = info.get("y_range")
    if not is_energy_label(info.get("y_label")) or not y_range:
        return False
    try:
        return float(y_range[1]) > float(y_range[0])
    except Exception:
        return False


def display_axis_value(axis_range, display_index, count, flip_y=False):
    source_index = max(0, min(max(0, count - 1), int(round(display_index))))
    if flip_y:
        source_index = count - 1 - source_index
    return axis_value(axis_range, source_index, count)


def hdf5_energy_axis_display_value(axis_range, display_index, count):
    if not axis_range or count <= 1:
        return float(display_index)
    start, end = axis_range
    high = max(float(start), float(end))
    low = min(float(start), float(end))
    return high - (high - low) * display_index / max(1, count - 1)


def normalized_profile(values):
    values = np.asarray(values, dtype=float)
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros_like(values)
    low = float(np.nanmin(finite))
    high = float(np.nanmax(finite))
    if high <= low:
        return np.zeros_like(values)
    return np.clip((np.nan_to_num(values, nan=low) - low) / (high - low), 0, 1)


def draw_profile(draw, points, color, width=2):
    if len(points) >= 2:
        draw.line(points, fill=color, width=width, joint="curve")


def draw_ticks(draw, box, x_range, y_range, x_count, y_count, fonts, flip_y=False, energy_y=False):
    x0, y0, x1, y1 = box
    black = (30, 30, 30)
    gray = (170, 170, 170)
    draw.rectangle(box, outline=black, width=2)
    for tick in range(6):
        t = tick / 5
        x = int(x0 + t * (x1 - x0))
        y = int(y1 - t * (y1 - y0))
        draw.line([(x, y1), (x, y1 + 8)], fill=black, width=1)
        draw.line([(x, y0), (x, y0 - 8)], fill=black, width=1)
        draw.line([(x, y0), (x, y1)], fill=gray, width=1)
        x_text = fmt_tick(axis_value(x_range, round(t * (x_count - 1)), x_count))
        draw.text((x - 14, y1 + 12), x_text, fill=black, font=fonts["small"])
        draw.text((x - 14, y0 - 28), x_text, fill=black, font=fonts["small"])
        draw.line([(x0 - 8, y), (x0, y)], fill=black, width=1)
        draw.line([(x1, y), (x1 + 8, y)], fill=black, width=1)
        draw.line([(x0, y), (x1, y)], fill=gray, width=1)
        display_index = round((1 - t) * (y_count - 1))
        y_value = (
            hdf5_energy_axis_display_value(y_range, display_index, y_count)
            if energy_y
            else display_axis_value(y_range, display_index, y_count, flip_y)
        )
        y_text = fmt_tick(y_value)
        draw.text((x0 - 54, y - 8), y_text, fill=black, font=fonts["small"])
        draw.text((x1 + 12, y - 8), y_text, fill=black, font=fonts["small"])


def render_figure(norm, info, args):
    width = int(args.max_width)
    height = int(args.max_height)
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    fonts = {
        "title": load_font(24, True),
        "label": load_font(16, True),
        "small": load_font(13, False),
        "tiny": load_font(11, False),
    }

    left = 155
    top_profile_top = 72
    top_profile_h = 142
    plot_top = 248
    right_profile_w = 190
    gutter = 42
    bottom = height - 74
    plot_right = width - right_profile_w - gutter - 36
    plot_box = (left, plot_top, plot_right, bottom)
    plot_w = plot_box[2] - plot_box[0]
    plot_h = plot_box[3] - plot_box[1]

    draw.text((left, 24), info["name"], fill=(20, 20, 20), font=fonts["title"])
    draw.text((left, 52), os.path.basename(info["source_file"]), fill=(82, 82, 82), font=fonts["small"])

    flip_y = should_flip_y(info)
    plot_norm = norm[::-1, :] if flip_y else norm
    resampling = getattr(getattr(Image, "Resampling", Image), "BICUBIC", Image.BICUBIC)
    heat = Image.fromarray(hot_rgb(plot_norm), "RGB").resize((plot_w, plot_h), resampling)
    image.paste(heat, (plot_box[0], plot_box[1]))

    draw_ticks(
        draw,
        plot_box,
        info["x_range"],
        info["y_range"],
        plot_norm.shape[1],
        plot_norm.shape[0],
        fonts,
        flip_y,
        is_energy_label(info.get("y_label")),
    )

    cx = int(plot_box[0] + plot_w * 0.5)
    cy = int(plot_box[1] + plot_h * 0.5)
    cyan = (37, 214, 220)
    draw.line([(cx, plot_box[1]), (cx, plot_box[3])], fill=cyan, width=2)
    draw.line([(plot_box[0], cy), (plot_box[2], cy)], fill=cyan, width=2)

    x_profile = normalized_profile(np.nanmean(plot_norm, axis=0))
    y_profile = normalized_profile(np.nanmean(plot_norm, axis=1))
    top_box = (plot_box[0], top_profile_top, plot_box[2], top_profile_top + top_profile_h)
    right_box = (plot_box[2] + gutter, plot_box[1], plot_box[2] + gutter + right_profile_w, plot_box[3])

    draw.rectangle(top_box, outline=(40, 40, 40), width=2)
    draw.rectangle(right_box, outline=(40, 40, 40), width=2)
    x_points = []
    for idx, value in enumerate(x_profile):
        x = top_box[0] + idx * (top_box[2] - top_box[0]) / max(1, len(x_profile) - 1)
        y = top_box[3] - value * (top_box[3] - top_box[1] - 16) - 8
        x_points.append((x, y))
    draw_profile(draw, x_points, (218, 56, 75), 2)
    y_points = []
    for idx, value in enumerate(y_profile):
        y = right_box[1] + idx * (right_box[3] - right_box[1]) / max(1, len(y_profile) - 1)
        x = right_box[0] + value * (right_box[2] - right_box[0] - 18) + 9
        y_points.append((x, y))
    draw_profile(draw, y_points, (218, 56, 75), 2)

    draw.text((plot_box[0] + plot_w * 0.42, plot_box[3] + 42), info["x_label"], fill=(45, 45, 45), font=fonts["label"])
    draw.text((plot_box[0] - 78, plot_box[1] + plot_h * 0.48), info["y_label"], fill=(45, 45, 45), font=fonts["label"])
    draw.text((right_box[0] + 18, right_box[1] - 28), "Line profile", fill=(85, 85, 85), font=fonts["small"])

    if info["fixed"]:
        fixed_text = ", ".join(f"{key}={value}" for key, value in info["fixed"].items())
        draw.text((right_box[0], 28), f"slice: {fixed_text}", fill=(82, 82, 82), font=fonts["small"])

    return image


def matrix_u8_payload(norm):
    matrix = np.clip(np.nan_to_num(norm, nan=0.0, posinf=1.0, neginf=0.0), 0.0, 1.0)
    matrix_u8 = np.round(matrix * 255.0).astype(np.uint8)
    return {
        "display_matrix_shape": [int(matrix_u8.shape[0]), int(matrix_u8.shape[1])],
        "display_matrix_u8": base64.b64encode(matrix_u8.tobytes(order="C")).decode("ascii"),
        "display_matrix_order": "row-major-source-y",
    }


def package_preview(h5_path, info, norm, image, low, high, args):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    png_bytes = buffer.getvalue()
    if args.png:
        image.save(args.png, format="PNG", optimize=True)
    package = {
        "kind": "arpes-hdf5-preview-v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_file": os.path.basename(h5_path),
        "dataset": info["path"],
        "name": info["name"],
        "shape": [int(v) for v in info["shape"]],
        "dtype": info["dtype"],
        "x_label": info["x_label"],
        "y_label": info["y_label"],
        "x_range": info["x_range"],
        "y_range": info["y_range"],
        "fixed": info["fixed"],
        "intensity_range": [float(low), float(high)],
        "image": "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii"),
    }
    package.update(matrix_u8_payload(norm))
    return package


def write_package(package, out_path):
    text = json.dumps(package, indent=2, ensure_ascii=False)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.write("\n")
    else:
        print(text)


def print_dataset_list(datasets):
    for info in datasets:
        if len(info["shape"]) >= 1:
            print(f"{info['path']}\tshape={info['shape']}\tdtype={info['dtype']}")


def build_preview(args):
    load_dependencies()
    with h5py.File(args.h5_file, "r") as h5:
        datasets = iter_datasets(h5)
        if args.list:
            print_dataset_list(datasets)
            return
        axes = collect_axes(datasets)
        selected = choose_dataset(datasets, args.dataset)
        ds = selected["object"]
        x_dim, y_dim = select_dims(selected["shape"], axes, args)
        arr, fixed = extract_slice(ds, x_dim, y_dim)
        if args.transpose:
            arr = arr.T
            x_dim, y_dim = y_dim, x_dim

        x_axis = best_axis_for_length(axes, selected["shape"][x_dim], ("energy", "momentum", "angle", "axis"))
        y_axis = best_axis_for_length(axes, selected["shape"][y_dim], ("angle", "momentum", "energy", "axis"))
        x_label = args.x_label or (x_axis["label"] if x_axis else f"dim {x_dim}")
        y_label = args.y_label or (y_axis["label"] if y_axis else f"dim {y_dim}")
        x_range = x_axis["range"] if x_axis and x_axis["range"] else [0.0, float(arr.shape[1] - 1)]
        y_range = y_axis["range"] if y_axis and y_axis["range"] else [0.0, float(arr.shape[0] - 1)]

        norm, low, high = normalize_intensity(arr, gamma=args.gamma, smooth=args.smooth)
        render_info = {
            "source_file": args.h5_file,
            "path": selected["path"],
            "name": args.title or os.path.basename(selected["path"]) or "HDF5 preview",
            "shape": selected["shape"],
            "dtype": selected["dtype"],
            "x_label": x_label,
            "y_label": y_label,
            "x_range": x_range,
            "y_range": y_range,
            "fixed": fixed,
        }
        image = render_figure(norm, render_info, args)
        package = package_preview(args.h5_file, render_info, norm, image, low, high, args)
        write_package(package, args.out)


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Render an ARPES HDF5 preview package for the website.")
    parser.add_argument("h5_file", help="Input .h5/.hdf5 file")
    parser.add_argument("--dataset", help="Dataset path to render, for example /root/MS3C00013")
    parser.add_argument("--list", action="store_true", help="List datasets and exit")
    parser.add_argument("--out", help="Write JSON preview package to this file")
    parser.add_argument("--png", help="Also write the rendered preview PNG")
    parser.add_argument("--title", help="Title shown above the preview")
    parser.add_argument("--x-dim", type=int, help="Dataset dimension to use as horizontal axis")
    parser.add_argument("--y-dim", type=int, help="Dataset dimension to use as vertical axis")
    parser.add_argument("--x-label", help="Override horizontal axis label")
    parser.add_argument("--y-label", help="Override vertical axis label")
    parser.add_argument("--energy-axis", choices=["x", "y", "auto"], default="y", help="Where to place an energy/eV axis when one is detected")
    parser.add_argument("--transpose", action="store_true", help="Transpose the selected 2D slice")
    parser.add_argument("--gamma", type=float, default=0.72, help="Display gamma for contrast")
    parser.add_argument("--smooth", type=int, default=1, help="Small smoothing passes before rendering")
    parser.add_argument("--max-width", type=int, default=1100, help="Output image width")
    parser.add_argument("--max-height", type=int, default=760, help="Output image height")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    build_preview(args)


if __name__ == "__main__":
    main()
