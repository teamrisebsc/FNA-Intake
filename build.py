#!/usr/bin/env python3
"""Build the single-file FNA Intake app.

    python3 build.py

Stitches src/*.js, src/app.css, pdf-lib, the Team RISE logo and the original
intake PDF into fna-intake/index.html (one file, works offline, open in Chrome).
To swap in a newer version of the paper form, replace src/intake_template.pdf
(same field names) and rebuild.
"""
import base64
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
PAUL = ROOT.parent
PDFLIB = SRC / "vendor" / "pdf-lib.min.js"


def ensure_pdflib():
    if PDFLIB.exists():
        return
    PDFLIB.parent.mkdir(parents=True, exist_ok=True)
    url = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
    subprocess.run(["curl", "-fsSL", url, "-o", str(PDFLIB)], check=True)


def template_bytes():
    """The original 4-page form plus page 5 (Personal Introductions), fields intact."""
    import io
    from pypdf import PdfReader, PdfWriter
    page5 = SRC / "intake_page5.pdf"
    if not page5.exists():
        subprocess.run([sys.executable, str(SRC / "make_page5.py")], check=True)
    w = PdfWriter(clone_from=str(SRC / "intake_template.pdf"))
    w.append(PdfReader(str(page5)))
    names = set(w.get_fields() or {})
    missing = [n for n in ("Intro 1 Name", "Intro 10 Event", "Driven Person Why", "future") if n not in names]
    if missing:
        sys.exit(f"page 5 merge lost fields: {missing}")
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def main():
    ensure_pdflib()
    html = (SRC / "index.src.html").read_text()
    logo = (SRC / "rise_logo.svg").read_text().strip()
    logo = re.sub(r"<\?xml[^>]*>", "", logo)
    parts = {
        "CSS": (SRC / "app.css").read_text(),
        "LOGO": logo,
        "ICON": base64.b64encode(logo.encode()).decode(),
        "PDFLIB": PDFLIB.read_text(),
        "PDF": base64.b64encode(template_bytes()).decode(),
        "SCHEMA": (SRC / "schema.js").read_text(),
        "FILL": (SRC / "fill.js").read_text(),
        "CAPTURE": (SRC / "capture.js").read_text(),
        "APP": (SRC / "app.js").read_text(),
    }
    for k, v in parts.items():
        token = f"/*@@{k}@@*/"
        if token not in html:
            sys.exit(f"missing {token}")
        html = html.replace(token, v.replace("</script>", "<\\/script>"))
    out = ROOT / "index.html"
    out.write_text(html)
    for bad in ("—", "–"):
        if bad in html.replace(parts["PDFLIB"], ""):
            print("warning: a dash slipped into the page copy")
    print(f"built {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
