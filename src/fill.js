/* Fills the original FNA Intake PDF with app values using pdf-lib.
   Values keep the raw number (so Acrobat's own scripts still work); the printed look uses
   the same 1,234 format the PDF uses. Long answers wrap across the form's lines. */
(function (root) {
  async function fillPdf(PDFLib, bytes, spec) {
    const { PDFDocument, StandardFonts, PDFName, PDFNumber, PDFHexString } = PDFLib;
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // the build stitches page 5 on with pypdf, which writes "/Helv" as "\057Helv";
    // pdf-lib reads that string raw, so decode the escapes back before touching any box
    const unesc = (s) => (s && s.includes('\\') ? s.replace(/\\([0-7]{1,3})/g, (m, o) => String.fromCharCode(parseInt(o, 8))) : s);
    for (const fld of form.getFields()) {
      const af = fld.acroField;
      if (typeof af.getDefaultAppearance !== 'function') continue;
      const da = af.getDefaultAppearance();
      if (da && unesc(da) !== da) af.setDefaultAppearance(unesc(da));
      for (const w of af.getWidgets()) { const wd = w.getDefaultAppearance && w.getDefaultAppearance(); if (wd && unesc(wd) !== wd) w.setDefaultAppearance(unesc(wd)); }
    }

    const info = (name) => {
      const f = form.getTextField(name);
      const w = f.acroField.getWidgets()[0];
      const r = w.getRectangle();
      const da = f.acroField.getDefaultAppearance() || '';
      const m = da.match(/([\d.]+)\s+Tf/);
      const da0 = m ? +m[1] : 0;
      // auto-size boxes get one steady size so the page looks hand-even
      const size = da0 || Math.max(6, Math.min(9.5, r.height * 0.72));
      return { f, w, width: r.width, height: r.height, size, auto: !da0 };
    };

    // keep the form's own underline (border style /U) under filled answers
    const L = PDFLib;
    const underlined = (field, widget, fnt) => {
      const ops = L.defaultTextFieldAppearanceProvider(field, widget, fnt);
      const bs = widget.dict.lookup(PDFName.of('BS'));
      const style = bs && bs.lookup(PDFName.of('S'));
      if (!style || style.toString() !== '/U') return ops;
      const wv = bs.lookup(PDFName.of('W'));
      const lw = wv ? wv.asNumber() : 1;
      if (!lw) return ops;
      const r = widget.getRectangle();
      return [...ops, L.pushGraphicsState(), L.setStrokingGrayscaleColor(0), L.setLineWidth(lw),
        L.moveTo(0, lw / 2), L.lineTo(r.width, lw / 2), L.stroke(), L.popGraphicsState()];
    };

    const setText = (name, value, display) => {
      let i;
      try { i = info(name); } catch (e) { console.warn('missing field', name); return; }
      const f = i.f;
      const ml = f.getMaxLength();
      if (ml && display.length > ml) display = display.slice(0, ml);
      if (ml && value.length > ml) value = value.slice(0, ml);
      const avail = i.width - 4;
      let s = i.size;
      const start = s;
      while (s > 5 && font.widthOfTextAtSize(display, s) > avail) s -= 0.25;
      if (s !== start || i.auto) f.setFontSize(s);
      f.setText(display);
      // the form prints its own lines, so draw the text with no box around it,
      // then put the border style back so Acrobat still behaves the same when edited
      const widgets = f.acroField.getWidgets();
      const saved = widgets.map((w) => w.dict.get(PDFName.of('MK')));
      widgets.forEach((w) => w.dict.delete(PDFName.of('MK')));
      f.updateAppearances(font, underlined);
      widgets.forEach((w, k) => { if (saved[k]) w.dict.set(PDFName.of('MK'), saved[k]); });
      if (value !== display) f.acroField.setValue(PDFHexString.fromText(value));
    };

    // wrap long answers across their lines
    const wrapGroup = (names, text) => {
      const lines = names.map((n) => { const i = info(n); return { n, width: i.width - 4, size: i.size }; });
      const paras = String(text).replace(/\r/g, '').split('\n');
      const words = [];
      paras.forEach((p, pi) => { p.split(/\s+/).filter(Boolean).forEach((w) => words.push(w)); if (pi < paras.length - 1) words.push('\n'); });
      const out = lines.map(() => '');
      let li = 0;
      for (const w of words) {
        if (li >= lines.length) break;
        if (w === '\n') { if (out[li]) li++; continue; }
        const trial = out[li] ? out[li] + ' ' + w : w;
        if (font.widthOfTextAtSize(trial, lines[li].size) <= lines[li].width || !out[li]) { out[li] = trial; continue; }
        li++;
        if (li >= lines.length) { li = lines.length - 1; out[li] += ' ' + w; } else out[li] = w;
      }
      // anything left over goes on the last line (it shrinks to fit)
      const placed = out.join(' ').split(/\s+/).filter(Boolean).length;
      const all = words.filter((w) => w !== '\n');
      if (placed < all.length) out[lines.length - 1] += ' ' + all.slice(placed).join(' ');
      out.forEach((t, k) => { if (t.trim()) setText(lines[k].n, t.trim(), t.trim()); });
    };

    for (const g of spec.groups || []) wrapGroup(g.names, g.text);
    for (const [name, v] of Object.entries(spec.texts || {})) setText(name, v.value, v.display);
    for (const name of spec.checks || []) {
      try { form.getCheckBox(name).check(); } catch (e) { console.warn('missing box', name); }
    }

    // make every widget printable (the income boxes were screen-only in the original)
    // and reveal the "So at __%" blank that matches the savings choice
    const showSet = new Set(spec.show || []);
    for (const field of form.getFields()) {
      for (const w of field.acroField.getWidgets()) {
        const flag = w.dict.get(PDFName.of('F'));
        const fv = flag ? flag.asNumber() : 0;
        if (showSet.has(field.getName())) w.dict.set(PDFName.of('F'), PDFNumber.of(4));
        else if (!(fv & 2) && !(fv & 4)) w.dict.set(PDFName.of('F'), PDFNumber.of(fv | 4));
      }
    }
    return doc.save({ updateFieldAppearances: false });
  }

  async function readPdf(PDFLib, bytes) {
    const doc = await PDFLib.PDFDocument.load(bytes);
    const vals = {};
    for (const f of doc.getForm().getFields()) {
      const n = f.getName();
      const t = f.constructor.name;
      try {
        if (f instanceof PDFLib.PDFCheckBox) vals[n] = f.isChecked();
        else if (f instanceof PDFLib.PDFTextField) vals[n] = f.getText() || '';
      } catch (e) { /* ignore odd fields */ }
    }
    return vals;
  }

  root.FNAPdf = { fillPdf, readPdf };
})(typeof window !== 'undefined' ? window : globalThis);
