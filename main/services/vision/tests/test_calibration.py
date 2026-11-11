import pytest
from app.core.calibration import CalibrationConfig


def test_calibration_anchor_equality():
    cal = CalibrationConfig()
    assert cal.status == "PROVISIONAL"
    assert cal.floor_raw == 0.20
    assert cal.anchor_raw == 0.45
    assert cal.ceiling_raw == 0.70

    pct = cal.raw_to_pct(0.45)
    assert pct == 75.0


def test_calibration_clamping_and_monotonicity():
    cal = CalibrationConfig()

    # Below or at floor
    assert cal.raw_to_pct(-1.0) == 0.0
    assert cal.raw_to_pct(0.0) == 0.0
    assert cal.raw_to_pct(0.20) == 0.0

    # Above or at ceiling
    assert cal.raw_to_pct(0.70) == 100.0
    assert cal.raw_to_pct(0.85) == 100.0
    assert cal.raw_to_pct(1.0) == 100.0

    # Monotonicity check
    prev = 0.0
    for raw_i in range(-100, 101):
        raw = raw_i / 100.0
        val = cal.raw_to_pct(raw)
        assert 0.0 <= val <= 100.0
        assert val >= prev, f"Monotonicity violation at raw={raw}: {val} < {prev}"
        prev = val


def test_calibration_midpoint_interpolation():
    cal = CalibrationConfig()
    # Midpoint between floor (0.20) and anchor (0.45) is 0.325 -> exactly 37.5%
    mid_low = cal.raw_to_pct(0.325)
    assert abs(mid_low - 37.5) < 1e-5

    # Midpoint between anchor (0.45) and ceiling (0.70) is 0.575 -> exactly 87.5%
    mid_high = cal.raw_to_pct(0.575)
    assert abs(mid_high - 87.5) < 1e-5


def test_calibration_invalid_anchors_raise_error(tmp_path):
    invalid_file = tmp_path / "invalid_calibration.json"
    invalid_file.write_text('{"floor_raw": 0.50, "anchor_raw": 0.40, "ceiling_raw": 0.70}')
    with pytest.raises(ValueError, match="Invalid calibration anchors"):
        CalibrationConfig(path=invalid_file)

