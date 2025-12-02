import sys
import re
from pathlib import Path
from xml.etree import ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
NS = {"svg": SVG_NS}
ET.register_namespace("", SVG_NS)  # keep SVG header clean


def get_group_text(g):
    """
    Concatenate all <text> content under a group.
    This is what shows up as the label on your diagram.
    """
    texts = []
    for t in g.findall(".//svg:text", NS):
        s = "".join(t.itertext()).strip()
        if s:
            texts.append(s)
    full = " ".join(texts).strip()
    return full


def slugify(label):
    """
    Turn a label like "5α-reductase (enzyme)" into a safe id like "five_alpha_reductase".
    """
    if not label:
        return ""

    # Normalize common symbols / Greek letters
    replacements = {
        "α": "alpha",
        "ɑ": "alpha",
        "β": "beta",
        "γ": "gamma",
        "Δ": "delta",
        "δ": "delta",
        "µ": "mu",
        "μ": "mu",
        "→": "to",
        "’": "",
        "“": "",
        "”": "",
        "…": "",
    }
    for old, new in replacements.items():
        label = label.replace(old, new)

    # Use just the first main phrase before :, ;, (), etc.
    label = re.split(r"[\n\r:;()]", label)[0]

    # Lowercase, strip
    label = label.strip().lower()

    # Replace non-alphanumeric with underscores
    label = re.sub(r"[^a-z0-9]+", "_", label)
    label = re.sub(r"_+", "_", label).strip("_")

    # Truncate long names a bit (just in case)
    if len(label) > 40:
        label = label[:40].rstrip("_")

    return label


def main(input_path, output_path=None):
    svg_path = Path(input_path)
    if not svg_path.exists():
        print(f"Input file not found: {svg_path}")
        sys.exit(1)

    tree = ET.parse(svg_path)
    root = tree.getroot()

    used_ids = set()

    def get_unique_id(base):
        """
        Ensure the id is unique by adding suffixes if needed.
        """
        if not base:
            base = "node"
        candidate = base
        i = 2
        while candidate in used_ids:
            candidate = f"{base}_{i}"
            i += 1
        used_ids.add(candidate)
        return candidate

    # Collect any existing ids so we don't collide with them
    for elem in root.findall(".//*[@id]"):
        used_ids.add(elem.attrib["id"])

    # Go through all draw.io cells (<g data-cell-id="...">)
    for g in root.findall(".//svg:g", NS):
        cell_id = g.attrib.get("data-cell-id")
        if not cell_id:
            continue

        # If there is already a reasonable id, leave it
        existing_id = g.attrib.get("id")
        if existing_id:
            used_ids.add(existing_id)
            continue

        label = get_group_text(g)
        base = slugify(label)

        # If there is no text at all, fall back to cell_<data-cell-id>
        if not base:
            base = f"cell_{cell_id}"

        new_id = get_unique_id(base)
        g.set("id", new_id)

    # Where to write the result
    if output_path is None:
        output_path = svg_path.with_name(svg_path.stem + ".svg")
    else:
        output_path = Path(output_path)

    tree.write(output_path, encoding="utf-8", xml_declaration=True)
    print(f"Written cleaned SVG to: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rename_svg_ids_by_text.py input.svg [output.svg]")
        sys.exit(1)

    inp = sys.argv[1]
    outp = sys.argv[2] if len(sys.argv) > 2 else None
    main(inp, outp)
