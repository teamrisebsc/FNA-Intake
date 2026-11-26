# FNA Intake (digital)

The October 2026 FNA Intake Sheet as a Team RISE web app. One file: `index.html`. Works offline. Open it in Chrome.

## What it does
- Every box on the 4-page PDF, in conversation order, with the same scripts.
- Prospect and spouse side by side for Retirement, Income and Protection. Whoever you click on lights up as "talking."
- Quick capture bar at the bottom. Type what you hear ("she takes home 2,100 twice a month", "car loan 18k at 6.9%, 420 a month") and it drops into the right box. It shows where it will go before you press Enter. Separate facts with `;`. Anything it cannot place goes to Notes, so nothing is lost. Undo on every capture.
- All the PDF's math, live: paycheck to monthly, total net income, household net, DIME for each person, 10%, discretionary, savings goal. Ages come from birthdays. Education fills at $100K per kid unless you type a number.
- Extras on screen only: protection gap, total debt, monthly payments, saved for retirement.
- Download PDF fills the ORIGINAL form (same fields, same scripts). Acrobat math still works on it, and "run fna" can read it.
- Open PDF loads a filled intake PDF back into the app.
- Clients list. Everything saves in this browser on this device only.

## Keys
`/` type what you hear. `Option+S` switch who is talking. `Cmd+K` find any box. `Enter` in a box jumps to the next box.

## Change it
Edit files in `src/`, then `python3 build.py`. New paper form with the same field names: replace `src/intake_template.pdf` and rebuild.

| File | Job |
|---|---|
| `src/schema.js` | Field map (state keys are the PDF field names) and the math |
| `src/capture.js` | The type-what-you-hear parser |
| `src/fill.js` | Fills and reads the PDF (pdf-lib) |
| `src/app.js`, `src/app.css`, `src/index.src.html` | The screen |
