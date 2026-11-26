/* FNA Intake: field map and math.
   Every key in the app state is the real PDF field name, so export and import are one to one.
   A few keys hold a choice that the PDF splits across several boxes (Y/N pairs, M/F, pay
   frequency, dates). Those are listed in CHOICES and DATES below.
   Spouse fields on page 4 are the prospect name plus "S" (one exception: DIME debts). */
(function (root) {
  const sp = (name, who) => (who === 's' ? (name === 'Text6' ? 'DIME DebtsS' : name + 'S') : name);

  const PEOPLE = [
    { id: 'p', name: 'PROSPECT', sex: 'Prospect M', sexF: 'Prospect F', age: 'Prospect Age', dob: ['Prospect DOB M', 'Text20', 'Text30'] },
    { id: 's', name: 'Spouse Name', sex: 'Spouse M', sexF: 'Spouse F', age: 'Spouse Age', dob: ['Spouse DOB M', 'Text31', 'Text51'] },
    { id: 'd1', name: 'Dependents Name', sex: 'Dependent M', sexF: 'Dependent F', age: 'Dependent Age', dob: ['Dependent DOB M', 'Text54', 'Text55'] },
    { id: 'd2', name: 'Dependents Name0', sex: 'Dependent0 M', sexF: 'Dependent0 F', age: 'Dependent Age0', dob: ['Dependent0 DOB M', 'Text56', 'Text57'] },
    { id: 'd3', name: 'Dependents Name1', sex: 'Dependent1 M', sexF: 'Dependent1 F', age: 'Dependent Age1', dob: ['Dependent1 DOB M', 'Text58', 'Text59'] },
    { id: 'd4', name: 'Text8', sex: 'Dependent2 M', sexF: 'Dependent2 F', age: 'Text12', dob: ['Text11', 'Text60', 'Text61'] },
  ];

  /* Dependents 5 to 8 and debts 7 to 10 have no box on the paper form. They live in
     app-only keys (leading "_") and print on the Notes lines, so nothing is lost. */
  const EXTRA_DEPS = [5, 6, 7, 8].map((n) => ({ id: 'd' + n, name: `_d${n} name`, sex: `_d${n} sex`, age: `_d${n} age`, dob: [`_d${n} dob`], extra: true }));
  const DEPS = [...PEOPLE.slice(2), ...EXTRA_DEPS];
  // per child: "_notdep{i}" = not a dependent (separated, grown, lives elsewhere); "_nocol{i}" = leave out of Education
  const depFlag = (i) => ({ notDep: `_notdep${i}`, noCol: `_nocol${i}` });
  const EDU_PRESETS = [100000, 125000, 150000];

  const RET_ROWS = [
    { label: '401(k)', type: null, bal: 'Text19', cpct: 'Text32', camt: 'Text33', mpct: 'Text34', mamt: 'Text35' },
    { label: '403(b)', type: null, bal: 'Text36', cpct: 'Text37', camt: 'Text38', mpct: 'Text39', mamt: 'Text40' },
    { label: '457', type: null, bal: 'Text41', cpct: 'Text42', camt: 'Text43', mpct: 'Text44', mamt: 'Text45' },
    { label: 'Other', type: 'Text1', bal: 'Text46', cpct: 'Text47', camt: 'Text48', mpct: 'Text49', mamt: 'Text50' },
  ];

  const RET = {
    age: 'At what age would you like to be in a financial po',
    monthly: 'How much would you want coming in per month in ret',
    employer: 'Employer',
    old: [{ emp: 'Text16', bal: 'Text17' }, { emp: 'Text2', bal: 'Text18' }],
    pension: { admin: 'Text21', yrs: 'Text22', monthly: 'Text4' },
    taxFree: 'Text23',
    thoughts: ['Text24', 'Text25'],
    other: 'Text26', checking: 'Text52', savings: 'Text53',
    marketLoss: ['CheckBox9', 'CheckBox10'], lifetime: ['CheckBox11', 'CheckBox12'],
  };

  const INC = {
    freq: ['CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox4'], // every 2 wks, twice a month, weekly, monthly
    biw: '2 wks amount', biwM: '2 wks monthly',
    semi: '2x mth amount', semiM: '2x mth amount monthly',
    week: 'Once a week amount', weekM: 'Once a week amount monthly',
    month: 'Monthly amount',
    other: [{ src: 'other source 1', amt: 'other source 1 amount' }, { src: 'other source 2', amt: 'other source 2 amount' }],
    passive: ['Y Outisde Job Life Ins', 'N Outisde Job Life Ins'],
    net: 'MonthlyNet',
  };

  const PRO = {
    job: 'Do you know how much coverage you have',
    outside: 'How about any protection outside of what your job',
    type: 'Do you know what type it is term universal IUL who',
    termYrs: 'If term  of years',
    company: 'What company',
    cost: 'How much do you pay each month for it',
    howLong: 'How long have you had it for',
    thoughts: ['What are your thoughts on the plan you have', 'What are your thoughts on the plan you have 1'],
    dDebts: 'Text6', dIncome: 'Text7', dMort: 'DIME Mortgage', dEdu: 'Text9', dTotal: 'Text10', dMin: 'DIME Total min amount',
    want: 'Text29', prefer: 'n8', why: 'n9',
    health: 'Text13', healthWhy: 'Rate yourself & why',
    meds: ['Any rx meds?', 'Any rx meds? 1'],
    smoke: ['P Smoke Y', 'P Smoke N'], dui: ['CheckBox65', 'CheckBox66'],
    ft: 'Text27', inch: 'P Height inches', wt: 'Text28',
    ltc: ['CheckBox63', 'CheckBox64'], ltcCov: 'Coverage amt', ltcPrem: 'premium amt',
  };

  const DEBT_ROWS = [
    { type: null, bal: 'B6', rate: 'I1', pay: 'M1' }, // printed "Mortgage" row
    { type: 'D2', bal: 'B2', rate: 'I2', pay: 'M2' },
    { type: 'D3', bal: 'B3', rate: 'I3', pay: 'M3' },
    { type: 'D4', bal: 'B4', rate: 'I4', pay: 'M4' },
    { type: 'D5', bal: 'B5', rate: 'I5', pay: 'M5' },
    { type: 'D1', bal: 'B1', rate: 'I6', pay: 'M6' },
  ];
  const EXTRA_DEBTS = [7, 8, 9, 10].map((n) => ({ type: `_x${n} type`, bal: `_x${n} bal`, rate: `_x${n} rate`, pay: `_x${n} pay`, extra: true }));
  const ALL_DEBTS = [...DEBT_ROWS, ...EXTRA_DEBTS];
  /* Plans 2 to 4 for each person have no box on the paper form. App-only keys,
     they count toward "Has" and print on the Notes lines. */
  const EXTRA_PLANS = Object.fromEntries(['p', 's'].map((w) => [w, [2, 3, 4].map((n) => ({ n, amt: `_plan${n}${w} amt`, type: `_plan${n}${w} type`, company: `_plan${n}${w} company`, cost: `_plan${n}${w} cost`, had: `_plan${n}${w} had` }))]));
  /* Old retirement accounts 3 to 6 have no box on the paper form. App-only keys,
     they count toward "Saved for retirement" and print on the Notes lines. */
  const EXTRA_OLD = Object.fromEntries(['p', 's'].map((w) => [w, [3, 4, 5, 6].map((n) => ({ n, emp: `_old${n}${w} emp`, bal: `_old${n}${w} bal` }))]));
  /* Underwriting guides by carrier. Add a carrier = add a line. Empty link = "not added yet". */
  const UW_GUIDES = {
    Nationwide: 'https://drive.google.com/file/d/1HGRhQduKuMan6nqsaZAaVSwS1rFoeIX6/view?usp=drive_link',
    Transamerica: '',
    'Pacific Life': '',
  };

  const GOALS = [
    ['Pay off debt', 'Pay off debt'], ['Retirement', 'Retirement'], ['Buy Property', 'Buy property'],
    ['Leaving a Legacy', 'Leaving a legacy'], ['Support Fam Mem', 'Support family'], ['Savings', 'Savings'],
    ['Other fin goal', 'Other'],
  ];
  // checkbox + answer line, in the order they print
  const PROTECT_Q = [
    { chk: 'Market loss protection goal', ans: 'prematurely happened', tag: 'Family protection', q: 'If something prematurely happened to you, would you want to make sure your family is financially protected?' },
    { chk: 'Premature fam fin protection goal', ans: 'ltc needed', tag: 'LTC protection', q: 'If you required Long-Term Care due to a serious illness, would you want to make sure you are not a burden on your family?' },
    { chk: 'LTC Goal', ans: 'market loss protec', tag: 'Protection from market loss', q: 'Is it important to you to protect your assets from market loss?' },
    { chk: 'learning passive income', ans: 'passive income imp', tag: 'Passive income', q: 'Is learning how to create passive income streams important to you?' },
  ];

  const EXP = {
    budget: ['Y Monthly Budget', 'N Monthly Budget'], expenses: 'Monthly Expenses',
    combined: 'MonthlyNetCombined', ten: '10 of Net Income', minus: 'Monthly Expenses minus', disc: 'Text5', discQ: 'Discretionary left over',
    right: ['Y sounds right', 'N sounds right'], growing: 'If no ask Do you see your bank account growing or',
    choice: ['10%', 'Y More %', 'Y Less %'], morePct: 'More %', lessPct: 'Less %',
    show10: '10%f', showMore: 'More % show', showLess: 'Less % show',
    saving: 'were looking at saving', sound: 'and dreams How does that sound', future: 'future',
  };

  /* The commitment (the form's last question) and page 5, Personal Introductions (Bill Cates).
     The tap answer lives in _commit (app only); the PDF's "future" line prints "Answer: why". */
  const COMMIT = [['none', 'Nothing stopping us'], ['spouse', 'Talk to spouse'], ['money', 'Money'], ['timing', 'Timing'], ['other', 'Other']];
  const commitText = (st) => {
    const a = COMMIT.find((c) => c[0] === st._commit), why = String(st[EXP.future] || '').trim();
    return a ? (why ? `${a[1]}: ${why}` : a[1]) : why;
  };
  const EVENTS = [
    { id: 'jobs', tag: 'Changed jobs', q: 'Who do you know who just changed jobs and left a 401(k) behind?' },
    { id: 'retire', tag: 'Retiring', q: 'Who do you know who’s retiring in the next few years?' },
    { id: 'bonus', tag: 'Bonus or raise', q: 'Who do you know who just got a big bonus or a raise?' },
    { id: 'inherit', tag: 'Inheritance', q: 'Who do you know who has inherited money, or likely will in the next few years?' },
    { id: 'biz', tag: 'Starting a business', q: 'Who do you know who’s starting a business, or thinking about it?' },
  ];
  const INTRO_ROWS = Array.from({ length: 10 }, (_, i) => ({ name: `Intro ${i + 1} Name`, how: `Intro ${i + 1} How Known`, why: `Intro ${i + 1} Why`, event: `Intro ${i + 1} Event` }));
  const PARTNER = { name: 'Driven Person Name', how: 'Driven Person How Known', why: 'Driven Person Why' };
  const introCount = (st) => INTRO_ROWS.filter((r) => String(st[r.name] || '').trim()).length + (String(st[PARTNER.name] || '').trim() ? 1 : 0);
  // which money-moving event this family is in, from what the FNA already shows (Cates: open with theirs)
  function theirEvents(st) {
    const out = new Set();
    const has = (k) => String(st[k] || '').trim() !== '';
    for (const w of ['p', 's']) {
      if (RET.old.some((o) => has(sp(o.emp, w)) || has(sp(o.bal, w)))) out.add('jobs');
      const age = num(st[w === 'p' ? PEOPLE[0].age : PEOPLE[1].age]) || num(ageFrom(st[(w === 'p' ? PEOPLE[0] : PEOPLE[1]).dob[0]]));
      const goal = num(st[sp(RET.age, w)]);
      if (age && goal && goal - age <= 7) out.add('retire');
      if (INC.other.some((o) => /business|self|llc|own|side/i.test(st[sp(o.src, w)] || ''))) out.add('biz');
    }
    return out;
  }

  const RETURN = { date: ['Return Day', 'Return Month', 'Return Year'], hour: 'Return Hour', min: 'Return Min', ampm: ['AM', 'PM'], tz: ['Hawaii', 'Alaska', 'Pacific', 'Mountain', 'Central', 'Eastern'], state: 'State' };
  const NOTES = ['n13', 'n14', 'n15', 'n16', 'n17', 'n18', 'n19', 'n120', 'n21'];
  const RECS = [1, 2, 3].map((n) => [1, 2, 3, 4].map((l) => `rec ${n}.${l}`));
  const HEADER = { agent: 'TRAINEE', date: ['DATE', 'Text14', 'Text15'], email: 'Email' };

  /* Choice keys: state[key] holds one letter/word; export checks exactly one box. */
  const CHOICES = {};
  const yn = (pair) => { CHOICES[pair[0]] = { Y: pair[0], N: pair[1] }; };
  for (const who of ['p', 's']) {
    yn([sp(RET.marketLoss[0], who), sp(RET.marketLoss[1], who)]);
    yn([sp(RET.lifetime[0], who), sp(RET.lifetime[1], who)]);
    yn([sp(INC.passive[0], who), sp(INC.passive[1], who)]);
    yn([sp(PRO.smoke[0], who), sp(PRO.smoke[1], who)]);
    yn([sp(PRO.dui[0], who), sp(PRO.dui[1], who)]);
    yn([sp(PRO.ltc[0], who), sp(PRO.ltc[1], who)]);
    const f = INC.freq.map((n) => sp(n, who));
    CHOICES[f[0]] = { b: f[0], s: f[1], w: f[2], m: f[3] };
  }
  yn(['Will Y', 'Will N']); yn(['Trust Y', 'Trust N']);
  yn(EXP.budget); yn(EXP.right);
  for (const p of PEOPLE) CHOICES[p.sex] = { M: p.sex, F: p.sexF };
  CHOICES[EXP.choice[0]] = { '10': EXP.choice[0], more: EXP.choice[1], less: EXP.choice[2] };
  CHOICES[RETURN.ampm[0]] = { AM: 'AM', PM: 'PM' };
  CHOICES['Eastern'] = Object.fromEntries(RETURN.tz.map((t) => [t, t]));

  /* Date keys: state[first] = "MM/DD/YYYY"; export splits into the three boxes in print order. */
  const DATES = [HEADER.date, RETURN.date, ...PEOPLE.map((p) => p.dob)];

  /* Section 3 "longer range" answers: one PDF line each, about this many characters fit. */
  const LONG_GOALS = [['Any additional goals in the next 3-7 years', '3 to 7 year goals'], ['How about 7+ years', '7+ year goals'], ['Out of all of these goals what is most important t', 'Most important goal']];
  const LONG_FIT = 95;

  /* Long answers that print across several lines. state[first] holds the whole text. */
  const GROUPS = [
    ...['p', 's'].flatMap((w) => [RET.thoughts.map((n) => sp(n, w)), PRO.thoughts.map((n) => sp(n, w)), PRO.meds.map((n) => sp(n, w))]),
    NOTES, ...RECS,
  ];

  const MONEY = new Set();
  const addM = (...n) => n.forEach((x) => MONEY.add(x));
  for (const w of ['p', 's']) {
    addM(sp(RET.monthly, w), sp(RET.pension.monthly, w), sp(RET.checking, w), sp(RET.savings, w));
    RET_ROWS.forEach((r) => addM(sp(r.bal, w)));
    RET.old.forEach((o) => addM(sp(o.bal, w)));
    addM(sp(INC.biw, w), sp(INC.semi, w), sp(INC.week, w), sp(INC.month, w), ...INC.other.map((o) => sp(o.amt, w)));
    addM(sp(INC.biwM, w), sp(INC.semiM, w), sp(INC.weekM, w), sp(INC.net, w));
    EXTRA_PLANS[w].forEach((x) => addM(x.amt, x.cost));
    EXTRA_OLD[w].forEach((x) => addM(x.bal));
    addM(sp(PRO.cost, w), sp(PRO.dDebts, w), sp(PRO.dIncome, w), sp(PRO.dMort, w), sp(PRO.dEdu, w), sp(PRO.dTotal, w), sp(PRO.dMin, w), sp(PRO.ltcCov, w), sp(PRO.ltcPrem, w));
  }
  DEBT_ROWS.forEach((r) => addM(r.bal, r.pay));
  addM(EXP.expenses, EXP.combined, EXP.ten, EXP.minus, EXP.disc, EXP.discQ, EXP.growing, EXP.saving);

  /* ---------- math (same rules as the PDF's own scripts) ---------- */
  const num = (v) => {
    if (v == null || v === '') return 0;
    let s = String(v).trim().toLowerCase().replace(/[$,\s]/g, '');
    let mult = 1;
    if (/k$/.test(s)) { mult = 1e3; s = s.slice(0, -1); } else if (/m$/.test(s)) { mult = 1e6; s = s.slice(0, -1); }
    const n = Number(s);
    return isNaN(n) ? 0 : n * mult;
  };
  // kids who count toward Education: named, and not switched off with "No college money"
  const kidsCount = (st) => DEPS.filter((p, i) => String(st[p.name] || '').trim() && st[depFlag(i).noCol] !== true).length;
  const eduPer = (st) => num(st._eduPer) || 100000;
  const eduAuto = (st) => kidsCount(st) * eduPer(st);

  function compute(st, hasSpouse = true) {
    const c = {};
    for (const w of ['p', 's']) {
      const g = (n) => num(st[sp(n, w)]);
      const biwM = Math.round(g(INC.biw) * 26 / 12);
      const semiM = Math.round(g(INC.semi) * 2);
      const weekM = Math.round(g(INC.week) * 52 / 12);
      const net = Math.round(g(INC.biw) * 26 / 12 + g(INC.semi) * 2 + g(INC.week) * 52 / 12 + g(INC.month) + g(INC.other[0].amt) + g(INC.other[1].amt));
      c[sp(INC.biwM, w)] = biwM; c[sp(INC.semiM, w)] = semiM; c[sp(INC.weekM, w)] = weekM; c[sp(INC.net, w)] = net;
    }
    const debts = Math.round(['B1', 'B2', 'B3', 'B4', 'B5', ...EXTRA_DEBTS.map((r) => r.bal)].reduce((a, k) => a + num(st[k]), 0));
    const mort = num(st.B6);
    const eduDefault = eduAuto(st);
    for (const w of ['p', 's']) {
      const edu = st[sp(PRO.dEdu, w)] !== undefined && st[sp(PRO.dEdu, w)] !== '' ? num(st[sp(PRO.dEdu, w)]) : eduDefault;
      const inc = c[sp(INC.net, w)] > 0 ? c[sp(INC.net, w)] * 120 : 0;
      c[sp(PRO.dDebts, w)] = debts; c[sp(PRO.dIncome, w)] = inc; c[sp(PRO.dMort, w)] = mort; c[sp(PRO.dEdu, w)] = edu;
      c[sp(PRO.dTotal, w)] = Math.round(debts + inc + mort + edu);
      c[sp(PRO.dMin, w)] = c[sp(PRO.dTotal, w)];
    }
    const combined = Math.round(c[INC.net] + (hasSpouse ? c[INC.net + 'S'] : 0));
    const exp = num(st[EXP.expenses]);
    c[EXP.combined] = combined;
    c[EXP.ten] = Math.round(combined * 0.1);
    c[EXP.minus] = exp;
    c[EXP.disc] = Math.round(combined - exp);
    c[EXP.discQ] = c[EXP.disc];
    const ch = st[EXP.choice[0]];
    let pct = 0;
    if (ch === '10') pct = 10; else if (ch === 'more') pct = num(st[EXP.morePct]); else if (ch === 'less') pct = num(st[EXP.lessPct]);
    c.savePct = pct;
    c[EXP.saving] = ch === '10' ? c[EXP.ten] : Math.round(combined * pct / 100);

    // app-only totals for the math rail
    const sumW = (w, keys) => keys.reduce((a, k) => a + num(st[sp(k, w)]), 0);
    for (const w of ['p', 's']) {
      c['ret_' + w] = sumW(w, [...RET_ROWS.map((r) => r.bal), ...RET.old.map((o) => o.bal)]) + EXTRA_OLD[w].reduce((a, x) => a + num(st[x.bal]), 0);
      // "2x salary" style answers count as that many years of take home pay (estimate, screen only)
      const xs = (v) => { const m = /(\d+(?:\.\d+)?)\s*(x|times)/i.exec(v || ''); return m ? +m[1] * c[sp(INC.net, w)] * 12 : num(v); };
      c['cov_' + w] = xs(st[sp(PRO.job, w)]) + xs(st[sp(PRO.outside, w)]) + EXTRA_PLANS[w].reduce((a, x) => a + xs(st[x.amt]), 0);
      c['gap_' + w] = Math.max(0, c[sp(PRO.dTotal, w)] - c['cov_' + w]);
    }
    c.debtAll = debts + mort;
    c.debtPay = ALL_DEBTS.reduce((a, r) => a + num(st[r.pay]), 0);
    c.kids = kidsCount(st);
    c.eduAuto = eduDefault;
    c.eduPer = eduPer(st);
    return c;
  }

  const fmt = (n) => {
    if (n === '' || n == null || isNaN(n)) return '';
    const r = Math.round(Number(n));
    return (r < 0 ? '-' : '') + Math.abs(r).toLocaleString('en-US');
  };

  function ageFrom(dob, today = new Date()) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dob || '');
    if (!m) return '';
    const [mo, d, y] = [+m[1], +m[2], +m[3]];
    let a = today.getFullYear() - y;
    if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) a--;
    return a >= 0 && a < 120 ? String(a) : '';
  }

  /* Build the full PDF value set: {texts:{name:{value,display}}, checks:[names], groups:[{names,text}], show:[names]} */
  function toPdfSpec(st, hasSpouse = true) {
    const c = compute(st, hasSpouse);
    const texts = {}, checks = [], groups = [], show = [];
    const skip = new Set();
    const put = (name, raw, isMoney) => {
      if (raw === undefined || raw === null || raw === '') return;
      if (isMoney && typeof raw === 'string' && !/^\s*-?\$?\s*[\d,]*\.?\d+\s*[km]?\s*$/i.test(raw)) isMoney = false; // "2x salary", "None"
      if (isMoney) {
        const n = typeof raw === 'number' ? raw : num(raw);
        if (!n && n !== 0) return;
        if (n === 0 && raw !== 0 && String(raw).trim() === '') return;
        texts[name] = { value: String(Math.round(n * 100) / 100), display: fmt(n) };
      } else texts[name] = { value: String(raw), display: String(raw) };
    };
    // choices
    for (const [key, map] of Object.entries(CHOICES)) {
      skip.add(key); Object.values(map).forEach((n) => skip.add(n));
      const v = st[key];
      if (v && map[v]) checks.push(map[v]);
    }
    // dates
    for (const d of DATES) {
      d.forEach((n) => skip.add(n));
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(st[d[0]] || '');
      if (m) { put(d[0], m[1].padStart(2, '0')); put(d[1], m[2].padStart(2, '0')); put(d[2], m[3]); }
    }
    // ages from DOB when typed age is empty
    for (const p of PEOPLE) {
      skip.add(p.age);
      const a = st[p.age] || ageFrom(st[p.dob[0]]);
      put(p.age, a);
    }
    // longer range goals print on one short line each; a long answer prints its start there
    // and the whole answer goes to the Notes lines, so nothing is cut off on paper
    const spill = [];
    for (const [k, tag] of LONG_GOALS) {
      const t = String(st[k] || '').replace(/\s+/g, ' ').trim();
      if (t.length <= LONG_FIT) continue;
      skip.add(k);
      put(k, t.slice(0, LONG_FIT - 14).replace(/\s+\S*$/, '') + '... (see notes)');
      spill.push(`${tag}: ${t}`);
    }
    // what has no box on paper goes to the Notes lines
    const T = (k) => String(st[k] || '').trim();
    DEPS.forEach((p, i) => {
      const nm = T(p.name); if (!nm) return;
      const f = depFlag(i), tags = [];
      if (st[f.notDep] === true) tags.push('not a dependent');
      if (st[f.noCol] === true) tags.push('no college money');
      if (p.extra) {
        const age = T(p.age) || ageFrom(T(p.dob[0]));
        const bits = [T(p.sex), T(p.dob[0]) && 'DOB ' + T(p.dob[0]), age && 'age ' + age].filter(Boolean).join(', ');
        spill.push(`Dependent: ${nm}${bits ? ' (' + bits + ')' : ''}${tags.length ? ', ' + tags.join(', ') : ''}`);
      } else if (tags.length) spill.push(`${nm}: ${tags.join(', ')}`);
    });
    EXTRA_DEBTS.forEach((r) => {
      if (![r.type, r.bal, r.rate, r.pay].some((k) => T(k))) return;
      const bal = num(st[r.bal]), pay = num(st[r.pay]);
      spill.push(`Debt: ${T(r.type) || 'Other'}${bal ? ', $' + fmt(bal) : ''}${T(r.rate) ? ' at ' + T(r.rate).replace(/%$/, '') + '%' : ''}${pay ? ', $' + fmt(pay) + ' a month' : ''}`);
    });
    for (const w of (hasSpouse ? ['p', 's'] : ['p'])) {
      const who = T(PEOPLE[w === 'p' ? 0 : 1].name).split(' ')[0] || (w === 'p' ? 'Prospect' : 'Spouse');
      EXTRA_OLD[w].forEach((x) => {
        if (!T(x.emp) && !T(x.bal)) return;
        const bal = num(st[x.bal]);
        spill.push(`${who} old retirement account ${x.n}: ${[T(x.emp), bal && '$' + fmt(bal)].filter(Boolean).join(', ')}`);
      });
      EXTRA_PLANS[w].forEach((x) => {
        if (![x.amt, x.type, x.company, x.cost, x.had].some((k) => T(k))) return;
        const amt = num(st[x.amt]), cost = num(st[x.cost]);
        const bits = [T(x.type), T(x.company), amt && '$' + fmt(amt), cost && '$' + fmt(cost) + ' a month', T(x.had) && 'had it ' + T(x.had)].filter(Boolean).join(', ');
        spill.push(`${who} plan ${x.n}: ${bits}`);
      });
    }
    for (const w of (hasSpouse ? ['p', 's'] : ['p'])) {
      const who = T(PEOPLE[w === 'p' ? 0 : 1].name).split(' ')[0] || (w === 'p' ? 'Prospect' : 'Spouse');
      if (st[sp(PRO.smoke[0], w)] === 'Y' && T('_smokeNote' + w)) spill.push(`${who} smoking: ${T('_smokeNote' + w)}`);
      if (st[sp(PRO.dui[0], w)] === 'Y' && T('_duiNote' + w)) spill.push(`${who} DUI: ${T('_duiNote' + w)}`);
    }
    if (st[EXP.right[0]] === 'N' && num(st._leftThink)) spill.push(`They think about $${fmt(num(st._leftThink))} is left over each month`);
    if (st._growing === 'same') spill.push('Bank account is staying the same each month');
    if (st._estateImp === 'Y') spill.push('Will or trust is important to them: introduce an estate attorney');
    if (c.kids && eduPer(st) !== 100000) spill.push(`Education figured at $${fmt(eduPer(st))} per kid`);
    // long text groups
    for (const g of GROUPS) {
      g.forEach((n) => skip.add(n));
      const text = g === NOTES ? [String(st[g[0]] || '').trim(), ...spill].filter(Boolean).join('\n') : st[g[0]];
      if ((text || '').trim()) groups.push({ names: g, text });
    }
    // computed fields
    const computedNames = Object.keys(c).filter((k) => /[A-Za-z]/.test(k) && !/^(ret_|cov_|gap_|savePct|debtAll|debtPay|kids|eduAuto|eduPer)/.test(k));
    for (const k of computedNames) {
      skip.add(k);
      if (!hasSpouse && k.endsWith('S') && k !== 'Text5') continue;
      const v = c[k];
      if (v || v === 0 && (k === EXP.disc || k === EXP.discQ) && st[EXP.expenses]) put(k, v, true);
    }
    // the "So at __%" blank
    [EXP.show10, EXP.showMore, EXP.showLess, EXP.morePct, EXP.lessPct].forEach((n) => skip.add(n));
    if (st[EXP.choice[0]] === '10') { put(EXP.show10, '10'); show.push(EXP.show10); }
    if (st[EXP.choice[0]] === 'more' && st[EXP.morePct]) { put(EXP.morePct, st[EXP.morePct]); put(EXP.showMore, st[EXP.morePct]); show.push(EXP.morePct, EXP.showMore); }
    if (st[EXP.choice[0]] === 'less' && st[EXP.lessPct]) { put(EXP.lessPct, st[EXP.lessPct]); put(EXP.showLess, st[EXP.lessPct]); show.push(EXP.lessPct, EXP.showLess); }
    // single checkboxes
    for (const g of GOALS) { skip.add(g[0]); if (st[g[0]] === true) checks.push(g[0]); }
    for (const q of PROTECT_Q) { skip.add(q.chk); if (st[q.chk] === true) checks.push(q.chk); }
    // the commitment line: "Talk to spouse: wants Wonder to see the numbers"
    skip.add(EXP.future); put(EXP.future, commitText(st));
    // an event tag with no name on its line stays off the paper
    for (const r of INTRO_ROWS) if (![r.name, r.how, r.why].some((n) => String(st[n] || '').trim())) skip.add(r.event);
    // everything else is plain text or money, as typed
    for (const [k, v] of Object.entries(st)) {
      if (skip.has(k) || k.startsWith('_') || typeof v !== 'string') continue;
      if (!hasSpouse && /S$/.test(k) && k !== 'Text5' && PAGE4.has(k)) continue;
      put(k, v.trim(), MONEY.has(k));
    }
    return { texts, checks, groups, show, computed: c };
  }

  // names that live on the spouse page (used to blank page 4 when there is no spouse)
  const PAGE4 = new Set();
  const addPage4 = (n) => PAGE4.add(n);
  [RET.age, RET.monthly, RET.employer, RET.taxFree, RET.other, RET.checking, RET.savings, RET.pension.admin, RET.pension.yrs, RET.pension.monthly,
    ...RET_ROWS.flatMap((r) => [r.type, r.bal, r.cpct, r.camt, r.mpct, r.mamt].filter(Boolean)), ...RET.old.flatMap((o) => [o.emp, o.bal]),
    ...Object.values(INC).flat().flatMap((x) => (typeof x === 'string' ? [x] : [x.src, x.amt])),
    ...Object.values(PRO).flat(), ...RET.thoughts, ...RET.marketLoss, ...RET.lifetime,
  ].forEach((n) => addPage4(sp(n, 's')));

  /* Reverse: values read from a filled PDF back into app state. */
  function fromPdfValues(vals) {
    const st = {};
    const used = new Set();
    for (const [key, map] of Object.entries(CHOICES)) {
      for (const [v, n] of Object.entries(map)) { used.add(n); if (vals[n] === true) st[key] = v; }
    }
    for (const d of DATES) {
      d.forEach((n) => used.add(n));
      if (vals[d[0]] && vals[d[1]] && vals[d[2]]) st[d[0]] = `${vals[d[0]]}/${vals[d[1]]}/${vals[d[2]]}`;
    }
    for (const g of GROUPS) {
      g.forEach((n) => used.add(n));
      const t = g.map((n) => (typeof vals[n] === 'string' ? vals[n].trim() : '')).filter(Boolean).join(' ');
      if (t) st[g[0]] = t;
    }
    [EXP.show10, EXP.showMore, EXP.showLess].forEach((n) => used.add(n));
    for (const g of GOALS) { used.add(g[0]); if (vals[g[0]] === true) st[g[0]] = true; }
    for (const q of PROTECT_Q) { used.add(q.chk); if (vals[q.chk] === true) st[q.chk] = true; }
    // split the commitment line back into the tap answer and the why
    used.add(EXP.future);
    const fut = typeof vals[EXP.future] === 'string' ? vals[EXP.future].trim() : '';
    if (fut) {
      const hit = COMMIT.find((c) => fut === c[1] || fut.startsWith(c[1] + ':'));
      if (hit) { st._commit = hit[0]; const why = fut.slice(hit[1].length).replace(/^:\s*/, ''); if (why) st[EXP.future] = why; } else st[EXP.future] = fut;
    }
    const calc = new Set(Object.keys(compute({})));
    for (const [k, v] of Object.entries(vals)) {
      if (used.has(k) || calc.has(k) || typeof v !== 'string' || !v.trim()) continue;
      st[k] = MONEY.has(k) ? fmt(num(v)) : v;
    }
    // keep a typed education amount only if it differs from the 100K-per-kid default
    for (const w of ['p', 's']) {
      const k = sp(PRO.dEdu, w);
      if (vals[k] && num(vals[k]) !== eduAuto(st)) st[k] = fmt(num(vals[k]));
    }
    return st;
  }

  root.FNA = { DEPS, EXTRA_DEPS, EXTRA_OLD, EXTRA_PLANS, UW_GUIDES, depFlag, EDU_PRESETS, EXTRA_DEBTS, ALL_DEBTS, eduPer, sp, PEOPLE, RET_ROWS, RET, INC, PRO, DEBT_ROWS, GOALS, PROTECT_Q, EXP, COMMIT, commitText, EVENTS, INTRO_ROWS, PARTNER, introCount, theirEvents, RETURN, NOTES, RECS, HEADER, CHOICES, DATES, GROUPS, MONEY, PAGE4, num, fmt, compute, ageFrom, toPdfSpec, fromPdfValues, eduAuto };
})(typeof window !== 'undefined' ? window : globalThis);
