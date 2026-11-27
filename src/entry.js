/* MyWFG Entry Sheet: a typing guide that walks the real MyWFG FNA, screen by screen,
   box by box, with the intake answers already in MyWFG's format.
   Labels, order, tabs and pick lists were read off mywfg.com (FnaEdit) on 2026-11-27.
   Uses the intake schema (FNA), the case model (FNAR) and pdf-lib. */
(function (root) {
  const F = root.FNA, M = root.FNAR;

  /* ---------- MyWFG's own words ---------- */
  const FREQ_TXT = { 1: 'Annual x1', 12: 'Monthly x12', 24: 'Semi-Monthly x24', 26: 'Bi-Weekly x26', 52: 'Weekly x52' };
  const GOAL_TXT = {
    purchase: 'Make a Major Purchase', retire: 'Build Retirement Wealth', home: 'Buy a New Home',
    savings: 'Build Savings for Unexpected Expenses', mortgage: 'Reduce or Pay Off Mortgage', education: 'Education Funding',
    income: 'Alternative Income in case of disability or death', parents: 'Help Support Aging Parents',
    debts: 'Pay Off Credit Cards/Debts', business: 'Start a Business',
  };
  // MyWFG's expense lines, in its order, mapped to the case keys
  const EXP_TXT = [['auto', 'Auto & Transportation'], ['food', 'Food'], ['health', 'Health / Medical'], ['household', 'Household'],
    ['housing', 'Mortgage or Rent'], ['debt', 'Other Debt Service'], ['other', 'Other Monthly Expenses'], ['utilities', 'Utilities']];
  const ASSET_TXT = { 'CDs and Treasuries': "CD's and Treasuries" };

  /* ---------- small helpers ---------- */
  const num = M.num;
  const T = (st, k) => String(st[k] == null ? '' : st[k]).trim();
  // what you type: plain digits, no commas, cents only when there are cents (MyWFG boxes take numbers only)
  const typ = (n) => { const v = M.r2(num(n)); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  const usd = (n) => M.money(n).replace(/\.00$/, '');
  const pctT = (n) => `${M.r2(num(n))}`;

  /* ---------- the case, plus what the shared mapping leaves out ---------- */
  function buildCase(st, hasSpouse) {
    const s = Object.assign({}, st, { _hasSpouse: hasSpouse });
    const c = M.fromIntake(s, {});
    const people = c.married ? ['p', 's'] : ['p'];
    const owner = (w) => (w === 'p' ? 'a' : 'b');
    const firstName = (n) => { const p = n.trim().split(/\s+/); return p.length < 2 ? p[0] || '' : p.slice(0, -1).join(' '); };
    const lastName = (n) => { const p = n.trim().split(/\s+/); return p.length < 2 ? '' : p[p.length - 1]; };

    // dependents 1 to 8, with age kept so a missing birthday can say how old they are
    c.deps = F.DEPS.map((p) => {
      const nm = T(s, p.name); if (!nm) return null;
      const dob = T(s, p.dob[0]);
      return { first: firstName(nm), last: lastName(nm), dob: M.parseDate(dob) ? dob : '', age: T(s, p.age) || (F.ageFrom ? F.ageFrom(dob) : '') };
    }).filter(Boolean);

    // debts 7 to 10 (app only rows)
    const guess = (t) => {
      const x = t.toLowerCase();
      if (/mort|home|house|heloc/.test(x)) return 'Mortgage';
      if (/card|\bcc\b|visa|amex|discover|capital one|chase|citi|mastercard|bread|synchrony|credit/.test(x)) return 'Credit Card';
      if (/\bcars?\b|auto|truck|vehicle|\bsuv\b/.test(x)) return 'Auto Loan';
      if (/student|school|college|navient|sallie|nelnet|mohela/.test(x)) return 'Student Loan';
      if (/personal|family|friend/.test(x)) return 'Personal Loan';
      return 'Other Loan';
    };
    (F.EXTRA_DEBTS || []).forEach((r) => {
      const bal = num(s[r.bal]), pay = num(s[r.pay]), rate = num(s[r.rate]);
      if (!bal && !pay) return;
      const label = T(s, r.type) || 'Other';
      c.debts.push({ type: guess(label), desc: label, term: '', bal, rate, pay, min: pay });
    });

    // extra coverage plans and old retirement accounts (app only rows)
    const typeOf = (t) => {
      const x = (t || '').toLowerCase();
      if (/iul|indexed/.test(x)) return 'IUL';
      if (/vul|variable/.test(x)) return 'VUL';
      if (/universal|\bul\b/.test(x)) return 'UL';
      if (/whole|perm/.test(x)) return 'Whole Life';
      return 'Individual Term';
    };
    for (const w of people) {
      const who = owner(w);
      ((F.EXTRA_PLANS || {})[w] || []).forEach((x) => {
        const face = num(s[x.amt]), cost = num(s[x.cost]);
        if (!face && !cost) return;
        c.policies.push({ insured: who, owner: who, beneficiary: 'Other', type: typeOf(T(s, x.type)), provider: T(s, x.company), face, premium: cost, mode: 'Monthly', year: '', had: T(s, x.had) });
      });
      ((F.EXTRA_OLD || {})[w] || []).forEach((x) => {
        const bal = num(s[x.bal]); if (!bal) return;
        const emp = T(s, x.emp);
        c.assets.push({ name: emp ? `Old plan, ${emp}` : 'Old retirement plan', type: 'Retirement Plan', owner: who, value: bal, monthly: 0, ef: false, ret: true });
      });
      // how long they have had the main outside plan, so the sheet can hint at the policy year
      const had = T(s, F.sp(F.PRO.howLong, w));
      const out = c.policies.find((p) => p.insured === who && p.type !== 'Group Term' && !p.had);
      if (out && had) out.had = had;
    }
    c.desc = `${c.a.first || 'Client'}${c.married && c.b.first ? ' and ' + c.b.first : ''} FNA`;
    return c;
  }

  /* ---------- the walk: MyWFG screens, tabs and boxes, in MyWFG's order ---------- */
  // item kinds: sub (heading), kv (label, value, how), do (an action to click), table, check (number to compare), warn
  function walk(c, st) {
    const k = M.calc(c);
    const nm = { a: c.a.first || 'Client A', b: c.b.first || 'Client B' };
    const ask = [];
    const S = [];
    const kv = (label, value, how = 'type', note = '') => ({ t: 'kv', label, value, how, note });
    const sub = (text) => ({ t: 'sub', text });
    const act = (text) => ({ t: 'do', text });
    const chk = (text) => ({ t: 'check', text });
    const warn = (text) => ({ t: 'warn', text });

    /* 1. Household Information */
    const h = [];
    const dob = (d, who) => (d ? kv('Date of Birth', d) : (ask.push(`${who}'s date of birth (MyWFG will not save without it)`), kv('Date of Birth', 'Ask them', 'ask', 'Required. MyWFG will not save the case without it.')));
    h.push(sub('Client A'));
    h.push(kv('First Name', c.a.first || 'Ask them', c.a.first ? 'type' : 'ask'));
    h.push(kv('Last Name', c.a.last || 'Ask them', c.a.last ? 'type' : 'ask'));
    h.push(dob(c.a.dob, nm.a));
    h.push(kv('Married or Equivalent', c.married ? 'Check the box' : 'Leave unchecked', c.married ? 'type' : 'leave'));
    h.push(kv('Phone', 'Leave blank', 'leave', 'The intake does not ask for a phone number.'));
    if (c.married) {
      h.push(sub('Client B'));
      const bl = c.b.last || c.a.last;
      h.push(kv('First Name', c.b.first));
      h.push(kv('Last Name', bl || 'Ask them', bl ? 'type' : 'ask', !c.b.last && c.a.last ? 'The intake only had a first name. Check the last name.' : ''));
      h.push(dob(c.b.dob, nm.b));
    }
    h.push(sub('Dependents'));
    if (c.deps.length) {
      h.push(act('Click "Add a dependent >", type the row, click Save Dependent. Repeat for each one.'));
      h.push({ t: 'table', cols: [['First Name', 1.2], ['Last Name', 1.2], ['D.O.B', 1.6]], rows: c.deps.map((d) => {
        const last = d.last || c.a.last;
        if (!d.dob) ask.push(`${d.first}'s date of birth`);
        return [d.first, last, d.dob || { v: `Ask them${d.age ? ` (age ${d.age})` : ''}`, how: 'ask' }];
      }) });
    } else h.push(kv('Dependents', 'None on the intake', 'leave'));
    h.push(sub('This case'));
    h.push(kv('Provide a brief description for this FNA case:', c.desc));
    h.push(act('Click Next.'));
    S.push({ title: 'Household Information', menu: 'Household Information', items: h });

    /* 2. Assumptions */
    const A = c.assume;
    S.push({ title: 'Assumptions', menu: 'Assumptions', items: [
      act('These come pre-filled from the FNA default settings. Only change a box if it shows something else.'),
      sub('Assumed ROR on Assets'),
      kv('During Retirement', `${pctT(A.rorRet)} %`, 'leave', 'MyWFG default'),
      kv('Pre-Retirement', `${pctT(A.rorPre)} %`, 'leave', 'MyWFG default'),
      kv('Inflation Rate', `${pctT(A.infl)} %`, 'leave', 'MyWFG default'),
      kv('CPP/Social Security Annual Increase Rate', `${pctT(A.ssInc)} %`, 'leave', 'MyWFG default'),
      kv('Months of Emergency Fund', typ(A.efMonths), 'leave', 'MyWFG default'),
      kv('Years of Survivor Income', typ(A.survYears), 'leave', 'MyWFG default'),
      act('Click Next.'),
    ] });

    /* 3. Goals and Dreams */
    const g = [];
    const X = (b) => (b ? { v: 'X', how: 'type' } : '');
    const any = M.GOALS.some((x) => c.goals[x.k].s || c.goals[x.k].m || c.goals[x.k].l) || c.customGoals.length;
    if (!any) { g.push(warn('No goals were checked on the intake. Ask what matters to them before you check boxes.')); ask.push('Their goals (none checked on the intake)'); }
    g.push(act('Check the boxes marked X. Leave the rest empty.'));
    g.push({ t: 'table', cols: [['', 3.2], ['Short Term 1 - 3 Years', 1], ['Mid Range 3 - 7 Years', 1], ['Long Term 7+ Years', 1]], center: [1, 2, 3],
      rows: M.GOALS.map((x) => [GOAL_TXT[x.k], X(c.goals[x.k].s), X(c.goals[x.k].m), X(c.goals[x.k].l)]) });
    if (c.customGoals.length) {
      g.push(sub('Their own goals'));
      g.push(act('Click "Add Other Goal" once for each row. Type it in the Other: box, then check the boxes.'));
      g.push({ t: 'table', cols: [['Other:', 3.2], ['Short Term 1 - 3 Years', 1], ['Mid Range 3 - 7 Years', 1], ['Long Term 7+ Years', 1]], center: [1, 2, 3],
        rows: c.customGoals.map((x) => [x.t, X(x.s), X(x.m), X(x.l)]) });
    }
    g.push(act('Click Next.'));
    S.push({ title: 'Goals and Dreams', menu: 'Goals and Dreams', items: g });

    /* 4. Cash Flow */
    const cf = [];
    cf.push(sub('Income tab: Regular Income'));
    if (c.incomes.length) {
      cf.push(act('Click "Add an income", type the row, click Save Income. Repeat for each one.'));
      cf.push({ t: 'table', cols: [['Owner/Recipient', 1.1], ['Source', 1.6], ['Gross Amount', 1], ['Frequency', 1.2]],
        rows: c.incomes.map((x) => [nm[x.owner], x.source, typ(x.amount), FREQ_TXT[x.freq] || 'Monthly x12']) });
      cf.push(chk(`Monthly income: ${usd(k.income)}`));
    } else { cf.push(kv('Income', 'Ask them', 'ask', 'No income on the intake.')); ask.push('Income (take-home pay and how often)'); }
    cf.push(sub('Income tab: Income Taxes'));
    cf.push(kv('Current estimated combined tax rate', '0 %', 'type', 'MyWFG starts at 22. Change it to 0. The intake pay is take-home, so taxes are already out.'));
    cf.push(kv('Did you receive a tax refund last filing?', 'No', 'leave', 'Not on the intake. Leave No unless they told you.'));
    cf.push(kv('Did you have to pay taxes at your last filing?', 'No', 'leave', 'Not on the intake. Leave No unless they told you.'));
    cf.push(sub('Expenses tab: Cash Flow Expenses'));
    const exp = num(c.expenses.other.amt);
    if (!exp) ask.push('Monthly expenses');
    cf.push({ t: 'table', cols: [['', 2.2], ['Amount', 1], ['Discretionary', 1]], center: [2],
      rows: EXP_TXT.map(([key, label]) => {
        const v = num(c.expenses[key] && c.expenses[key].amt);
        return [label, v ? typ(v) : (key === 'other' ? { v: 'Ask them', how: 'ask' } : { v: '0', how: 'leave' }), { v: 'Leave unchecked', how: 'leave' }];
      }) });
    if (exp) cf.push(act('The intake has one total, so it all goes on Other Monthly Expenses. Type it in the box next to the line, not in the + list.'));
    cf.push(act('Click Next.'));
    S.push({ title: 'Cash Flow', menu: 'Cash Flow', items: cf });

    /* 5. Debt Management */
    const d = [];
    if (c.debts.length) {
      d.push(act('Click "Add a Debt", type the row, click Save. Repeat for each one.'));
      d.push({ t: 'table', cols: [['Type', 1], ['Description', 1.3], ['Original Loan Term in years', 0.9], ['Current Balance', 0.9], ['Interest Rate', 0.75], ['Current Actual Payment', 0.9], ['Minimum Payment', 0.9]],
        rows: c.debts.map((x) => [x.type, x.desc, { v: 'blank', how: 'leave' }, typ(x.bal), num(x.rate) ? `${pctT(x.rate)} %` : { v: 'Ask', how: 'ask' }, typ(x.pay), typ(x.min)]) });
      d.push(act('Term is not on the intake. Leave it blank. Minimum Payment is the same as the payment unless they said otherwise.'));
      if (c.debts.some((x) => !num(x.rate))) ask.push('Interest rate on the debts marked Ask');
      d.push(chk(`Total: Current Balance ${usd(k.debtBal)}, Current Actual Payment ${usd(k.debtPay)}`));
    } else d.push(kv('Debts', 'None on the intake', 'leave'));
    d.push(act('Click Next.'));
    S.push({ title: 'Debt Management', menu: 'Debt Management', items: d });

    /* 6. Proper Protection */
    const p = [];
    p.push(sub('Life Insurance Need tab'));
    p.push(kv('Dime / Detail', 'Dime', 'type'));
    p.push(kv('Debts', 'Fills itself from Debt Management', 'leave'));
    p.push(chk(`Total Debts: ${usd(k.nonMortgageDebt)}`));
    const inc = num(c.ins.incomeMonthly);
    p.push(kv('Income: If you or your spouse could not work again, how much income would you need to sustain your current lifestyle? ($ /month)', inc ? typ(inc) : 'Ask them', inc ? 'type' : 'ask', inc ? 'From the intake: the bigger take-home pay. Use their number if they gave one.' : ''));
    p.push(kv('Mortgage: What is your current balance on your home mortgage? 1.', k.mortgageDebt ? typ(k.mortgageDebt) : 'Leave blank', k.mortgageDebt ? 'type' : 'leave', k.mortgageDebt ? 'Same as the Mortgage on Debt Management.' : 'No mortgage on the intake.'));
    p.push(kv('2.', 'Leave blank', 'leave'));
    const edu = num(c.ins.edu);
    p.push(kv('Education: Approximate cost of Education', edu ? typ(edu) : 'Leave blank', edu ? 'type' : 'leave', edu ? `From the intake${c.deps.length ? ` (${c.deps.length} ${c.deps.length === 1 ? 'child' : 'children'})` : ''}.` : ''));
    p.push(chk(`Total protection need: ${usd(k.need)} (Summary tab)`));
    p.push(sub('Existing Policies tab'));
    if (c.policies.length) {
      p.push(act('Click "Add an Insurance Policy >", fill the row, click Save Insurance Policy. Repeat for each one.'));
      const ben = (x) => (c.married ? { v: `${nm[x.insured === 'a' ? 'b' : 'a']}?`, how: 'ask' } : { v: 'Ask', how: 'ask' });
      // "2", "2 years", "3 yrs" become a year; "6 months" is this year; anything else is shown so they can ask
      const yr = (x) => {
        const h2 = (x.had || '').trim(), now = new Date().getFullYear();
        if (/^\d{4}$/.test(h2)) return h2;
        const y2 = /^(\d+)\s*(y|yr|yrs|year|years)?\.?$/i.exec(h2); if (y2) return String(now - +y2[1]);
        if (/^\d+\s*(mo|mos|month|months)\.?$/i.test(h2)) return String(now);
        return { v: h2 ? `had it ${h2}` : 'blank', how: h2 ? 'ask' : 'leave' };
      };
      p.push({ t: 'table', cols: [['Insured', 0.8], ['Owner', 0.8], ['Beneficiary', 0.85], ['Type', 0.95], ['Provider', 1.1], ['Face Amount', 0.9], ['Premium', 0.7], ['Premium Mode', 0.8], ['Policy Year', 0.8]],
        rows: c.policies.map((x) => [nm[x.insured], nm[x.owner], ben(x), x.type, x.provider || { v: 'Employer?', how: 'ask' }, num(x.face) ? typ(x.face) : { v: 'Ask', how: 'ask' }, typ(x.premium), x.mode, yr(x)]) });
      p.push(act('Beneficiary and Policy Year are not on the intake. Ask, or leave the year blank. Work coverage is Group Term.'));
      if (c.policies.some((x) => !num(x.face))) ask.push('Coverage amount on the plans marked Ask');
      p.push(chk(k.people.map((w) => `Still needed for ${nm[w]}: ${usd(k.prot[w].gap)}`).join('   ')));
    } else p.push(kv('Existing Policies', 'None on the intake', 'leave'));
    p.push(act('Click Next.'));
    S.push({ title: 'Proper Protection', menu: 'Proper Protection', items: p });

    /* 7. Asset Accumulation */
    const a = [];
    a.push(sub('Current Savings tab'));
    if (c.assets.length) {
      a.push(act('Click "Add an Asset", type the row, click Add Asset. Repeat for each one.'));
      const yes = (b) => (b ? 'Check' : { v: 'no', how: 'leave' });
      a.push({ t: 'table', cols: [['Name', 1.5], ['Type', 1.1], ['Owner', 0.8], ['Current Value', 0.9], ['Monthly Additions', 0.9], ['For EF', 0.6], ['For R', 0.6]], center: [5, 6],
        rows: c.assets.map((x) => [x.name, ASSET_TXT[x.type] || x.type, nm[x.owner], typ(x.value), num(x.monthly) ? typ(x.monthly) : '0', yes(x.ef), yes(x.ret)]) });
      a.push(act('For EF and For R start checked when the form opens. Uncheck the ones marked no.'));
    } else a.push(kv('Assets', 'None on the intake', 'leave'));
    a.push(sub('Emergency Fund tab'));
    a.push(kv('Use all monthly expenses from cash flow screen', 'Pick this one', 'leave', 'MyWFG picks it already.'));
    a.push(kv('Total Amount of Emergency Fund Needed to provide for Months', typ(c.assume.efMonths), 'leave', 'Comes from Assumptions.'));
    a.push(chk(`Total needed ${usd(k.efTarget)}, Current Savings ${usd(k.efHave)}, Additional needed ${usd(k.efShort)}`));
    a.push(sub('Retirement tab'));
    const R = c.ret;
    a.push(kv(`Expected Retirement Age for ${nm.a}`, typ(R.ageA)));
    if (c.married) a.push(kv(`Expected Retirement Age for ${nm.b}`, typ(R.ageB)));
    k.people.forEach((w) => {
      const age = k.age[w], ra = num(w === 'a' ? R.ageA : R.ageB);
      if (age != null && ra - age <= 1) a.push(warn(`${nm[w]} is ${age} and wants to retire at ${ra}. Check it. MyWFG shows $0 a month to save when retirement is a year away or past.`));
    });
    a.push(kv(`Life Expectancy Age ${nm.a}`, typ(R.lifeA), 'type', 'Not on the intake. 85 is the usual number.'));
    if (c.married) a.push(kv(`Life Expectancy Age ${nm.b}`, typ(R.lifeB), 'type', 'Not on the intake. 85 is the usual number.'));
    a.push(kv('Include Social Security', 'No', 'leave', 'The intake does not ask for a Social Security estimate.'));
    a.push(kv(`Expected Monthly Income During Retirement From Pension And Other Sources: ${nm.a} $`, num(R.pensionA) ? typ(R.pensionA) : 'Leave blank', num(R.pensionA) ? 'type' : 'leave'));
    if (c.married) a.push(kv(`... ${nm.b} $`, num(R.pensionB) ? typ(R.pensionB) : 'Leave blank', num(R.pensionB) ? 'type' : 'leave'));
    a.push(kv('Monthly Retirement Need', 'Specified amount', 'type'));
    const need = num(R.needAmt);
    const iw = R.intakeWant || {};
    a.push(kv('$', need ? typ(need) : 'Ask them', need ? 'type' : 'ask', c.married && num(iw.a) && num(iw.b) ? `The intake had ${usd(iw.a)} for ${nm.a} and ${usd(iw.b)} for ${nm.b}. This is the two added together.` : ''));
    if (!need) ask.push('Monthly income they want in retirement');
    if (c.married && num(iw.a) && num(iw.a) === num(iw.b)) a.push(warn(`Both said ${usd(iw.a)} a month. Ask: is that each, or together? If together, type ${typ(iw.a)}.`));
    if (need > 30000) a.push(warn(`${usd(need)} a month is a lot. Make sure it was not a yearly number.`));
    a.push(chk(`Needed at retirement ${usd(k.ret.needAtStart)}, shortfall ${usd(k.ret.shortfall)} (Summary tab)`));
    a.push(act('Click Next.'));
    S.push({ title: 'Asset Accumulation', menu: 'Asset Accumulation', items: a });

    /* 8. Print Options */
    const po = [];
    if (c.married) po.push(kv('Print Spouse Full Names on Cover page', 'Yes', 'leave', 'MyWFG picks Yes already.'));
    po.push(kv('Sections To Include', 'All of them selected', 'type', `If any are not highlighted: click Goals and Dreams, hold Shift, click Next Steps.${c.married ? '' : ' Proper Protection Client B can stay in; it prints nothing for one person.'}`));
    po.push(act('Click Generate Report. That PDF is the one the client gets.'));
    S.push({ title: 'Print Options', menu: 'Print Options', items: po });

    /* left over: things on the intake MyWFG has no box for */
    const extra = [];
    const email = T(st, 'Email'); if (email) extra.push(['Email', email]);
    if (c.will) extra.push(['Will', c.will]);
    if (c.trust) extra.push(['Trust', c.trust]);
    if (c.notes) extra.push(['Notes and recommendations', c.notes]);
    return { screens: S, ask, extra, k };
  }

  /* ---------- PDF (pdf-lib, letter size) ---------- */
  const C = {
    ink: [0.086, 0.149, 0.169], mut: [0.337, 0.404, 0.427], dim: [0.54, 0.592, 0.612], line: [0.863, 0.886, 0.894],
    tea: [0.055, 0.486, 0.478], teabg: [0.886, 0.941, 0.937], rst: [0.753, 0.341, 0.243], rstbg: [0.973, 0.922, 0.906], white: [1, 1, 1],
  };
  // fonts are WinAnsi only: swap the usual smart characters, drop anything else
  const clean = (s) => String(s == null ? '' : s).normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...')
    .replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e\xa1-\xff]/g, '');

  async function makeEntryPdf(PDFLib, st, hasSpouse) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const c = buildCase(st, hasSpouse);
    const W = walk(c, st);
    const doc = await PDFDocument.create();
    doc.setTitle(clean(`MyWFG Entry Sheet - ${M.fullName(c.a)}`));
    doc.setAuthor('Team RISE');
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
    const col = (a) => rgb(a[0], a[1], a[2]);
    const PW = 612, PH = 792, L = 40, R = 40, TOP = 56, BOT = 50, CW = PW - L - R;
    const who = clean(`${M.fullName(c.a)}${c.married && c.b.first ? ' and ' + c.b.first : ''}`);
    let page, y;

    const width = (t, f, s) => f.widthOfTextAtSize(t, s);
    function wrap(text, f, s, w) {
      const out = [];
      for (const para of clean(text).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const tryL = line ? line + ' ' + word : word;
          if (width(tryL, f, s) <= w) { line = tryL; continue; }
          if (line) out.push(line);
          // a single word longer than the box gets cut
          let wd = word;
          while (width(wd, f, s) > w && wd.length > 1) { let n = wd.length - 1; while (n > 1 && width(wd.slice(0, n), f, s) > w) n--; out.push(wd.slice(0, n)); wd = wd.slice(n); }
          line = wd;
        }
        out.push(line);
      }
      return out.length ? out : [''];
    }
    const text = (t, x, yy, f, s, c2) => page.drawText(clean(t), { x, y: yy, font: f, size: s, color: col(c2) });
    const box = (x, yy, w, h, fill, stroke) => page.drawRectangle({ x, y: yy, width: w, height: h, color: fill ? col(fill) : undefined, borderColor: stroke ? col(stroke) : undefined, borderWidth: stroke ? 0.8 : 0 });
    const tick = (x, yy) => box(x, yy, 8, 8, null, C.dim);

    function newPage() {
      page = doc.addPage([PW, PH]);
      text('MyWFG Entry Sheet', L, PH - 30, bold, 9, C.tea);
      const r = who || 'New client';
      text(r, PW - R - width(clean(r), reg, 9), PH - 30, reg, 9, C.mut);
      page.drawLine({ start: { x: L, y: PH - 38 }, end: { x: PW - R, y: PH - 38 }, thickness: 0.6, color: col(C.line) });
      y = PH - TOP;
    }
    const room = (h) => { if (y - h < BOT) { newPage(); return true; } return false; };

    /* cover block */
    newPage();
    text('MyWFG Entry Sheet', L, y - 18, bold, 22, C.ink); y -= 30;
    const meta = [who, T(st, 'DATE') && `Intake ${T(st, 'DATE')}`, T(st, 'TRAINEE') && `Trainee ${T(st, 'TRAINEE')}`].filter(Boolean).join('   |   ');
    text(meta, L, y - 10, reg, 10, C.mut); y -= 26;
    const how = ['Open MyWFG > FNA > Create an FNA case. Go screen by screen, top to bottom, in the order of this sheet.',
      'Type what is in bold. Tick the little box as you go.',
      'Gray means leave what MyWFG already shows. Red means you need to ask the client.'];
    const hl = how.flatMap((h2, i) => wrap(`${i + 1}. ${h2}`, reg, 9.5, CW - 24));
    const hh = hl.length * 13 + 16;
    box(L, y - hh, CW, hh, C.teabg);
    hl.forEach((l, i) => text(l, L + 12, y - 16 - i * 13, reg, 9.5, C.ink)); y -= hh + 12;
    if (W.ask.length) {
      const al = W.ask.flatMap((a) => wrap(`- ${a}`, reg, 9.5, CW - 24));
      const ah = al.length * 13 + 30;
      box(L, y - ah, CW, ah, C.rstbg);
      text('Ask before you start typing', L + 12, y - 16, bold, 10, C.rst);
      al.forEach((l, i) => text(l, L + 12, y - 30 - i * 13, reg, 9.5, C.ink)); y -= ah + 12;
    }

    /* items */
    const LW = 232; // label column
    const VX = L + 14 + LW + 10, VW = PW - R - VX;
    function drawKv(it) {
      const lf = reg, ls = 9.5;
      const vf = it.how === 'leave' ? ital : bold, vs = 10, vc = it.how === 'ask' ? C.rst : it.how === 'leave' ? C.dim : C.ink;
      const ll = wrap(it.label, lf, ls, LW), vl = wrap(it.value, vf, vs, VW), nl = it.note ? wrap(it.note, reg, 8, VW) : [];
      const h = Math.max(ll.length * 12, vl.length * 12.5 + nl.length * 10) + 7;
      room(h);
      tick(L, y - 10);
      ll.forEach((l, i) => text(l, L + 14, y - 9 - i * 12, lf, ls, C.mut));
      vl.forEach((l, i) => text(l, VX, y - 9 - i * 12.5, vf, vs, vc));
      nl.forEach((l, i) => text(l, VX, y - 9 - vl.length * 12.5 - i * 10 + 1, reg, 8, C.dim));
      y -= h;
      page.drawLine({ start: { x: L + 14, y: y + 3 }, end: { x: PW - R, y: y + 3 }, thickness: 0.4, color: col(C.line) });
    }
    function drawTable(it) {
      const tot = it.cols.reduce((a, x) => a + x[1], 0);
      const x0 = L + 14, tw = CW - 14;
      const ws = it.cols.map((x) => (x[1] / tot) * tw);
      const xs = ws.map((_, i) => x0 + ws.slice(0, i).reduce((a, b) => a + b, 0));
      const pad = 4, fs = 8.6;
      const center = new Set(it.center || []);
      const head = () => {
        const hl2 = it.cols.map((x, i) => wrap(x[0], bold, 7.6, ws[i] - pad * 2));
        const hh2 = Math.max(...hl2.map((l) => l.length)) * 9 + 8;
        room(hh2 + 20);
        box(x0, y - hh2, tw, hh2, C.teabg);
        hl2.forEach((ls2, i) => ls2.forEach((l, j) => text(l, center.has(i) ? xs[i] + (ws[i] - width(l, bold, 7.6)) / 2 : xs[i] + pad, y - 10 - j * 9, bold, 7.6, C.tea)));
        y -= hh2;
      };
      head();
      for (const row of it.rows) {
        const cells = row.map((v, i) => {
          const o = v && typeof v === 'object' ? v : { v: v == null ? '' : String(v), how: 'type' };
          const f = o.how === 'leave' ? ital : bold;
          return { lines: wrap(o.v, f, fs, ws[i] - pad * 2), f, c2: o.how === 'ask' ? C.rst : o.how === 'leave' ? C.dim : C.ink };
        });
        const h = Math.max(...cells.map((x) => x.lines.length)) * 11 + 8;
        if (room(h)) head();
        tick(L, y - 12);
        cells.forEach((x, i) => x.lines.forEach((l, j) => text(l, center.has(i) ? xs[i] + (ws[i] - width(l, x.f, fs)) / 2 : xs[i] + pad, y - 12 - j * 11, x.f, fs, x.c2)));
        y -= h;
        page.drawLine({ start: { x: x0, y }, end: { x: x0 + tw, y }, thickness: 0.4, color: col(C.line) });
      }
      y -= 6;
    }
    function drawNote(t2, f, s, c2, fill, indent = 14) {
      const ls2 = wrap(t2, f, s, CW - indent - (fill ? 16 : 0));
      const h = ls2.length * (s + 3) + (fill ? 10 : 4);
      room(h + 2);
      if (fill) box(L + indent, y - h, CW - indent, h, fill);
      ls2.forEach((l, i) => text(l, L + indent + (fill ? 8 : 0), y - s - (fill ? 4 : 1) - i * (s + 3), f, s, c2));
      y -= h + 4;
    }

    W.screens.forEach((sc, i) => {
      // start each screen with its header, and keep the header with the first rows
      if (y - 120 < BOT) newPage(); else y -= 8;
      box(L, y - 26, CW, 26, C.tea);
      text(`SCREEN ${i + 1} OF ${W.screens.length}`, L + 10, y - 17, bold, 8, C.teabg);
      text(sc.title, L + 96, y - 18, bold, 13, C.white);
      const m = `Left menu: ${sc.menu}`;
      text(m, PW - R - 10 - width(m, reg, 8.5), y - 17, reg, 8.5, C.teabg);
      y -= 34;
      for (const it of sc.items) {
        if (it.t === 'sub') { room(30); y -= 4; text(it.text, L, y - 10, bold, 10.5, C.ink); y -= 16; }
        else if (it.t === 'kv') drawKv(it);
        else if (it.t === 'table') drawTable(it);
        else if (it.t === 'do') drawNote(it.text, ital, 8.8, C.tea, null);
        else if (it.t === 'check') drawNote(`MyWFG should show: ${it.text}`, reg, 8.6, C.mut, [0.953, 0.961, 0.965]);
        else if (it.t === 'warn') drawNote(it.text, bold, 8.8, C.rst, C.rstbg);
      }
    });

    if (W.extra.length) {
      if (y - 80 < BOT) newPage(); else y -= 10;
      box(L, y - 26, CW, 26, C.mut);
      text('From the intake, no box in MyWFG', L + 10, y - 18, bold, 12, C.white);
      y -= 34;
      W.extra.forEach(([label, value]) => drawKv({ label, value, how: 'type' }));
    }

    // footer on every page
    const pages = doc.getPages();
    pages.forEach((pg, i) => {
      page = pg;
      text('Typing guide for MyWFG only. Not a client document. Not WFG approved. Shred it once the case is in MyWFG.', L, 26, reg, 7.5, C.dim);
      const pn = `Page ${i + 1} of ${pages.length}`;
      text(pn, PW - R - width(pn, reg, 7.5), 26, reg, 7.5, C.dim);
    });
    return doc.save();
  }

  root.FNAEntry = { buildCase, walk, makeEntryPdf, clean };
})(typeof window !== 'undefined' ? window : globalThis);
