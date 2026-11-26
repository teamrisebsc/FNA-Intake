/* Quick Capture: turns a sentence typed during the meeting into field updates.
   parse(text, ctx) -> { who, actions:[{key,value,label,mode}], fallback }
   ctx = { state, speaker:'p'|'s', hasSpouse, names:{p,s}, sex:{p,s} }
   Pure function: nothing is written until the app applies the actions. */
(function (root) {
  const F = root.FNA;
  const sp = F.sp;

  const cap = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const NEG = /\b(no|not|none|nope|don'?t|doesn'?t|never|without|isn'?t|aren'?t|hasn'?t|haven'?t|zero)\b|n't\b/;
  const MONTHW = /\b(a month|per month|monthly|\/\s?mo|a mo|each month|every month|month)\b/;

  function numbers(t) {
    const clean = t
      .replace(/401\s*\(?k\)?|403\s*\(?b\)?|\b457\s*\(?b?\)?/g, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
      .replace(/\b\d\s*(?:'|’|ft|feet|foot)\s*\d{0,2}\s*(?:"|”|in\b|inches)?/g, ' ');
    const out = [];
    const re = /\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k\b|m\b|mil\b|million\b|thousand\b|grand\b)?\s*(%|percent\b)?/g;
    let m;
    while ((m = re.exec(clean))) {
      let v = Number(m[1].replace(/,/g, ''));
      const suf = (m[2] || '').trim();
      if (suf === 'k' || suf === 'thousand' || suf === 'grand') v *= 1e3;
      if (suf === 'm' || suf === 'mil' || suf === 'million') v *= 1e6;
      out.push({ v, pct: !!m[3], at: m.index, raw: m[0].trim() });
    }
    return out;
  }
  const money = (n) => F.fmt(n);
  const pctStr = (n) => String(Math.round(n * 100) / 100);

  function detectWho(t, ctx) {
    const other = ctx.speaker === 'p' ? 's' : 'p';
    const first = (n) => (n || '').trim().split(/\s+/)[0].toLowerCase();
    const pn = first(ctx.names.p), sn = first(ctx.names.s);
    if (/\bmy (wife|husband|spouse|partner|hubby|fianc[eé]e?)\b/.test(t)) return other;
    if (sn && new RegExp(`\\b${sn}\\b`).test(t)) return 's';
    if (pn && new RegExp(`\\b${pn}\\b`).test(t)) return 'p';
    if (/\b(spouse|wife|husband|partner|hubby|wifey)\b/.test(t)) return 's';
    if (/\b(prospect|client)\b/.test(t)) return 'p';
    if (/\b(i|i'm|im|my|me|mine)\b/.test(t)) return ctx.speaker;
    const she = /\b(she|her|hers)\b/.test(t), he = /\b(he|him|his)\b/.test(t);
    if (she !== he) {
      const g = she ? 'F' : 'M';
      if (ctx.sex.s === g && ctx.sex.p !== g) return 's';
      if (ctx.sex.p === g && ctx.sex.s !== g) return 'p';
    }
    return ctx.speaker;
  }

  const CARRIERS = ['state farm', 'northwestern mutual', 'northwestern', 'primerica', 'transamerica', 'nationwide', 'prudential', 'metlife', 'new york life', 'mass mutual', 'massmutual', 'allstate', 'aig', 'corebridge', 'pacific life', 'lincoln', 'john hancock', 'globe life', 'farmers', 'usaa', 'f&g', 'national life', 'american general', 'mutual of omaha', 'banner', 'protective', 'principal', 'guardian', 'securian', 'symetra', 'brighthouse', 'aflac', 'colonial', 'gerber', 'haven life', 'ladder', 'policygenius', 'zander', 'everlake'];
  const DEBTS = [
    [/\b(car|auto|truck|vehicle|suv|tesla)\b/, 'Car loan'], [/\bstudent\b/, 'Student loan'], [/\b(credit card|cc|credit cards|visa|amex|mastercard|discover)\b/, 'Credit card'],
    [/\bheloc\b|home equity/, 'HELOC'], [/\bmedical\b/, 'Medical debt'], [/\b(boat|rv|camper|motorcycle|jet ?ski)\b/, null], [/\bpersonal loan\b/, 'Personal loan'],
    [/\b(furniture|affirm|klarna|financing)\b/, null], [/\b(tax|irs)\b/, 'Tax debt'], [/\bloan\b/, 'Loan'],
  ];

  function parse(text, ctx) {
    const orig = String(text || '').trim();
    const t = ' ' + orig.toLowerCase().replace(/[’]/g, "'") + ' ';
    const res = { who: 'p', actions: [], fallback: false, orig };
    if (!orig) return res;
    const st = ctx.state;
    let who = detectWho(t, ctx);
    if (!ctx.hasSpouse) who = 'p';
    res.who = who;
    const W = ctx.names[who] ? ctx.names[who].split(/\s+/)[0] : (who === 's' ? 'Spouse' : 'Prospect');
    const A = (key, value, label, mode = 'set') => res.actions.push({ key, value, label, mode, who });
    const nums = numbers(t);
    const amts = nums.filter((n) => !n.pct);
    const pcts = nums.filter((n) => n.pct);
    const big = () => amts.reduce((a, n) => (n.v > a ? n.v : a), 0);
    const neg = NEG.test(t);
    const yesno = () => (neg ? 'N' : 'Y');
    const k = (name) => sp(name, who);

    // 1. email
    const em = orig.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (em) { A(F.HEADER.email, em[0], 'Email'); return res; }

    // 1b. personal introductions: "intro Sarah, his sister, new job" / "partner Mike, coworker, great at sales"
    const ik = orig.match(/^\s*(intro(?:duction)?s?|partner|business partner)\b[\s:,-]*(.+)$/i);
    if (ik) {
      const bits = ik[2].split(/\s*,\s*/).filter(Boolean);
      const [name, how, ...rest] = bits;
      const why = rest.join(', ');
      if (/partner/i.test(ik[1])) {
        A(F.PARTNER.name, cap(name), 'Business partner · Name');
        if (how) A(F.PARTNER.how, how, 'Business partner · How they know them');
        if (why) A(F.PARTNER.why, why, 'Business partner · Why');
        return res;
      }
      const filled = (r) => [r.name, r.how, r.why].some((x) => String(st[x] || '').trim());
      const row = F.INTRO_ROWS.find((r) => !filled(r));
      if (!row) { res.actions.push({ key: F.NOTES[0], value: `Introduction: ${ik[2]}`, label: 'Notes (all 10 intro lines full)', mode: 'append', who }); return res; }
      const n = F.INTRO_ROWS.indexOf(row) + 1;
      A(row.name, cap(name), `Introduction ${n} · Name`);
      if (how) A(row.how, how, `Introduction ${n} · How they know them`);
      if (why) A(row.why, why, `Introduction ${n} · Why`);
      const ev = /\b(new job|changed jobs?|job change|left (his|her|their|a|the)? ?job|401|old job|laid off)\b/.test(t) ? 'Changed jobs'
        : /\bretir/.test(t) ? 'Retiring'
        : /\b(bonus|raise|promot)/.test(t) ? 'Bonus or raise'
        : /\binherit/.test(t) ? 'Inheritance'
        : /\b(business|startup|start up|llc|own shop)\b/.test(t) ? 'Starting a business'
        : st[row.event] || 'Came to mind';
      A(row.event, ev, `Introduction ${n} · Event`);
      return res;
    }

    // 2. return appointment
    if (/\b(return|follow ?up|next meeting|come back|meet again|step 2|second meeting|see you|back together)\b/.test(t) && /(\d{1,2}\/\d{1,2}|\d{1,2}(:\d{2})?\s*(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)/.test(t)) {
      const d = parseDay(t);
      if (d) A(F.RETURN.date[0], d, 'Return date');
      const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
      if (tm) {
        A(F.RETURN.hour, String(+tm[1]), 'Return time (hour)');
        A(F.RETURN.min, tm[2] || '00', 'Return time (min)');
        A(F.RETURN.ampm[0], tm[3] ? tm[3].toUpperCase() : (+tm[1] >= 7 && +tm[1] <= 11 ? 'AM' : 'PM'), 'AM / PM');
      }
      const tz = t.match(/\b(eastern|central|mountain|pacific|alaska|hawaii)\b/);
      if (tz) A('Eastern', cap(tz[1]), 'Time zone');
      if (res.actions.length) return res;
    }

    // 3. date of birth
    const dob = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (dob && /\b(born|dob|birthday|birth)\b/.test(t) && !/\b(son|daughter|kid|child|baby)\b/.test(t)) {
      A(who === 's' ? F.PEOPLE[1].dob[0] : F.PEOPLE[0].dob[0], normDate(dob), `${W} · Date of birth`);
      return res;
    }

    // 4. kids
    const kid = t.match(/\b(son|daughter|kid|child|baby|stepson|stepdaughter|boy|girl)\b/);
    if (kid && !/\b(college|529|education)\b/.test(t)) {
      const rows = F.PEOPLE.slice(2);
      const pf = (ctx.names.p || '').split(' ')[0].toLowerCase(), sf = (ctx.names.s || '').split(' ')[0].toLowerCase();
      let name = (orig.match(/(?:named|name is|called)\s+([A-Z][a-zA-Z'-]+)/) || [])[1];
      if (!name) {
        const caps = orig.match(/\b[A-Z][a-z]+\b/g) || [];
        name = caps.find((w) => !/^(Son|Daughter|Kid|Kids|Child|Baby|Boy|Girl|He|She|His|Her|They|Their|And|The|Age|Born|Spouse|Wife|Husband|Prospect|Stepson|Stepdaughter|Our|My|Has|Have|One|Two|Three)$/.test(w) && w.toLowerCase() !== pf && w.toLowerCase() !== sf) || '';
      }
      let row = name ? rows.find((r) => (st[r.name] || '').toLowerCase().startsWith(name.toLowerCase())) : null;
      if (!row) row = rows.find((r) => !(st[r.name] || '').trim());
      if (!row) { res.actions.push({ key: F.NOTES[0], value: `Another child: ${orig}`, label: 'Notes (all 4 dependent rows full)', mode: 'append', who }); return res; }
      const label = `Dependent ${rows.indexOf(row) + 1}`;
      if (name) A(row.name, name, `${label} · Name`);
      else if (!(st[row.name] || '').trim()) A(row.name, cap(kid[1]), `${label} · Name`);
      if (/\b(son|stepson|boy)\b/.test(t)) A(row.sex, 'M', `${label} · M/F`);
      if (/\b(daughter|stepdaughter|girl)\b/.test(t)) A(row.sex, 'F', `${label} · M/F`);
      if (dob) A(row.dob[0], normDate(dob), `${label} · DOB`);
      const ag = t.match(/\b(\d{1,2})\s*(?:years? old|yrs? old|y\/?o|years?)\b/) || t.match(/\bage\s*(\d{1,2})\b|\bis\s+(\d{1,2})\b|\b(\d{1,2})\s*$/);
      if (ag && !dob) A(row.age, ag[1] || ag[2] || ag[3], `${label} · Age`);
      return res;
    }

    // 5. names
    const nameM = orig.match(/(?:name is|named|called|name's)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/);
    if (nameM && /\b(spouse|wife|husband|partner|name)\b/.test(t)) {
      A(who === 's' ? F.PEOPLE[1].name : F.PEOPLE[0].name, nameM[1], `${who === 's' ? 'Spouse' : 'Prospect'} · Name`);
      return res;
    }

    // 6. retirement goals
    const retAge = t.match(/retire\w*\s+(?:at|by|around|before)\s+(?:age\s+)?(\d{2})\b/) || t.match(/retire\w*.{0,15}\bage\s*(\d{2})\b/) || t.match(/\b(\d{2})\b.{0,12}retire/);
    const isAcct = /401|403|457|\bira\b|roth|\btsp\b|pension|\bsep\b/.test(t);
    if (/retire/.test(t) && !isAcct && (retAge || (amts.length && MONTHW.test(t)))) {
      if (retAge) A(k(F.RET.age), retAge[1], `${W} · Retire at age`);
      const m = amts.filter((n) => !retAge || String(n.v) !== retAge[1]);
      if (m.length && (MONTHW.test(t) || /income|coming in|need|want|live on/.test(t))) A(k(F.RET.monthly), money(Math.max(...m.map((n) => n.v))), `${W} · Wants per month in retirement`);
      if (res.actions.length) return res;
    }

    // 7. mortgage
    if (/\b(mortgage|house payment|home loan)\b/.test(t)) { debtRow(F.DEBT_ROWS[0], 'Mortgage', true); return res; }

    // 8. retirement accounts
    const rowFor = () => {
      if (/401\s*\(?k/.test(t)) return F.RET_ROWS[0];
      if (/403\s*\(?b/.test(t)) return F.RET_ROWS[1];
      if (/\b457/.test(t)) return F.RET_ROWS[2];
      return null;
    };
    const oldAcct = /\b(old|former|previous|last job|old job|rollover|left|prior)\b/.test(t);
    const pension = /\bpension\b/.test(t);
    if (pension) {
      const yrs = t.match(/(\d{1,2})\s*(?:years?|yrs?)\b/);
      if (yrs) A(k(F.RET.pension.yrs), yrs[1], `${W} · Pension years of service`);
      const m = amts.filter((n) => !yrs || n.v !== +yrs[1]);
      if (m.length) A(k(F.RET.pension.monthly), money(m[0].v), `${W} · Monthly pension`);
      const adm = orig.match(/(?:with|from|through|at)\s+([A-Z][\w&.']*(?:\s+[A-Z][\w&.']*)*)/);
      if (adm) A(k(F.RET.pension.admin), adm[1].trim(), `${W} · Pension administrator`);
      if (res.actions.length) return res;
    }
    let r = rowFor();
    if (!r && /\bmatch(es|ing)?\b/.test(t) && (pcts.length || amts.length) && !/\b(loan|card|insurance)\b/.test(t)) {
      r = F.RET_ROWS.find((row) => (st[k(row.bal)] || '').trim()) || F.RET_ROWS[0];
    }
    const iraLike = t.match(/\b(roth ira|roth 401k|roth|traditional ira|rollover ira|sep ira|simple ira|ira|tsp|403b|hsa)\b/);
    if ((r || iraLike) && oldAcct && amts.length) {
      const slot = F.RET.old.find((o) => !(st[k(o.emp)] || '').trim() && !(st[k(o.bal)] || '').trim()) || F.RET.old[0];
      const emp = (orig.match(/(?:at|from|with)\s+([A-Z][\w&.']*(?:\s+[A-Z][\w&.']*)*)/) || [])[1];
      const kind = r ? r.label : cap(iraLike[1]);
      A(k(slot.emp), emp ? `${emp.trim()} (${kind})` : kind, `${W} · Old account`);
      A(k(slot.bal), money(big()), `${W} · Old account balance`);
      return res;
    }
    if (r || (iraLike && !/roth/.test(iraLike[1]))) {
      const row = r || F.RET_ROWS[3];
      const lbl = r ? r.label : cap(iraLike[1]).toUpperCase().replace('TRADITIONAL IRA', 'Traditional IRA');
      if (!r) A(k(row.type), lbl.length <= 6 ? lbl : lbl, `${W} · Account type`);
      if (/\bmatch/.test(t)) {
        if (pcts.length) A(k(row.mpct), pctStr(pcts[0].v), `${W} · ${lbl} match %`);
        else if (amts.length) A(k(row.mamt), money(amts[0].v), `${W} · ${lbl} match $`);
        if (/contribut|puts? in|puts? away|defer|saves?/.test(t)) {
          const c = pcts[1] || null; if (c) A(k(row.cpct), pctStr(c.v), `${W} · ${lbl} contribution %`);
        }
        return res;
      }
      if (/contribut|puts? in|puts? away|defer|saves?|putting/.test(t) && (pcts.length || amts.some((n) => n.v < 5000))) {
        const balN = amts.find((n) => n.v >= 5000);
        if (balN) A(k(row.bal), money(balN.v), `${W} · ${lbl} balance`);
        if (pcts.length) A(k(row.cpct), pctStr(pcts[0].v), `${W} · ${lbl} contribution %`);
        else A(k(row.camt), money(amts.find((n) => n.v < 5000).v), `${W} · ${lbl} contribution $`);
        return res;
      }
      if (amts.length) { A(k(row.bal), money(big()), `${W} · ${lbl} balance`); if (pcts.length) A(k(row.cpct), pctStr(pcts[0].v), `${W} · ${lbl} contribution %`); return res; }
    }
    if (iraLike && /roth/.test(iraLike[1])) {
      A(k(F.RET.taxFree), `${cap(iraLike[1]).replace('Ira', 'IRA')}${amts.length ? ' $' + money(big()) : ''}`, `${W} · Tax free accounts`, 'append');
      return res;
    }
    if (/\b(brokerage|stocks?|crypto|bitcoin|annuity|cd\b|cds\b|money market|mutual funds?|robinhood|acorns|529|hsa|whole life cash)\b/.test(t) && amts.length) {
      const what = t.match(/\b(brokerage|stocks?|crypto|bitcoin|annuity|cds?|money market|mutual funds?|robinhood|acorns|529|hsa|whole life cash)\b/)[1];
      A(k(F.RET.other), `${cap(what)} $${money(big())}`, `${W} · Other accounts`, 'append');
      return res;
    }

    // 9. bank accounts
    if (/\bchecking\b/.test(t) && amts.length) {
      A(k(F.RET.checking), money(amts[0].v), `${W} · Checking`);
      if (/savings/.test(t) && amts[1]) A(k(F.RET.savings), money(amts[1].v), `${W} · Savings`);
      return res;
    }
    if (/\b(in savings|savings account|savings of|emergency fund|savings)\b/.test(t) && amts.length && !pcts.length && !/\b(goal|save \d|month)\b/.test(t)) {
      A(k(F.RET.savings), money(big()), `${W} · Savings`);
      return res;
    }

    // 10. paycheck
    const freq =
      /every (two|2|other) weeks?|bi-?weekly|every other (week|friday)|biweekly/.test(t) ? 'b'
        : /twice a month|semi-?monthly|1st and (the )?15th|15th and/.test(t) ? 's'
          : /\b(weekly|every week|a week|per week|each week)\b/.test(t) ? 'w'
            : /\b(paid|paycheck|take home|takes home|brings? home|net|makes?|earns?|salary|income)\b/.test(t) && MONTHW.test(t) ? 'm' : null;
    const payWords = /\b(paid|paycheck|pay ?check|take home|takes home|brings? home|bring home|net|makes?|making|earns?|salary|income|check|deposit)\b/.test(t);
    const otherInc = t.match(/\b(rental|rent income|side (?:hustle|business|income|gig)|second job|business income|social security|disability|va benefits|child support|alimony|uber|lyft|doordash|instacart|etsy|airbnb|consulting|freelance|commission|bonus|tips)\b/);
    if (freq && !otherInc && (payWords || amts.length) && !/\b(loan|card|insurance|policy|mortgage|rent\b|expenses?)\b/.test(t)) {
      A(k(F.INC.freq[0]), freq, `${W} · How often paid`);
      const key = { b: F.INC.biw, s: F.INC.semi, w: F.INC.week, m: F.INC.month }[freq];
      const lbl = { b: 'Every 2 weeks take home', s: 'Twice a month take home', w: 'Weekly take home', m: 'Monthly take home' }[freq];
      if (amts.length) A(k(key), money(amts[0].v), `${W} · ${lbl}`);
      return res;
    }
    if (otherInc && amts.length) {
      const rows = F.INC.other;
      const name = cap(otherInc[1].replace('rent income', 'rental'));
      const slot = rows.find((o) => (st[k(o.src)] || '').toLowerCase() === name.toLowerCase()) || rows.find((o) => !(st[k(o.src)] || '').trim() && !(st[k(o.amt)] || '').trim()) || rows[1];
      A(k(slot.src), name, `${W} · Other income source`);
      A(k(slot.amt), money(amts[0].v), `${W} · Other income per month`);
      if (/rental|airbnb/.test(t)) A(k(F.INC.passive[0]), 'Y', `${W} · Passive income`);
      return res;
    }
    if (/passive income/.test(t)) { A(k(F.INC.passive[0]), yesno(), `${W} · Passive income`); return res; }

    // 11. debts
    for (const [re, label] of DEBTS) {
      const m = t.match(re);
      if (m && (amts.length || pcts.length) && !/\b(insurance|policy|coverage)\b/.test(t)) {
        const nice = label || cap(m[1] || m[0]);
        const rows = F.DEBT_ROWS.slice(1);
        const row = rows.find((rw) => (st[rw.type] || '').toLowerCase().includes(nice.toLowerCase().split(' ')[0])) || rows.find((rw) => !(st[rw.type] || '').trim() && !(st[rw.bal] || '').trim()) || rows[rows.length - 1];
        debtRow(row, nice, false);
        return res;
      }
    }

    // 12. protection
    const lifeW = /\b(life insurance|life policy|coverage|policy|term|whole life|universal|iul|vul|death benefit|insured)\b/.test(t) || /\b\d\s*(x|times)\s*(salary|pay|income)\b/.test(t);
    if (/\b(long[- ]term care|ltc)\b/.test(t)) {
      A(k(F.PRO.ltc[0]), yesno(), `${W} · Long-term care protection`);
      if (amts.length) {
        const sorted = [...amts].sort((a, b) => b.v - a.v);
        if (MONTHW.test(t) && sorted.length > 1) { A(k(F.PRO.ltcCov), money(sorted[0].v), `${W} · LTC coverage`); A(k(F.PRO.ltcPrem), money(sorted[sorted.length - 1].v), `${W} · LTC monthly cost`); }
        else if (MONTHW.test(t)) A(k(F.PRO.ltcPrem), money(sorted[0].v), `${W} · LTC monthly cost`);
        else A(k(F.PRO.ltcCov), money(sorted[0].v), `${W} · LTC coverage`);
      }
      return res;
    }
    if (lifeW) {
      const viaJob = /\b(work|job|employer|group|through (his|her|my|their) (job|work|employer)|benefits)\b/.test(t);
      if (viaJob && amts.length) {
        const xs = t.match(/(\d)\s*x\b|(\d)\s*times\b/);
        A(k(F.PRO.job), xs ? `${xs[1] || xs[2]}x salary` : money(big()), `${W} · Life coverage through job`);
        return res;
      }
      if (viaJob && neg) { A(k(F.PRO.job), 'None', `${W} · Life coverage through job`); return res; }
      const sorted = [...amts].sort((a, b) => b.v - a.v);
      const yrs = t.match(/(\d{1,2})[\s-]*(?:year|yr)s?\b/);
      const had = /\b(had it|had for|have had|has had|bought it|got it)\b/.test(t);
      const typ = t.match(/\b(term|whole life|whole|universal|iul|vul|variable)\b/);
      if (typ) A(k(F.PRO.type), cap(typ[1]).replace('Iul', 'IUL').replace('Vul', 'VUL'), `${W} · Plan type`);
      if (yrs && !had && /term/.test(t)) A(k(F.PRO.termYrs), yrs[1], `${W} · Term years`);
      if (yrs && had) A(k(F.PRO.howLong), `${yrs[1]} years`, `${W} · Had it for`);
      const car = CARRIERS.find((c) => t.includes(' ' + c));
      if (car) A(k(F.PRO.company), cap(car).replace('Aig', 'AIG').replace('Usaa', 'USAA'), `${W} · Company`);
      const pool = sorted.filter((n) => !yrs || n.v !== +yrs[1]);
      if (pool.length) {
        if (MONTHW.test(t) && pool.length > 1) { A(k(F.PRO.outside), money(pool[0].v), `${W} · Coverage outside job`); A(k(F.PRO.cost), money(pool[pool.length - 1].v), `${W} · Monthly cost`); }
        else if (MONTHW.test(t) || pool[0].v < 2000) A(k(F.PRO.cost), money(pool[0].v), `${W} · Monthly cost`);
        else A(k(F.PRO.outside), money(pool[0].v), `${W} · Coverage outside job`);
      }
      if (!res.actions.length && neg) A(k(F.PRO.outside), 'None', `${W} · Coverage outside job`);
      if (res.actions.length) return res;
    }

    // 13. health (several facts can ride in one line)
    let healthHit = false;
    if (/smok|tobacco|vape|nicotine|cigar|\bdip\b|chew/.test(t)) { A(k(F.PRO.smoke[0]), /non-?smok/.test(t) || neg ? 'N' : 'Y', `${W} · Smokes`); healthHit = true; }
    if (/\b(dui|dwi)s?\b/.test(t)) { A(k(F.PRO.dui[0]), neg ? 'N' : 'Y', `${W} · DUI in 5 years`); healthHit = true; }
    const ht = orig.match(/\b(\d)\s*(?:'|’|ft|feet|foot)\s*(\d{1,2})?/) || (/(tall|height)/.test(t) && t.match(/\b([4-7])\s+(\d{1,2})\b/));
    if (ht) { A(k(F.PRO.ft), ht[1], `${W} · Height (ft)`); if (ht[2]) A(k(F.PRO.inch), ht[2], `${W} · Height (in)`); healthHit = true; }
    const wt = t.match(/\b(\d{2,3})\s*(?:lbs?|pounds)\b/) || t.match(/\bweighs?\s*(\d{2,3})\b/);
    if (wt) { A(k(F.PRO.wt), wt[1], `${W} · Weight`); healthHit = true; }
    const hr = t.match(/\b(?:health|healthy|rate|rating|scale|rates)\D{0,20}?(\d{1,2})(?:\s*(?:\/|out of)\s*10)?\b/) || t.match(/\b(\d{1,2})\s*(?:\/|out of)\s*10\b/);
    if (hr && +hr[1] <= 10) {
      A(k(F.PRO.health), hr[1], `${W} · Health rating`);
      const why = orig.match(/\b(?:because|cuz|since|but)\b\s*(.+)$/i);
      if (why) A(k(F.PRO.healthWhy), why[1], `${W} · Health rating why`);
      healthHit = true;
    }
    if (/\b(medication|meds|prescription|takes|taking|diagnos\w*|blood pressure|diabetes|diabetic|cholesterol|asthma|anxiety|depression|thyroid|adhd|cancer|sleep apnea|statin|metformin|lisinopril|insulin|surgery|heart)\b/.test(t)) {
      A(k(F.PRO.meds[0]), orig, `${W} · Medications / diagnoses`, 'append'); healthHit = true;
    }
    if (healthHit) return res;

    // 14. will / trust
    const will = /\b(no|have|has|got|had|a|without|our|their|his|her|updated|need a)\s+(?:a\s+)?will\b|\bwill and (a )?trust\b|\bwills?\s*(yes|no|y|n)\b/.test(t);
    const trust = /\b(living trust|a trust|no trust|have trust|has trust|trust (yes|no))\b/.test(t);
    if (will || trust) {
      const both = /\b(neither|nor)\b/.test(t) ? 'N' : yesno();
      if (will) A('Will Y', both, 'Has a will');
      if (trust) A('Trust Y', both, 'Has a living trust');
      return res;
    }

    // 15. expenses / budget
    if (/\b(expenses?|spend|spending|bills|outgo|cost of living|go(?:es)? out|household costs?|budget is|burn)\b/.test(t) && amts.length) {
      A(F.EXP.expenses, money(big()), 'Household expenses per month');
      if (/\bbudget\b/.test(t) && !/budget is/.test(t)) A(F.EXP.budget[0], yesno(), 'Keeps a budget');
      return res;
    }
    if (/\bbudget\b/.test(t)) { A(F.EXP.budget[0], yesno(), 'Keeps a budget'); return res; }

    // 16. savings goal
    const sg = t.match(/\b(?:save|saving|set aside|put away|invest|goal)\D{0,25}?(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)/);
    if (sg) {
      const p = +sg[1];
      if (p === 10) A(F.EXP.choice[0], '10', 'Savings goal 10%');
      else if (p > 10) { A(F.EXP.choice[0], 'more', 'Savings goal: more'); A(F.EXP.morePct, pctStr(p), 'Savings goal %'); }
      else { A(F.EXP.choice[0], 'less', 'Savings goal: less'); A(F.EXP.lessPct, pctStr(p), 'Savings goal %'); }
      return res;
    }
    if (/\b(save|saving|set aside|put away|invest)\b/.test(t) && amts.length && MONTHW.test(t)) {
      const comb = F.compute(st, ctx.hasSpouse)[F.EXP.combined];
      if (comb > 0) {
        const p = Math.round((amts[0].v / comb) * 1000) / 10;
        if (p === 10) A(F.EXP.choice[0], '10', 'Savings goal 10%');
        else if (p > 10) { A(F.EXP.choice[0], 'more', `Savings goal: more ($${money(amts[0].v)} is ${p}%)`); A(F.EXP.morePct, pctStr(p), 'Savings goal %'); }
        else { A(F.EXP.choice[0], 'less', `Savings goal: less ($${money(amts[0].v)} is ${p}%)`); A(F.EXP.lessPct, pctStr(p), 'Savings goal %'); }
        return res;
      }
    }
    if (/\b(growing|grows|staying the same|left over)\b/.test(t) && amts.length) { A(F.EXP.growing, money(amts[0].v), 'Bank account grows by'); return res; }

    // 17. employer
    const emp = orig.match(/\b(?:works? (?:at|for)|working (?:at|for)|employed (?:at|by)|employer(?: is)?|job (?:is )?at|teaches at|nurse at)\s+([A-Za-z0-9&.' -]{2,40})/i);
    if (emp) { A(k(F.RET.employer), cap(emp[1].trim().replace(/\s+(and|but|for|since)\b.*$/i, '')), `${W} · Employer`); return res; }

    // 18. goals
    if (/\b(goals?|wants? to|dream|focused on|hoping to|would like to|hope to|plan to|priority)\b/.test(t)) {
      const map = [[/debt|pay off|payoff/, 'Pay off debt'], [/retire/, 'Retirement'], [/house|home|property|real estate|land/, 'Buy Property'], [/legacy|inherit|leave (something|money)/, 'Leaving a Legacy'], [/parents?|mom|dad|family members?|siblings?/, 'Support Fam Mem'], [/save|savings|emergency/, 'Savings']];
      let hit = false;
      for (const [re, key] of map) if (re.test(t)) { A(key, true, `Goal: ${F.GOALS.find((g) => g[0] === key)[1]}`); hit = true; }
      if (/\b(travel|college|business|wedding|car|boat|vacation|church|give|tithe)\b/.test(t)) { A('Other fin goal', true, 'Goal: Other'); A('Other Goals', orig, 'Other goals', 'append'); hit = true; }
      if (hit) return res;
    }

    // 19. age
    const age = t.match(/\b(\d{2})\s*(?:years old|yrs old|y\/o|yo)\b/) || t.match(/\bage\s*(\d{2})\b/);
    if (age) { A(who === 's' ? F.PEOPLE[1].age : F.PEOPLE[0].age, age[1], `${W} · Age`); return res; }

    // nothing matched: keep it in the notes so nothing is lost
    res.fallback = true;
    res.actions.push({ key: F.NOTES[0], value: `${ctx.hasSpouse ? W + ': ' : ''}${orig}`, label: 'Notes', mode: 'append', who });
    return res;

    function debtRow(row, label, isMort) {
      if (!isMort) A(row.type, label, `Debt · Type`);
      const rate = pcts[0] || amts.find((n) => n.v < 30 && /\b(rate|interest|apr)\b/.test(t) && !Number.isInteger(n.v));
      if (rate) A(row.rate, pctStr(rate.v), `${label} · Interest rate`);
      const rest = amts.filter((n) => n !== rate);
      if (!rest.length) return;
      const sorted = [...rest].sort((a, b) => b.v - a.v);
      if (sorted.length > 1) { A(row.bal, money(sorted[0].v), `${label} · Balance`); A(row.pay, money(sorted[sorted.length - 1].v), `${label} · Monthly payment`); }
      else if (MONTHW.test(t) || /\bpayment\b/.test(t)) A(row.pay, money(sorted[0].v), `${label} · Monthly payment`);
      else A(row.bal, money(sorted[0].v), `${label} · Balance`);
    }
  }

  function normDate(m) {
    let y = m[3];
    if (y.length === 2) { const n = 2000 + +y; y = String(n > new Date().getFullYear() ? n - 100 : n); }
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  function parseDay(t) {
    const d = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    const now = new Date();
    if (d) return normDate([0, d[1], d[2], d[3] || String(now.getFullYear())]);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let target = null;
    if (/\btomorrow\b/.test(t)) target = new Date(now.getTime() + 864e5);
    const dn = days.findIndex((x) => t.includes(x));
    if (dn >= 0) { let add = (dn - now.getDay() + 7) % 7 || 7; if (/\bnext\b/.test(t) && add < 7) add += 0; target = new Date(now.getTime() + add * 864e5); }
    if (!target) return '';
    return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}/${target.getFullYear()}`;
  }

  root.FNACapture = { parse, numbers, detectWho };
})(typeof window !== 'undefined' ? window : globalThis);
