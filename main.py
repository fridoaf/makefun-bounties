#!/usr/bin/env python3
"""Write a one-line joke about working beside AI coding agents."""

import os
from pathlib import Path

JOKE = "I let my agent run the demo; it fixed the bug, fielded the questions, and now the team thinks I'm its intern."

def main() -> None:
    output_dir = Path("/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    entry = output_dir / "entry.txt"
    entry.write_text(JOKE + "\n", encoding="utf-8")
    os.chmod(entry, 0o644)

if __name__ == "__main__":
    main()
