from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("XRD_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_POINTS = 250_000
ALLOWED_EXTENSIONS = {".xy", ".txt", ".csv", ".dat"}


def ensure_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

