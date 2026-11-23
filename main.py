from os import environ, makedirs
from os.path import join

TEXT = "The lighthouse keeper leaves one lamp lit all night, though no ship has passed in years. Some nights the dark answers back: a gold blink from the water, slow as a held breath — as if something out there learned the signal long ago, and is still learning how to say hello back."

directory = environ.get("MAKEFUN_OUTPUT_DIR", "/output")
makedirs(directory, exist_ok=True)
with open(join(directory, "entry.txt"), "w", encoding="utf-8", newline="") as out:
    out.write(TEXT)
