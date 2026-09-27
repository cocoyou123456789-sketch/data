import numpy as np
import pytest
from app.xrd import broaden, parse_pattern, preprocess, score


def test_parse_sort_and_qc():
    raw = b"# demo\n20, 2\n10, 1\n30, 5\n40, 1\n50, 3\n60, 1\n70, 2\n80, 1\n90, 1\n100, 0\n"
    x, y, qc = parse_pattern(raw)
    assert np.all(np.diff(x) > 0)
    assert qc["points"] == 10
    assert qc["two_theta_min"] == 10


def test_broaden_and_score_identical():
    grid = np.linspace(10, 80, 1000)
    theory = broaden([20, 40, 60], [100, 60, 80], grid, .2)
    metrics = score(grid, theory, theory, [20, 40, 60], .2)
    assert metrics["cosine_similarity"] == pytest.approx(1)
    assert metrics["peak_coverage"] == pytest.approx(1)
    assert metrics["match_score"] == pytest.approx(1)


def test_preprocess_nonnegative_normalized():
    x = np.arange(100.)
    y = 0.02*x + np.exp(-((x-50)/3)**2)*10
    result = preprocess(x, y)
    assert result.min() >= 0
    assert result.max() == pytest.approx(1)

