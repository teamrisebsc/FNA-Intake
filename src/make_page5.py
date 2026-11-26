#!/usr/bin/env python3
"""Draws page 5 of the FNA Intake PDF: Personal Introductions (Bill Cates, The Language of Referrals).

    python3 fna-intake/src/make_page5.py

Writes src/intake_page5.pdf. build.py stitches it onto the end of the original 4-page form,
so the Oct 2026 pages never change. Field names match the app state keys:
Intro 1..10 Name / How Known / Why / Event, and Driven Person Name / How Known / Why.
"""
import pathlib
from reportlab.lib.colors import Color, black
from reportlab.pdfgen import canvas

OUT = pathlib.Path(__file__).resolve().parent / "intake_page5.pdf"
W, H = 612, 792
L, R = 36, 576
CLEAR = Color(1, 1, 1, alpha=0)
GREY = Color(0.35, 0.35, 0.35)
TEAL = Color(0.05, 0.55, 0.6)
STAMP = "11/23/2026"


def wrap(c, text, font, size, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def para(c, y, text, font="Helvetica-BoldOblique", size=9, lead=11.5, x=L + 6, width=R - L - 12, color=black):
    c.setFont(font, size)
    c.setFillColor(color)
    for line in wrap(c, text, font, size, width):
        c.drawString(x, y, line)
        y -= lead
    c.setFillColor(black)
    return y


def header(c, y, title):
    c.setFont("Helvetica-Bold", 11)
    c.drawString(L, y, title)
    x = L + c.stringWidth(title, "Helvetica-Bold", 11) + 2
    c.setLineWidth(0.8)
    c.line(x, y - 1, R, y - 1)


def field(c, name, x, y, w, size=9):
    c.setLineWidth(0.6)
    c.line(x, y, x + w, y)
    c.acroForm.textfield(name=name, tooltip=name, x=x, y=y + 0.5, width=w, height=13,
                         fontName="Helvetica", fontSize=size, borderWidth=0,
                         borderColor=CLEAR, fillColor=CLEAR, textColor=black, forceBorder=False)


def main():
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("FNA Intake page 5: Personal Introductions")

    y = 752
    header(c, y, "PERSONAL INTRODUCTIONS")
    y -= 15
    y = para(c, y, "Read this out loud, then ask.", font="Helvetica", size=7.5, color=GREY, x=L)
    y -= 2
    y = para(c, y, "“Before we wrap up, one thing about how we work. You’ll never get a bill from us for any of this. "
                   "The institutions we partner with compensate us, so your analysis is free. What keeps our doors open is "
                   "personal introductions. Most families we help introduce us to 10 to 15 people they love. We intend to earn that.”")
    y -= 5
    y = para(c, y, "• “As we went through this today, who came to mind who should have this same conversation?”", x=L)
    y = para(c, y, "(Write down anyone they mention. No phone numbers yet. No push. You come back to these names at Step 5.)",
             font="Helvetica-Oblique", size=7.5, color=GREY, x=L + 10)
    y -= 4
    y = para(c, y, "• “I have a few ideas I’d like to run by you. When people have money moving in their life, that’s usually "
                   "when they want someone in their corner. Is it okay if I run a few by you?”", x=L, width=R - L - 6)
    y -= 3
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(GREY)
    c.drawString(L + 10, y, "Money moving. Open with the one they were in: “The first one is actually yours.”")
    c.setFillColor(black)
    y -= 12
    events = [
        ("Changed jobs", "“Who do you know who just changed jobs and left a 401(k) behind?”"),
        ("Retiring", "“Who do you know who’s retiring in the next few years?”"),
        ("Bonus or raise", "“Who do you know who just got a big bonus or a raise?”"),
        ("Inheritance", "“Who do you know who has inherited money, or likely will in the next few years?”"),
        ("Starting a business", "“Who do you know who’s starting a business, or thinking about it?”"),
    ]
    for i, (tag, q) in enumerate(events, 1):
        c.setLineWidth(0.6)
        c.rect(L + 12, y - 1, 7, 7)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(L + 24, y, tag.upper())
        c.setFont("Helvetica-BoldOblique", 8.5)
        c.drawString(L + 124, y, q)
        y -= 12.5

    # names table
    y -= 10
    cols = [("Name", L + 14, 128), ("How you know them", L + 150, 118), ("Why they came to mind", L + 276, 168), ("Event", L + 452, 88)]
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GREY)
    for label, x, _ in cols:
        c.drawString(x, y, label)
    c.setFillColor(black)
    y -= 19
    for n in range(1, 11):
        c.setFont("Helvetica", 8)
        c.drawRightString(L + 9, y + 2, str(n))
        for (label, x, w), key in zip(cols, ["Name", "How Known", "Why", "Event"]):
            field(c, f"Intro {n} {key}", x, y, w)
        y -= 20

    y -= 14
    header(c, y, "BUSINESS PARTNER")
    y -= 17
    y = para(c, y, "• “Who do you know who is really good at their job, yet wants more?”", x=L)
    y = para(c, y, "(One name is plenty.)", font="Helvetica-Oblique", size=7.5, color=GREY, x=L + 10)
    y -= 14
    c.setFont("Helvetica", 9)
    c.drawRightString(L + 9, y + 2, "★")
    for (label, x, w), key in zip(cols[:3], ["Name", "How Known", "Why"]):
        field(c, f"Driven Person {key}", x, y, w)
    c.setFont("Helvetica", 7)
    c.setFillColor(GREY)
    for label, x, _ in cols[:3]:
        c.drawString(x, y - 9, label)
    c.setFillColor(black)

    y -= 34
    y = para(c, y, "If they hesitate, ask about it once. If they hesitate a second time, back off with: "
                   "“Understood. Just know I’m never too busy for someone you care about. Fair enough?”",
             font="Helvetica-Oblique", size=7.5, color=GREY, x=L, width=R - L)

    c.setFont("Helvetica", 6.5)
    c.setFillColor(TEAL)
    c.drawString(L, 30, "Introductions page added " + STAMP + "  ·  Bill Cates, The Language of Referrals")
    c.setFillColor(black)
    c.drawRightString(R, 30, STAMP)
    c.showPage()
    c.save()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
