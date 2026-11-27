/* FNA Report: the case model, the intake-to-case mapping, and the math.
   The math follows the MyWFG FNA screen for screen (Assumptions, Goals, Cash Flow, Debt,
   Protection, Asset Accumulation) and was checked to the penny against a real MyWFG report. */
(function (root) {
  /* ---------- constants (same choices MyWFG offers) ---------- */
  const FREQ = [
    { v: 1, t: 'Once a year' }, { v: 12, t: 'Monthly' }, { v: 24, t: 'Twice a month' },
    { v: 26, t: 'Every 2 weeks' }, { v: 52, t: 'Weekly' },
  ];
  const DEBT_TYPES = ['Student Loan', 'Auto Loan', 'Credit Card', 'Mortgage', 'Personal Loan', 'Other Loan'];
  const POLICY_TYPES = ['Group Term', 'Individual Term', 'UL', 'IUL', 'VUL', 'Whole Life'];
  const PREMIUM_MODES = [
    { v: 'Monthly', per: 1 }, { v: 'Quarterly', per: 3 }, { v: 'Semi-annual', per: 6 },
    { v: 'Annual', per: 12 }, { v: 'Single Pay', per: 0 },
  ];
  const ASSET_TYPES = ['Savings', 'Checking', 'CDs and Treasuries', 'Mutual Funds', 'Stocks and Bonds', 'Traditional IRA',
    'Retirement Plan', 'Annuity', 'Roth IRA', '529 Plan', 'Coverdell ESA', 'Other'];
  const EXPENSES = [
    { k: 'auto', t: 'Auto and transportation' }, { k: 'food', t: 'Food' }, { k: 'health', t: 'Health and medical' },
    { k: 'household', t: 'Household' }, { k: 'housing', t: 'Mortgage or rent' }, { k: 'debt', t: 'Other debt payments' },
    { k: 'other', t: 'Other monthly expenses' }, { k: 'utilities', t: 'Utilities' },
  ];
  // the ten MyWFG goals; "say" is how the report prints it
  const GOALS = [
    { k: 'purchase', t: 'Make a major purchase', say: 'Make a major purchase (car, furniture, boat, family vacation)' },
    { k: 'retire', t: 'Build retirement wealth', say: 'Build retirement wealth' },
    { k: 'home', t: 'Buy a new home', say: 'Buy a new home' },
    { k: 'savings', t: 'Build savings for the unexpected', say: 'Build savings for unexpected expenses (emergency fund)' },
    { k: 'mortgage', t: 'Pay down or pay off the mortgage', say: 'Reduce or pay off the mortgage' },
    { k: 'education', t: 'Education funding', say: 'Education funding' },
    { k: 'income', t: 'Income if disabled or if one of us dies', say: 'Income in case of disability or death' },
    { k: 'parents', t: 'Help support aging parents', say: 'Help support aging parents' },
    { k: 'debts', t: 'Pay off credit cards and debts', say: 'Pay off credit cards and debts' },
    { k: 'business', t: 'Start a business', say: 'Start a business' },
  ];
  // report sections, in print order (MyWFG Print Options); "on" = on by default
  const SECTIONS = [
    { k: 'cover', t: 'Cover', fixed: true }, { k: 'disclosure', t: 'Disclosure', fixed: true }, { k: 'personal', t: 'Your personal information', fixed: true },
    { k: 'goals', t: 'Goals and dreams', on: true }, { k: 'six', t: 'Six steps', on: true },
    { k: 'monthly', t: 'Your monthly cash flow', on: false }, { k: 'cashflow', t: 'Cash flow summary', on: true },
    { k: 'increase', t: 'Ways to increase cash flow', on: false }, { k: 'debt', t: 'Debt management', on: true },
    { k: 'protOverview', t: 'Proper protection overview', on: true }, { k: 'protA', t: 'Proper protection, client A', on: true },
    { k: 'protB', t: 'Proper protection, client B', on: true }, { k: 'assetOverview', t: 'Asset accumulation overview', on: true },
    { k: 'ef', t: 'Emergency fund', on: true }, { k: 'retire', t: 'Retirement need', on: true },
    { k: 'estate', t: 'Estate preservation', on: true }, { k: 'assumptions', t: 'Assumptions', on: true }, { k: 'next', t: 'Next steps', on: true },
  ];

  // MyWFG's own defaults (Modify FNA default settings), with the caps MyWFG enforces
  const DEFAULTS = { rorRet: 4, rorPre: 6, infl: 3, ssInc: 0, efMonths: 3, survYears: 10, taxRate: 22, retAge: 65, life: 85 };
  const CAPS = { rorRet: 10, rorPre: 10, infl: 6, ssInc: 6, efMonths: 24, survYears: 50, taxRate: 75 };

  /* ---------- helpers ---------- */
  const num = (v) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim().toLowerCase().replace(/[$,\s%]/g, '');
    let mult = 1;
    if (/k$/.test(s)) { mult = 1e3; s = s.slice(0, -1); } else if (/m$/.test(s)) { mult = 1e6; s = s.slice(0, -1); }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n * mult;
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const money = (n, cents = true) => {
    const v = cents ? r2(n) : Math.round(n);
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
    return (v < 0 ? '-$' : '$') + s;
  };
  const pct = (n, d = 2) => `${r2(n).toFixed(d)}%`;
  const parseDate = (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s || '').trim());
    if (!m) return null;
    let y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000;
    return { m: +m[1], d: +m[2], y };
  };
  const ageOn = (dob, today) => {
    const b = parseDate(dob); if (!b) return null;
    let a = today.getFullYear() - b.y;
    if (today.getMonth() + 1 < b.m || (today.getMonth() + 1 === b.m && today.getDate() < b.d)) a--;
    return a >= 0 && a < 120 ? a : null;
  };
  const fullName = (p) => [p && p.first, p && p.last].filter(Boolean).join(' ').trim();
  const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const todayStr = (d = new Date()) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  /* ---------- a blank case ---------- */
  function blankCase(settings = {}) {
    const a = Object.assign({}, DEFAULTS, settings.assume || {});
    return {
      id: uid(), created: Date.now(), updated: Date.now(), source: 'hand', desc: '',
      reportDate: todayStr(),
      a: { first: '', last: '', dob: '', phone: '', email: '' },
      married: false, b: { first: '', last: '', dob: '' },
      deps: [],
      assume: { rorRet: a.rorRet, rorPre: a.rorPre, infl: a.infl, ssInc: a.ssInc, efMonths: a.efMonths, survYears: a.survYears },
      goals: Object.fromEntries(GOALS.map((g) => [g.k, { s: false, m: false, l: false }])),
      customGoals: [],
      incomes: [],
      taxRate: a.taxRate, refund: 'No', payTax: 'No',
      expenses: Object.fromEntries(EXPENSES.map((e) => [e.k, { amt: '', disc: false }])),
      debts: [],
      ins: { method: 'dime', incomeMonthly: '', mort1: '', mort2: '', edu: '', incomePct: '', final: '', autoMort: true },
      policies: [],
      assets: [],
      ef: { mode: 'all', amount: '' },
      ret: { ageA: a.retAge, ageB: a.retAge, lifeA: a.life, lifeB: a.life, ss: false, ssAgeA: 65, ssAmtA: '', ssAgeB: 65, ssAmtB: '', pensionA: '', pensionB: '', needMode: 'amount', needPct: '', needAmt: '' },
      will: '', trust: '',
      report: {
        sections: Object.fromEntries(SECTIONS.filter((s) => !s.fixed).map((s) => [s.k, s.on])),
        fullNames: true, presenter: settings.presenter || '',
        actions: { cash: '', debt: '', ef: '', prot: '', asset: '', estate: '' },
      },
      notes: '', review: [],
    };
  }

  /* ---------- intake sheet (PDF field names, see fna-intake/src/schema.js) to case ---------- */
  function fromIntake(st, settings = {}) {
    const F = root.FNA; // intake schema
    const c = blankCase(settings);
    const review = [];
    const sp = F.sp;
    const txt = (k) => String(st[k] == null ? '' : st[k]).trim();
    const splitName = (n) => { const p = n.trim().split(/\s+/); return p.length < 2 ? { first: p[0] || '', last: '' } : { first: p.slice(0, -1).join(' '), last: p[p.length - 1] }; };
    const dobOf = (p) => { const d = txt(p.dob[0]); return parseDate(d) ? d : ''; };

    c.source = 'intake';
    Object.assign(c.a, splitName(txt('PROSPECT')), { dob: dobOf(F.PEOPLE[0]), email: txt('Email') });
    const spouseName = txt('Spouse Name');
    c.married = !!spouseName && st._hasSpouse !== false;
    if (c.married) Object.assign(c.b, splitName(spouseName), { dob: dobOf(F.PEOPLE[1]) });
    F.PEOPLE.slice(2).forEach((p) => { const n = txt(p.name); if (n) c.deps.push(Object.assign(splitName(n), { dob: dobOf(p) })); });
    if (!c.a.dob) review.push('people');
    c.agent = txt('TRAINEE');
    const d = parseDate(txt('DATE')); if (d) c.intakeDate = `${d.m}/${d.d}/${d.y}`;
    c.desc = `${fullName(c.a)}${c.married ? ' and ' + c.b.first : ''} FNA`;

    /* goals: the 1 to 3 year boxes are short term; protection answers are ongoing, so all three columns */
    const g = c.goals;
    if (st['Pay off debt'] === true) g.debts.s = true;
    if (st['Retirement'] === true) g.retire.s = true;
    if (st['Buy Property'] === true) g.home.s = true;
    if (st['Savings'] === true) g.savings.s = true;
    if (st['Support Fam Mem'] === true) c.customGoals.push({ t: 'Support family members', s: true, m: false, l: false });
    if (st['Leaving a Legacy'] === true) c.customGoals.push({ t: 'Leave a legacy', s: true, m: false, l: false });
    const other = txt('Other Goals'); if (other) c.customGoals.push({ t: other, s: true, m: false, l: false });
    const tags = { 'Market loss protection goal': 'Protection', 'Premature fam fin protection goal': 'Long term care', 'LTC Goal': 'Protection from market loss', 'learning passive income': 'Create passive income streams' };
    for (const q of F.PROTECT_Q) if (st[q.chk] === true) c.customGoals.push({ t: tags[q.chk], s: true, m: true, l: true });
    const mid = txt('Any additional goals in the next 3-7 years'); if (mid) c.customGoals.push({ t: mid, s: false, m: true, l: false });
    const lng = txt('How about 7+ years'); if (lng) c.customGoals.push({ t: lng, s: false, m: false, l: true });

    /* income: the intake asks for take-home pay, so the tax rate is 0 (MyWFG would add tax on top of gross) */
    const people = c.married ? ['p', 's'] : ['p'];
    const owner = (w) => (w === 'p' ? 'a' : 'b');
    let anyIncome = false;
    for (const w of people) {
      const g2 = (k) => num(st[sp(k, w)]);
      const rows = [[F.INC.biw, 26], [F.INC.semi, 24], [F.INC.week, 52], [F.INC.month, 12]];
      for (const [k, f] of rows) if (g2(k)) { c.incomes.push({ owner: owner(w), source: 'Take-home pay', amount: g2(k), freq: f }); anyIncome = true; }
      for (const o of F.INC.other) {
        const amt = g2(o.amt); if (amt) { c.incomes.push({ owner: owner(w), source: txt(sp(o.src, w)) || 'Other income', amount: amt, freq: 12 }); anyIncome = true; }
      }
      if (!rows.some(([k]) => g2(k)) && g2(F.INC.net)) { c.incomes.push({ owner: owner(w), source: 'Take-home pay', amount: g2(F.INC.net), freq: 12 }); anyIncome = true; }
    }
    c.taxRate = 0;
    if (!anyIncome) review.push('income');

    /* expenses: the intake has one total */
    const exp = num(st[F.EXP.expenses]);
    if (exp) c.expenses.other.amt = exp; else review.push('expenses');

    /* debts */
    const guess = (t) => {
      const s = t.toLowerCase();
      if (/mort|home|house|heloc/.test(s)) return 'Mortgage';
      if (/card|\bcc\b|visa|amex|discover|capital one|chase|citi|mastercard|bread|synchrony|credit/.test(s)) return 'Credit Card';
      if (/\bcars?\b|auto|truck|vehicle|\bsuv\b/.test(s)) return 'Auto Loan';
      if (/student|school|college|navient|sallie|nelnet|mohela/.test(s)) return 'Student Loan';
      if (/personal|family|friend/.test(s)) return 'Personal Loan';
      return 'Other Loan';
    };
    F.DEBT_ROWS.forEach((r, i) => {
      const bal = num(st[r.bal]), pay = num(st[r.pay]), rate = num(st[r.rate]);
      const label = i === 0 ? 'Mortgage' : txt(r.type);
      if (!bal && !pay) return;
      c.debts.push({ type: i === 0 ? 'Mortgage' : guess(label), desc: label, term: '', bal, rate, pay, min: pay });
    });

    /* protection: job coverage is group term; outside coverage keeps its type, company and premium */
    const typeOf = (t) => {
      const s = (t || '').toLowerCase();
      if (/iul|indexed/.test(s)) return 'IUL';
      if (/vul|variable/.test(s)) return 'VUL';
      if (/universal|\bul\b/.test(s)) return 'UL';
      if (/whole|perm/.test(s)) return 'Whole Life';
      return 'Individual Term';
    };
    const comp = F.compute(st, c.married);
    for (const w of people) {
      const who = owner(w);
      const net = comp[sp(F.INC.net, w)] || 0;
      const face = (v) => { const m = /(\d+(?:\.\d+)?)\s*(x|times)/i.exec(v || ''); return m ? +m[1] * net * 12 : num(v); };
      const job = face(txt(sp(F.PRO.job, w)));
      if (job) c.policies.push({ insured: who, owner: who, beneficiary: 'Other', type: 'Group Term', provider: 'Employer', face: job, premium: 0, mode: 'Monthly', year: '' });
      const out = face(txt(sp(F.PRO.outside, w)));
      if (out) c.policies.push({ insured: who, owner: who, beneficiary: 'Other', type: typeOf(txt(sp(F.PRO.type, w))), provider: txt(sp(F.PRO.company, w)), face: out, premium: num(st[sp(F.PRO.cost, w)]), mode: 'Monthly', year: '' });
      if (!out && num(st[sp(F.PRO.cost, w)])) c.policies.push({ insured: who, owner: who, beneficiary: 'Other', type: typeOf(txt(sp(F.PRO.type, w))), provider: txt(sp(F.PRO.company, w)), face: 0, premium: num(st[sp(F.PRO.cost, w)]), mode: 'Monthly', year: '' });
    }
    // DIME: income to replace is the take-home of the bigger earner; debts and mortgage come from the debt list
    const nets = people.map((w) => comp[sp(F.INC.net, w)] || 0);
    c.ins.incomeMonthly = Math.round(Math.max(0, ...nets)) || '';
    const edu = st[sp(F.PRO.dEdu, 'p')] !== undefined && st[sp(F.PRO.dEdu, 'p')] !== '' ? num(st[sp(F.PRO.dEdu, 'p')]) : F.eduAuto(st);
    c.ins.edu = edu || '';

    /* savings and retirement accounts */
    for (const w of people) {
      const who = owner(w);
      const net = comp[sp(F.INC.net, w)] || 0;
      for (const r of F.RET_ROWS) {
        const bal = num(st[sp(r.bal, w)]);
        const mine = num(st[sp(r.camt, w)]) || (num(st[sp(r.cpct, w)]) / 100) * net;
        const match = num(st[sp(r.mamt, w)]) || (num(st[sp(r.mpct, w)]) / 100) * net;
        if (!bal && !mine && !match) continue;
        const label = r.type ? (txt(sp(r.type, w)) || 'Retirement account') : r.label;
        c.assets.push({ name: label, type: 'Retirement Plan', owner: who, value: bal, monthly: r2(mine + match), ef: false, ret: true });
      }
      F.RET.old.forEach((o) => {
        const bal = num(st[sp(o.bal, w)]); if (!bal) return;
        const emp = txt(sp(o.emp, w));
        c.assets.push({ name: emp ? `Old plan, ${emp}` : 'Old retirement plan', type: 'Retirement Plan', owner: who, value: bal, monthly: 0, ef: false, ret: true });
      });
      const amt = (t) => { const m = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/i.exec(t || ''); return m ? num(m[1] + (m[2] || '')) : 0; };
      const label = (t, d) => (t || '').replace(/\$?\s*\d[\d,]*(?:\.\d+)?\s*(k|m)?\b/gi, '').replace(/\s+/g, ' ').trim() || d;
      // the intake lets you list several accounts in one box, joined with "; "
      const each = (k) => txt(k).split(/\s*;\s*/).filter(Boolean);
      each(sp(F.RET.taxFree, w)).forEach((tf) => { if (amt(tf)) c.assets.push({ name: label(tf, 'Tax free account'), type: 'Roth IRA', owner: who, value: amt(tf), monthly: 0, ef: false, ret: true }); });
      const ck = num(st[sp(F.RET.checking, w)]); if (ck) c.assets.push({ name: 'Checking', type: 'Checking', owner: who, value: ck, monthly: 0, ef: true, ret: false });
      const sv = num(st[sp(F.RET.savings, w)]); if (sv) c.assets.push({ name: 'Savings', type: 'Savings', owner: who, value: sv, monthly: 0, ef: true, ret: false });
      each(sp(F.RET.other, w)).forEach((ot) => { if (amt(ot)) c.assets.push({ name: label(ot, 'Other account'), type: /brok|stock|invest/i.test(ot) ? 'Stocks and Bonds' : 'Other', owner: who, value: amt(ot), monthly: 0, ef: false, ret: false }); });
      const pen = num(st[sp(F.RET.pension.monthly, w)]); if (pen) c.ret[who === 'a' ? 'pensionA' : 'pensionB'] = pen;
      const age = num(st[sp(F.RET.age, w)]); if (age >= 30 && age <= 100) c.ret[who === 'a' ? 'ageA' : 'ageB'] = age;
    }
    const wants = people.map((w) => num(st[sp(F.RET.monthly, w)]));
    const want = wants.reduce((a, b) => a + b, 0);
    if (want) { c.ret.needMode = 'amount'; c.ret.needAmt = want; } else review.push('retire');
    // kept so the app can ask "each, or together?" when both spouses gave the same number
    c.ret.intakeWant = { a: wants[0] || 0, b: wants[1] || 0 };

    c.will = st['Will Y'] === 'Y' ? 'Yes' : st['Will Y'] === 'N' ? 'No' : '';
    c.trust = st['Trust Y'] === 'Y' ? 'Yes' : st['Trust Y'] === 'N' ? 'No' : '';
    const notes = [txt('n13'), ...F.RECS.map((r) => txt(r[0]))].filter(Boolean);
    c.notes = notes.join('\n');
    // recommendations become action steps when there are any
    const recs = F.RECS.map((r) => txt(r[0])).filter(Boolean);
    if (recs[0]) c.report.actions.prot = recs[0];
    c.review = review;
    return c;
  }

  /* ---------- math ---------- */
  const monthlyOf = (inc) => (num(inc.amount) * num(inc.freq || 12)) / 12;
  const premiumMonthly = (p) => { const m = PREMIUM_MODES.find((x) => x.v === p.mode) || PREMIUM_MODES[0]; return m.per ? num(p.premium) / m.per : 0; };
  // growing annuity, paid at the end of each year (matches MyWFG to the cent)
  const pvGrowing = (first, r, g, n) => (n <= 0 || !first ? 0 : Math.abs(r - g) < 1e-9 ? (first * n) / (1 + r) : (first / (r - g)) * (1 - Math.pow((1 + g) / (1 + r), n)));
  const fvMonthly = (i, n) => (i === 0 ? n : (Math.pow(1 + i, n) - 1) / i);

  function calc(c, today = new Date()) {
    const out = {};
    const A = c.assume;
    const people = c.married ? ['a', 'b'] : ['a'];
    out.people = people;
    out.name = { a: fullName(c.a), b: fullName(c.b) };
    out.first = { a: c.a.first || fullName(c.a), b: c.b.first || fullName(c.b) };
    const rd = (() => { const d = parseDate(c.reportDate); return d ? new Date(d.y, d.m - 1, d.d) : today; })();
    out.date = rd;
    out.age = { a: ageOn(c.a.dob, rd), b: c.married ? ageOn(c.b.dob, rd) : null };

    /* cash flow */
    out.incomeBy = { a: 0, b: 0 };
    for (const inc of c.incomes) if (people.includes(inc.owner)) out.incomeBy[inc.owner] += monthlyOf(inc);
    out.income = out.incomeBy.a + out.incomeBy.b;
    out.expenseRows = EXPENSES.map((e) => ({ k: e.k, t: e.t, amt: num(c.expenses[e.k] && c.expenses[e.k].amt), disc: !!(c.expenses[e.k] && c.expenses[e.k].disc) }));
    out.expenses = out.expenseRows.reduce((a, e) => a + e.amt, 0);
    out.expensesNonDisc = out.expenseRows.filter((e) => !e.disc).reduce((a, e) => a + e.amt, 0);
    out.taxes = out.income * (num(c.taxRate) / 100);
    out.premiums = c.policies.filter((p) => people.includes(p.owner) || people.includes(p.insured)).reduce((a, p) => a + premiumMonthly(p), 0);
    out.savings = c.assets.filter((x) => people.includes(x.owner)).reduce((a, x) => a + num(x.monthly), 0);
    out.totalOut = out.expenses + out.taxes + out.premiums + out.savings;
    out.discretionary = out.income - out.totalOut;

    /* debt */
    out.debts = c.debts.filter((d) => num(d.bal) || num(d.pay) || num(d.min));
    out.debtBal = out.debts.reduce((a, d) => a + num(d.bal), 0);
    out.debtPay = out.debts.reduce((a, d) => a + num(d.pay), 0);
    out.debtMin = out.debts.reduce((a, d) => a + num(d.min), 0);
    out.debtRatio = out.income ? (out.debtPay / out.income) * 100 : 0;
    const byType = (t) => out.debts.filter((d) => d.type === t).reduce((a, d) => a + num(d.bal), 0);
    out.mortgageDebt = byType('Mortgage');
    out.nonMortgageDebt = out.debtBal - out.mortgageDebt;
    out.debtTypes = { 'Student Loans': byType('Student Loan'), 'Auto Loans': byType('Auto Loan'), 'Credit Cards': byType('Credit Card'), 'Personal Loans': byType('Personal Loan'), 'Other Loans': byType('Other Loan') };

    /* emergency fund */
    out.efMonths = num(A.efMonths);
    out.efMonthly = c.ef.mode === 'amount' ? num(c.ef.amount) : c.ef.mode === 'nondisc' ? out.expensesNonDisc : out.expenses;
    out.efTarget = out.efMonths * out.efMonthly;
    out.efAssets = c.assets.filter((x) => x.ef && people.includes(x.owner) && num(x.value));
    out.efHave = out.efAssets.reduce((a, x) => a + num(x.value), 0);
    out.efShort = Math.max(0, out.efTarget - out.efHave);

    /* protection need (same for each person, like MyWFG) */
    const I = c.ins;
    const yrs = num(A.survYears);
    const mort = I.autoMort !== false && !num(I.mort1) && !num(I.mort2) ? out.mortgageDebt : num(I.mort1) + num(I.mort2);
    const lines = [];
    if (I.method === 'detail') {
      const incPct = num(I.incomePct);
      if (out.nonMortgageDebt) lines.push(['Pay off your present debts', out.nonMortgageDebt]);
      if (incPct && out.income) lines.push([`Provide ${r2(incPct)}% of your current income for your survivor(s) for ${yrs} years`, (out.income * 12 * incPct / 100) * yrs]);
      if (mort) lines.push(['Pay off your mortgage', mort]);
      if (num(I.edu)) lines.push(["Fund your children's education", num(I.edu)]);
      if (num(I.final)) lines.push(['Pay your final expenses', num(I.final)]);
      if (out.efTarget) lines.push(['Establish an emergency fund', out.efTarget]);
    } else {
      if (out.nonMortgageDebt) lines.push(['Pay off your present debts', out.nonMortgageDebt]);
      if (num(I.incomeMonthly) && yrs) lines.push([`Provide income for your survivor(s) for ${yrs} years`, num(I.incomeMonthly) * 12 * yrs]);
      if (mort) lines.push(['Pay off your mortgage', mort]);
      if (num(I.edu)) lines.push(["Fund your children's education", num(I.edu)]);
    }
    out.needLines = lines;
    out.need = lines.reduce((a, l) => a + l[1], 0);
    out.mortgageUsed = mort;
    out.prot = {};
    for (const w of people) {
      const pols = c.policies.filter((p) => p.insured === w && num(p.face));
      const have = pols.reduce((a, p) => a + num(p.face), 0);
      out.prot[w] = { policies: pols, have, gap: Math.max(0, out.need - have) };
    }

    /* retirement */
    const R = c.ret;
    const ret = {};
    const ytr = people.map((w) => { const age = out.age[w]; const ra = num(w === 'a' ? R.ageA : R.ageB); return age == null ? null : Math.max(0, ra - age); });
    const valid = ytr.filter((y) => y != null);
    ret.years = valid.length ? Math.min(...valid) : 0;
    const ends = people.map((w, i) => (ytr[i] == null ? null : ytr[i] + Math.max(0, num(w === 'a' ? R.lifeA : R.lifeB) - num(w === 'a' ? R.ageA : R.ageB)))).filter((y) => y != null);
    ret.inRetirement = ends.length ? Math.max(...ends) - ret.years : 0;
    const infl = num(A.infl) / 100, rRet = num(A.rorRet) / 100, rPre = num(A.rorPre) / 100, ssg = num(A.ssInc) / 100;
    ret.desired = R.needMode === 'pct' ? (out.income * 12 * num(R.needPct)) / 100 : num(R.needAmt) * 12;
    ret.firstYear = ret.desired * Math.pow(1 + infl, ret.years);
    ret.pension = people.reduce((a, w) => a + num(w === 'a' ? R.pensionA : R.pensionB) * 12, 0);
    ret.pensionToday = ret.pension / Math.pow(1 + infl, ret.years);
    ret.ss = R.ss ? people.reduce((a, w, i) => { const amt = num(w === 'a' ? R.ssAmtA : R.ssAmtB) * 12; const yToSS = ytr[i] == null ? 0 : Math.max(0, num(w === 'a' ? R.ssAgeA : R.ssAgeB) - (out.age[w] || 0)); return a + amt * Math.pow(1 + ssg, yToSS); }, 0) : 0;
    ret.needAtStart = Math.max(0, pvGrowing(ret.firstYear, rRet, infl, ret.inRetirement) - pvGrowing(ret.pension, rRet, 0, ret.inRetirement) - pvGrowing(ret.ss, rRet, ssg, ret.inRetirement));
    // MyWFG saves for one year less than the years to retirement (checked against a real report)
    ret.months = Math.max(0, ret.years - 1) * 12;
    const iPre = rPre / 12;
    ret.assets = c.assets.filter((x) => x.ret && people.includes(x.owner));
    ret.projected = ret.assets.reduce((a, x) => a + num(x.value) * Math.pow(1 + iPre, ret.months) + num(x.monthly) * fvMonthly(iPre, ret.months), 0);
    ret.shortfall = Math.max(0, ret.needAtStart - ret.projected);
    const fund = (rate) => { const i = rate / 100 / 12; return ret.months && ret.shortfall ? (ret.shortfall * (i ? i / (Math.pow(1 + i, ret.months) - 1) : 1 / ret.months)) : 0; };
    ret.fundRate = num(A.rorPre);
    ret.monthly = fund(ret.fundRate);
    ret.fund = [4, 6, 8].map((r) => ({ r, m: fund(r) }));
    out.ret = ret;
    return out;
  }

  /* what still needs a human before the report is honest */
  function gaps(c, k) {
    const g = [];
    if (!fullName(c.a)) g.push({ sec: 'people', t: "Client's name" });
    if (!parseDate(c.a.dob)) g.push({ sec: 'people', t: "Client's date of birth" });
    if (c.married && !parseDate(c.b.dob)) g.push({ sec: 'people', t: "Spouse's date of birth" });
    if (!k.income) g.push({ sec: 'income', t: 'Income' });
    if (!k.expenses) g.push({ sec: 'expenses', t: 'Monthly expenses' });
    if (!k.ret.desired) g.push({ sec: 'retire', t: 'Retirement income wanted' });
    if (!k.need) g.push({ sec: 'protect', t: 'Protection need' });
    return g;
  }

  root.FNAR = { FREQ, DEBT_TYPES, POLICY_TYPES, PREMIUM_MODES, ASSET_TYPES, EXPENSES, GOALS, SECTIONS, DEFAULTS, CAPS, num, r2, money, pct, parseDate, ageOn, fullName, uid, todayStr, blankCase, fromIntake, calc, gaps, premiumMonthly, monthlyOf };
})(typeof window !== 'undefined' ? window : globalThis);
