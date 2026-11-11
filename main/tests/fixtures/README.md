# Test Fixtures

Test face media (photographs, videos, reference frames) is **not** committed to this repository for privacy and data-protection reasons.

## Guidelines for Test Media
1. Anyone running the end-to-end and calibration evaluation suites must supply their own consented face media.
2. Media files placed in this directory or subdirectories are git-ignored by rule in `.gitignore`.
3. Do not commit actual faces, private biometric templates, or credential data to version control.
4. For synthetic unit tests (such as testing `NO_FACE` or corrupted media paths), automated test fixtures generate synthetic plain canvases or corrupted byte sequences programmatically in memory or temporary storage.

