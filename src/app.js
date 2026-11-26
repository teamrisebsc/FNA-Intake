/* FNA Intake app. State keys are the real PDF field names (see schema.js). */
(function () {
  const F = window.FNA, sp = F.sp, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; };

  /* ---------- storage (this device only) ---------- */
  const LS = 'fnaIntake.v1';
  let DB = { clients: {}, current: null, agent: '' };
  try { DB = Object.assign(DB, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* private window */ }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { /* ignore */ } };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = () => ({ DATE: today(), TRAINEE: DB.agent || '', _hasSpouse: true, _log: [], _eduPer: String(DB.eduPer || 100000) });
  // opening the link always starts a new intake (Edgar, 11/24); saved clients show in the card at the top
  let CUR = newId();
  let S = blank();
  let speaker = 'p';
  const hasSpouse = () => S._hasSpouse !== false;

  let saveT;
  function save() {
    $('#saveDot').classList.add('busy');
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const empty = Object.keys(S).filter((k) => !k.startsWith('_') && S[k] !== '' && S[k] != null && !['DATE', 'TRAINEE'].includes(k)).length === 0;
      const isNew = !DB.clients[CUR];
      if (!empty || DB.clients[CUR]) { DB.clients[CUR] = { state: S, updated: Date.now() }; DB.current = CUR; }
      if (S.TRAINEE) DB.agent = S.TRAINEE;
      if (S._eduPer) DB.eduPer = F.num(S._eduPer);
      if (!empty) dupCheck(isNew);
      persist();
      $('#saveDot').classList.remove('busy');
    }, 350);
  }

  /* ---------- one person, one saved copy ---------- */
  const keyName = (st) => String(st.PROSPECT || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyDob = (st) => String(st[F.PEOPLE[0].dob[0]] || '').trim();
  // another saved client with the same prospect name (and the same birthday when both have one)
  function twinOf(st, id) {
    const n = keyName(st); if (!n) return null;
    const hit = Object.entries(DB.clients).find(([k, c]) => k !== id && keyName(c.state) === n && (!keyDob(st) || !keyDob(c.state) || keyDob(st) === keyDob(c.state)));
    return hit ? hit[0] : null;
  }
  let dupWarned = '';
  function dupCheck() {
    const tw = twinOf(S, CUR); if (!tw || dupWarned === CUR + '|' + tw) return;
    dupWarned = CUR + '|' + tw;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="ttl">Already saved</div><ul><li>${esc(DB.clients[tw].state.PROSPECT)} is already in your clients. Keep working there so you do not end up with two copies.</li></ul><div class="acts"><button class="btn sm" data-a="open">Open the saved one</button><button class="btn sm ghost" data-a="keep">Keep both</button></div>`;
    $('#toasts').appendChild(el);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'open') {
        // move anything typed here onto the saved one, then drop this copy
        const keep = DB.clients[tw].state;
        for (const [k, v] of Object.entries(S)) if (!k.startsWith('_') && v !== '' && v != null && (keep[k] === undefined || keep[k] === '')) keep[k] = v;
        delete DB.clients[CUR]; persist(); loadClient(tw);
      }
      el.classList.add('out'); setTimeout(() => el.remove(), 360);
    });
  }

  /* ---------- field builders ---------- */
  const REG = []; let SEC = ''; let SECNAME = '';
  const reg = (key, label, who) => { if (label) REG.push({ key, label, who: who || null, sec: SEC, secName: SECNAME }); };
  function inp(key, o = {}) {
    const type = o.type || 'text';
    reg(key, o.reg || o.label, o.who);
    const wrap = type === 'money' ? 'money' : type === 'pct' ? 'pct' : '';
    const im = ['money', 'num', 'pct'].includes(type) ? ' inputmode="decimal"' : type === 'date' ? ' inputmode="numeric" maxlength="10"' : '';
    const attrs = `data-k="${esc(key)}" data-t="${type}" placeholder="${esc(o.ph || (type === 'date' ? 'MM/DD/YYYY' : ''))}"${im} aria-label="${esc(o.reg || o.label || key)}"`;
    // free text answers wrap and grow as you type; numbers, dates, email stay one line
    const one = !o.area && type === 'text' && !o.short && !o.cal;
    const el = o.area ? `<textarea ${attrs} rows="${o.rows || 3}" spellcheck="true"></textarea>` : one ? `<textarea ${attrs} rows="1" class="one" spellcheck="true"></textarea>` : `<input ${attrs} autocomplete="off" spellcheck="${type === 'text'}">`;
    const cal = o.cal ? `<button type="button" class="calbtn" data-cal="${esc(key)}" title="Pick from a calendar" aria-label="Pick a date from a calendar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></button><input type="date" class="calpick" data-calfor="${esc(key)}" tabindex="-1" aria-hidden="true">` : '';
    const box = `<div class="in ${wrap} ${o.cal ? 'hascal' : ''}">${el}${cal}</div>`;
    return o.label ? `<div class="fld ${o.cls || ''}"><label class="${o.ask ? 'ask' : ''}">${o.label}</label>${box}</div>` : box;
  }
  // where the names for one introduction question show up, right under that question
  const nearBox = (tag) => `<div class="intros near" data-intro-near="${esc(tag)}" data-noring hidden><div class="hd"></div><div class="hd">Name</div><div class="hd">How they know them</div><div class="hd">Why they came to mind</div><div class="hd">Event</div></div>`;
  // the x on every line an add button made
  const rmBtn = (kind, w, i, title) => `<button type="button" class="rmrow" data-rm="${kind}" data-rmw="${w}" data-i="${i}" title="${title}" aria-label="${title}">&times;</button>`;
  // a question read word for word from the paper form, then a small note in parentheses
  const Q = (t, note) => `<p class="say sm q">${t}</p>${note ? `<p class="tip qnote">${note}</p>` : ''}`;
  const calc = (key, o = {}) => {
    const box = `<div class="calc ${o.big ? 'big' : ''}" data-c="${esc(key)}"><span class="v"></span><span class="t">${o.tag || 'auto'}</span></div>`;
    return o.label ? `<div class="fld"><label>${o.label}</label>${box}</div>` : box;
  };
  const seg = (key, opts, o = {}) => {
    reg(key, o.reg || o.label, o.who);
    const s = `<div class="seg ${o.yn ? 'yn' : ''}" data-seg="${esc(key)}" ${o.focus ? `data-focus="1"` : ''}>${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
    return o.label ? `<div class="fld"><label>${o.label}</label>${s}</div>` : s;
  };
  const yn = (key, q, who) => `<div class="ynrow"><div class="q">${q}</div>${seg(key, [['Y', 'Yes'], ['N', 'No']], { yn: true, reg: q.replace(/<[^>]+>/g, ''), who })}</div>`;
  const chip = (key, label) => { reg(key, 'Goal: ' + label); return `<button type="button" class="chip" data-bool="${esc(key)}"><span class="ck"></span>${label}</button>`; };
  /* A list of "type and balance" lines that print in one PDF box, joined with "; ".
     S[key] always holds the joined text (PDF, capture and the report read it);
     S['_rows:' + key] keeps the lines as typed, blanks included. */
  function multi(key, o = {}) {
    reg(key, o.reg || o.label, o.who);
    return `<div class="fld"><label class="${o.ask ? 'ask' : ''}">${o.label}</label><div class="multi" data-multi="${esc(key)}" data-ph="${esc(o.ph || '')}"></div>
      <button type="button" class="btn sm ghost addrow" data-multi-add="${esc(key)}">+ Add another account</button></div>`;
  }
  const splitRows = (v) => String(v || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
  const joinRows = (a) => a.map((x) => String(x || '').trim()).filter(Boolean).join('; ');
  function getRows(key) {
    const a = S['_rows:' + key];
    if (Array.isArray(a) && joinRows(a) === String(S[key] || '').trim()) return a.slice();
    const r = splitRows(S[key]);
    return r.length ? r : [''];
  }
  function setRows(key, rows) { S['_rows:' + key] = rows; S[key] = joinRows(rows); save(); update(); }
  function drawMulti() {
    $$('[data-multi]').forEach((box) => {
      const key = box.dataset.multi, rows = getRows(key), ph = box.dataset.ph;
      if (box.children.length !== rows.length) {
        box.innerHTML = rows.map((_, i) => `<div class="mrow2"><div class="in"><input data-mk="${esc(key)}" data-i="${i}" autocomplete="off" spellcheck="true" placeholder="${esc(i ? 'Type and balance' : ph)}" aria-label="Account ${i + 1}"></div>${rows.length > 1 ? `<button type="button" class="rmrow" data-multi-rm="${esc(key)}" data-i="${i}" title="Remove this account">&times;</button>` : ''}</div>`).join('');
      }
      $$('input', box).forEach((el, i) => { if (document.activeElement !== el && el.value !== rows[i]) el.value = rows[i] || ''; });
    });
  }
  const say = (t, sm) =>`<p class="say ${sm ? 'sm' : ''}">${t}</p>`;
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  function duo(fn) {
    return `<div class="duo">${['p', 's'].map((w) => `<div class="col col-${w}" data-w="${w}"><div class="colhd"><div class="av" data-av="${w}"></div><div><div class="nm" data-nm="${w}"></div><div class="rl">${w === 'p' ? 'Prospect' : 'Spouse / partner'}</div></div><div class="live">&#9679; talking</div></div>${fn(w)}</div>`).join('')}</div>`;
  }
  const W = (w) => (w === 'p' ? 'Prospect' : 'Spouse');
  const section = (id, num, eyebrow, title, body, extra = '') => {
    return `<section class="card" id="${id}" data-sec="${id}"><header><div><div class="eyebrow">${num} &middot; ${eyebrow}</div><h2>${title}</h2></div>${extra}</header>${body}</section>`;
  };

  /* ---------- sections ---------- */
  const SECTIONS = [];
  function S_(id, name, build) { SEC = id; SECNAME = name; SECTIONS.push({ id, name }); return build(); }

  function render() {
    const html = [
      S_('household', 'Household', () => section('household', '01', 'Household', 'Who is at the <em>table</em>', `
        <div class="grid g3">${inp(F.HEADER.agent, { label: 'Agent(s)', ph: 'Your name and your trainer' })}${inp(F.HEADER.date[0], { label: 'Date', type: 'date' })}${inp(F.HEADER.email, { label: 'Email', ph: 'name@email.com', short: true })}</div>
        <h3>People</h3>
        <div class="people">
          <div class="hd"></div><div class="hd">Name</div><div class="hd">M / F</div><div class="hd">Date of birth</div><div class="hd">Age</div>
          ${[...F.PEOPLE, ...F.EXTRA_DEPS].map((p, i) => {
            const role = i === 0 ? 'Prospect' : i === 1 ? 'Spouse' : 'Dependent ' + (i - 1);
            const cls = i === 0 ? 'p' : i === 1 ? 's' : '';
            const a = i === 1 ? 'data-spouse-row' : i > 1 ? `data-dep="${i - 2}"` : '';
            return `<div class="role ${cls}" ${a}>${role}</div>
              <div ${a}>${inp(p.name, { reg: role + ' name', ph: i < 2 ? 'First and last' : 'Name', who: i === 1 ? 's' : undefined })}</div>
              <div ${a}>${seg(p.sex, [['M', 'M'], ['F', 'F']], { yn: true, reg: role + ' M/F', who: i === 1 ? 's' : undefined })}</div>
              <div ${a}>${inp(p.dob[0], { type: 'date', reg: role + ' date of birth', who: i === 1 ? 's' : undefined })}</div>
              <div ${a}>${inp(p.age, { type: 'num', reg: role + ' age', who: i === 1 ? 's' : undefined })}</div>
              <div ${a} class="flags" data-noring>${i > 1 ? flags(i - 2) + rmBtn('dep', '', i - 2, 'Remove this dependent') : ''}</div>`;
          }).join('')}
        </div>
        <div class="depfoot"><button type="button" class="btn sm ghost" id="depAdd">+ Add a dependent</button></div>`, `<label class="toggle" id="spouseToggle"><span>Spouse / partner at the table</span><span class="sw"></span></label>`)),

      S_('opening', 'Opening', () => section('opening', '02', 'Opening', 'What stood <em>out</em>', `
        ${say('Out of everything we talked about today, what stood out to you the most?')}
        ${inp('Out of everything we talked about today what stood', { reg: 'What stood out the most' })}
        <div style="height:14px"></div>${say('Why is that?', true)}${inp('Why is that', { reg: 'Why is that (stood out)' })}`)),

      S_('goals', 'Goals', () => section('goals', '03', 'Goals and dreams', 'Goals and <em>dreams</em>', `
        ${say('Now let us get into your specific financial goals and dreams. What are some of the financial goals you are most focused on in the next 1 to 3 years?')}
        <div class="seg" style="margin:4px 0 12px">${F.GOALS.map(([k, l]) => chip(k, l)).join('')}</div>
        ${inp('Other Goals', { reg: 'Other goals', ph: 'Other goals in their words' })}
        <h3>Protection questions</h3>
        ${F.PROTECT_Q.map((q) => { reg(q.chk, q.tag); return `<div class="pq"><button type="button" class="cbx" data-bool="${esc(q.chk)}" aria-label="${esc(q.tag)}">${check}</button><div><div class="tag">${q.tag}</div><p class="say">${q.q}</p></div>${inp(q.ans, { reg: q.tag + ' answer', ph: 'Their answer' })}</div>`; }).join('')}
        <h3>Longer range</h3>
        <div class="longrange">
          ${inp('Any additional goals in the next 3-7 years', { label: '&ldquo;Any additional goals in the next 3 to 7 years?&rdquo;', ask: true, area: true, rows: 3, ph: 'Write it the way they say it. The box grows as you type.' })}
          ${inp('How about 7+ years', { label: '&ldquo;How about 7+ years?&rdquo;', ask: true, area: true, rows: 3 })}
          ${inp('Out of all of these goals what is most important t', { label: '&ldquo;Out of all of these goals, what is most important to you?&rdquo; And why?', ask: true, area: true, rows: 3 })}
        </div>`)),

      S_('retirement', 'Retirement', () => section('retirement', '04', 'Retirement', 'Retirement <em>goals</em>', `
        ${duo((w) => `
          <div class="qa"><p class="say sm q">At what age would you like to be in a financial position to not have to work a job anymore?</p>${inp(sp(F.RET.age, w), { reg: 'Done working at age', type: 'num', who: w, ph: '60' })}</div>
          <div class="qa"><p class="say sm q">How much would you want coming in per month in retirement?</p>${inp(sp(F.RET.monthly, w), { reg: 'Wants per month in retirement', type: 'money', who: w })}</div>
          ${Q('Let&rsquo;s look at what you have saved so far... Do you have any current employer retirement accounts?')}
          ${inp(sp(F.RET.employer, w), { label: 'Employer', who: w })}
          <div style="height:10px"></div>
          <div class="acct"><div class="hd"></div><div class="hd">Balance</div><div class="hd">Contrib %</div><div class="hd">or $</div><div class="hd">Match %</div><div class="hd">or $</div></div>
          ${F.RET_ROWS.map((r) => `<div class="acct"><div class="lab">${r.type ? inp(sp(r.type, w), { reg: 'Other account type', who: w, ph: 'Type' }) : r.label}</div>
            ${inp(sp(r.bal, w), { type: 'money', reg: `${r.label} balance`, who: w })}${inp(sp(r.cpct, w), { type: 'pct', reg: `${r.label} contribution %`, who: w })}${inp(sp(r.camt, w), { type: 'money', reg: `${r.label} contribution $`, who: w })}${inp(sp(r.mpct, w), { type: 'pct', reg: `${r.label} employer match %`, who: w })}${inp(sp(r.mamt, w), { type: 'money', reg: `${r.label} employer match $`, who: w })}</div>`).join('')}
          ${Q('Any old retirement accounts?')}
          ${F.RET.old.map((o, i) => `<div class="grid g2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);margin-bottom:8px">${inp(sp(o.emp, w), { label: i ? '' : 'Former employer', reg: `Old account ${i + 1} employer`, who: w })}${inp(sp(o.bal, w), { label: i ? '' : 'Balance', type: 'money', reg: `Old account ${i + 1} balance`, who: w })}</div>`).join('')}
          ${F.EXTRA_OLD[w].map((x, i) => `<div class="grid g2" data-old="${w}${i}" hidden style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);margin-bottom:8px">${inp(x.emp, { reg: `Old account ${x.n} employer`, who: w, ph: 'Former employer' })}<div class="rmwrap">${inp(x.bal, { type: 'money', reg: `Old account ${x.n} balance`, who: w })}${rmBtn('old', w, i, 'Remove this account')}</div></div>`).join('')}
          <div class="depfoot" style="margin-left:0"><button type="button" class="btn sm ghost" data-old-add="${w}">+ Add more accounts</button><span class="tip" style="margin-left:10px">Accounts past the 2 lines on the paper print in Notes.</span></div>
          ${Q('Do you have a pension?')}
          <div class="grid g3" style="grid-template-columns:minmax(0,1.5fr) 70px minmax(0,1fr)">${inp(sp(F.RET.pension.admin, w), { label: 'Pension: employer / admin', who: w })}${inp(sp(F.RET.pension.yrs, w), { label: 'Years', type: 'num', who: w, reg: 'Pension years of service' })}${inp(sp(F.RET.pension.monthly, w), { label: 'Monthly pension', type: 'money', who: w })}</div>
          <div style="height:10px"></div>
          ${multi(sp(F.RET.taxFree, w), { label: '&ldquo;Any tax free retirement accounts?&rdquo; Type and balance', ask: true, reg: 'Tax free accounts (type and balance)', who: w, ph: 'Roth IRA $20,000' })}
          <div style="height:10px"></div>
          ${Q('What are your thoughts about your retirement accounts?', '(Find out if they&rsquo;re dissatisfied, and if so, why)')}
          ${inp(sp(F.RET.thoughts[0], w), { area: true, rows: 2, who: w, reg: 'Thoughts on retirement accounts' })}
          <div style="height:10px"></div>
          ${multi(sp(F.RET.other, w), { label: '&ldquo;Any other accounts we haven&rsquo;t discussed?&rdquo; Type and balance', ask: true, reg: 'Other accounts (type and balance)', who: w, ph: 'Brokerage $15,000' })}
          ${Q('How about regular bank or credit union accounts?')}
          <div class="grid g2">${inp(sp(F.RET.checking, w), { label: 'Checking', type: 'money', who: w })}${inp(sp(F.RET.savings, w), { label: 'Savings', type: 'money', who: w })}</div>
          <div style="margin-top:8px">${yn(sp(F.RET.marketLoss[0], w), '&ldquo;Would you like us to show you a way to protect your retirement savings from market loss?&rdquo;', w)}${yn(sp(F.RET.lifetime[0], w), '&ldquo;Are you interested in creating a lifetime income stream that you can never outlive?&rdquo;', w)}</div>
          <div class="total-line"><span class="l">Saved for retirement</span><span class="v" data-m="ret_${w}"></span></div>
        `)}`)),

      S_('debt', 'Estate and debt', () => section('debt', '05', 'Estate and debt', 'Estate and <em>debt</em>', `
        <div class="grid g2" style="max-width:640px">${yn('Will Y', '&ldquo;Do you have a Will?&rdquo;')}${yn('Trust Y', '&ldquo;How about a Living Trust?&rdquo;')}</div>
        <div style="max-width:640px">${yn('_estateImp', '&ldquo;Is that important to you?&rdquo; <span class="tip">(having a Will or Trust in place)</span>')}<p class="tip estateflag" data-estate hidden>Flag: introduce them to an estate attorney. This prints in Notes.</p></div>
        <div style="height:18px"></div>
        ${Q('Any debts you&rsquo;re working towards paying off?', '(Mortgage, car loan, student loan, credit cards, personal loans, etc.)')}
        <div class="debt"><div class="hd">Type of debt</div><div class="hd">Balance</div><div class="hd">Interest rate</div><div class="hd">Monthly payment</div>
        ${F.ALL_DEBTS.map((r, i) => { const a = r.extra ? `data-xdebt="${i - F.DEBT_ROWS.length}"` : ''; const nm = r.type ? 'Debt ' + (i + 1) : 'Mortgage'; const typeBox = r.type ? inp(r.type, { reg: `${nm} type`, ph: ['', 'Car loan', 'Student loan', 'Credit card', 'Personal loan', 'Other'][i] || 'Other' }) : ''; return `${r.type ? `<div ${a}>${r.extra ? `<div class="rmwrap">${typeBox}${rmBtn('debt', '', i - F.DEBT_ROWS.length, 'Remove this debt')}</div>` : typeBox}</div>` : '<div class="fixed">Mortgage</div>'}
          <div ${a}>${inp(r.bal, { type: 'money', reg: `${nm} balance` })}</div><div ${a}>${inp(r.rate, { type: 'pct', reg: `${nm} interest rate` })}</div><div ${a}>${inp(r.pay, { type: 'money', reg: `${nm} monthly payment` })}</div>`; }).join('')}
        </div>
        <div class="depfoot" style="margin-left:0"><button type="button" class="btn sm ghost" id="debtAdd">+ Add another debt</button><span class="tip" style="margin-left:10px">Debts past the 6 lines on the paper print in Notes.</span></div>
        <div class="foot"><div class="m"><span>Total debt</span><b data-m="debtAll"></b></div><div class="m"><span>Debts besides the mortgage</span><b data-c="Text6"></b></div><div class="m"><span>Monthly payments</span><b data-m="debtPay"></b></div></div>`)),

      S_('income', 'Income', () => section('income', '06', 'Income', 'Take home <em>pay</em>', `
        ${say('How often do you get paid? After they take out taxes and retirement contributions, what do you take home each paycheck?', true)}
        ${duo((w) => `
          ${seg(sp(F.INC.freq[0], w), [['b', 'Every 2 weeks'], ['s', 'Twice a month'], ['w', 'Weekly'], ['m', 'Monthly']], { reg: 'How often paid', who: w, focus: true })}
          <div style="height:12px"></div>
          ${[['b', 'Every 2 weeks', F.INC.biw, '&times; 26 &divide; 12', F.INC.biwM], ['s', 'Twice a month', F.INC.semi, '&times; 2', F.INC.semiM], ['w', 'Weekly', F.INC.week, '&times; 52 &divide; 12', F.INC.weekM], ['m', 'Once a month', F.INC.month, '', null]]
            .map(([v, l, key, op, out]) => `<div class="pay" data-pay="${v}"><div class="lab">${l}</div>${inp(sp(key, w), { type: 'money', reg: `${l} take home`, who: w })}<div class="op">${op || '='}</div>${out ? calc(sp(out, w), { tag: '/mo' }) : calc(sp(key, w) + '__echo', { tag: '/mo' })}</div>`).join('')}
          ${Q('Do you have any other sources of income other than your job?')}
          ${F.INC.other.map((o, i) => `<div class="grid g2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);margin-bottom:8px">${inp(sp(o.src, w), { label: i ? '' : 'Source', reg: `Other income ${i + 1} source`, who: w, ph: i ? '' : 'Rental, business, bonus' })}${inp(sp(o.amt, w), { label: i ? '' : 'Per month', type: 'money', reg: `Other income ${i + 1} per month`, who: w })}</div>`).join('')}
          ${yn(sp(F.INC.passive[0], w), '&ldquo;Do you currently have any passive income streams?&rdquo;', w)}
          <div class="total-line"><span class="l">Total net income per month</span><span class="v" data-c="${esc(sp(F.INC.net, w))}"></span></div>
        `)}`)),

      S_('protection', 'Protection', () => section('protection', '07', 'Protection', 'Protect the <em>family</em>', duo((w) => `
          ${Q('Do you have Life Insurance protection through your job?')}
          ${inp(sp(F.PRO.job, w), { label: 'Coverage amount', type: 'money', who: w, reg: 'Life coverage through job' })}
          ${Q('How about any protection outside of what your job offers?')}
          ${inp(sp(F.PRO.outside, w), { label: 'Coverage amount', type: 'money', who: w, reg: 'Coverage outside the job' })}
          ${Q('Do you know what type it is?', '(term, universal, IUL, whole)')}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${seg(sp(F.PRO.type, w), [['Term', 'Term'], ['Universal', 'Universal'], ['IUL', 'IUL'], ['Whole', 'Whole']], { reg: 'Plan type', who: w })}</div>
          <div class="grid g3" style="margin-top:12px;grid-template-columns:96px minmax(0,1.3fr) minmax(0,1fr)">${inp(sp(F.PRO.termYrs, w), { label: 'If term, # of years?', ask: true, type: 'num', who: w, reg: 'Term years' })}${inp(sp(F.PRO.company, w), { label: '&ldquo;What company?&rdquo;', ask: true, who: w, reg: 'Company' })}${inp(sp(F.PRO.cost, w), { label: '&ldquo;How much do you pay each month for it?&rdquo;', ask: true, type: 'money', who: w, reg: 'Monthly cost of plan' })}</div>
          <div class="grid g2" style="margin-top:12px">${inp(sp(F.PRO.howLong, w), { label: '&ldquo;How long have you had it for?&rdquo;', ask: true, who: w, reg: 'Had it how long' })}</div>
          ${F.EXTRA_PLANS[w].map((x, i) => `<div class="plan" data-plan="${w}${i}" hidden><div class="planhd"><span>Plan ${x.n}</span>${rmBtn('plan', w, i, 'Remove this plan')}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${seg(x.type, [['Term', 'Term'], ['Universal', 'Universal'], ['IUL', 'IUL'], ['Whole', 'Whole']], { reg: `Plan ${x.n} type`, who: w })}</div>
            <div class="grid g2" style="margin-top:10px">${inp(x.amt, { label: 'Coverage amount', type: 'money', who: w, reg: `Plan ${x.n} coverage` })}${inp(x.company, { label: 'Company', who: w, reg: `Plan ${x.n} company` })}</div>
            <div class="grid g2" style="margin-top:10px">${inp(x.cost, { label: 'Per month', type: 'money', who: w, reg: `Plan ${x.n} monthly cost` })}${inp(x.had, { label: 'Had it how long', who: w, reg: `Plan ${x.n} had it how long` })}</div>
          </div>`).join('')}
          <div class="depfoot" style="margin-left:0"><button type="button" class="btn sm ghost" data-plan-add="${w}">+ Add another plan</button><span class="tip" style="margin-left:10px">Extra plans count toward Has and print in Notes.</span></div>
          ${Q('What are your thoughts on the plan you have?', '(Dissatisfied? Who helped them get it?)')}
          ${inp(sp(F.PRO.thoughts[0], w), { area: true, rows: 2, who: w, reg: 'Thoughts on current plan' })}
          <h3>DIME: how much protection is needed</h3>
          ${say('The industry recommends using the DIME method to determine how much protection is needed, so if we add up...', true)}
          <div class="dime">
            <div><div class="k"><b>D</b>ebts</div>${calc(sp(F.PRO.dDebts, w), { tag: '' })}</div>
            <div><div class="k"><b>I</b>ncome &middot; 10x</div>${calc(sp(F.PRO.dIncome, w), { tag: '' })}</div>
            <div><div class="k"><b>M</b>ortgage</div>${calc(sp(F.PRO.dMort, w), { tag: '' })}</div>
            <div><div class="k"><b>E</b>ducation</div>${inp(sp(F.PRO.dEdu, w), { type: 'money', who: w, reg: 'DIME education' })}</div>
          </div>
          <div class="edupre" data-noring><span class="tip">Education per kid</span>${seg('_eduPer', F.EDU_PRESETS.map((v) => [String(v), '$' + v / 1000 + 'K']), { reg: 'Education per kid' })}<span class="tip">or type any amount in the box</span></div>
          <div class="total-line"><span class="l">Minimum to protect their loved ones</span><span class="v" data-c="${esc(sp(F.PRO.dTotal, w))}"></span></div>
          <div class="gap" data-gap="${w}"></div>
          <p class="say sm" data-min="${w}" style="margin-top:14px"></p>
          ${inp(sp(F.PRO.want, w), { label: 'How much would they want to have?', who: w })}
          ${Q('How familiar are you with the two main types of protection, term vs perm?')}
          <div class="famrow">${seg('_fam' + w, [['Y', 'Familiar'], ['N', 'Not familiar']], { reg: 'Familiar with term vs perm', who: w })}</div>
          <div class="script famscript" data-famscript="${w}" hidden><div class="famhd">Term vs perm script${w === 's' ? ' (recap for the spouse)' : ''}</div><p>Term is temporary, lasts for a max of 30 years, it is like renting an apartment. Because 99% of term plans never pay out any benefits, it is very cheap. Perm stands for a category of permanent options: whole life, universal life, IULs, VULs. Depending on the type of permanent plan, some offer additional benefits like tax free retirement income, long term care protection, college funding, and other living benefits. But because there are so many more benefits, it is not as dirt cheap as term. Permanent plans are like owning your house, where you will eventually get back much more than what you put in.</p></div>
          ${Q(w === 'p' ? 'We offer both. As a concept, which do you prefer? ... Why is that?' : 'Do you prefer term or perm? ... Why is that?')}
          <div class="grid g2" style="grid-template-columns:auto minmax(0,1fr);align-items:end">${seg(sp(F.PRO.prefer, w), [['Term', 'Term'], ['Perm', 'Perm'], ['Both', 'Both']], { label: 'Prefers', who: w, reg: 'Prefers term or perm' })}${inp(sp(F.PRO.why, w), { label: 'Why is that?', who: w, reg: 'Why term or perm' })}</div>
          <h3>Health</h3>
          ${Q('If you had to rate yourself on a scale of 1 to 10, 10 being very healthy, what number would you give yourself (and why)?')}
          <div class="fld"><div class="rate" data-seg="${esc(sp(F.PRO.health, w))}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div></div>
          ${(reg(sp(F.PRO.health, w), 'Health rating 1 to 10', w), '')}
          <div style="height:8px"></div>${inp(sp(F.PRO.healthWhy, w), { label: 'And why?', who: w, reg: 'Health rating why' })}
          <div style="height:10px"></div>
          ${Q('Do you take any prescription medication or have any diagnoses?', '(If yes, get med list and year diagnosed)')}
          ${inp(sp(F.PRO.meds[0], w), { area: true, rows: 2, who: w, reg: 'Medications and diagnoses' })}
          <div style="margin-top:6px">${yn(sp(F.PRO.smoke[0], w), '&ldquo;Do you smoke?&rdquo;', w)}<div class="yesmore" data-yesmore="${esc(sp(F.PRO.smoke[0], w))}" hidden>${inp('_smokeNote' + w, { label: 'Details', who: w, reg: 'Smoking details', ph: 'What they smoke, how often, when they started or quit' })}</div>${yn(sp(F.PRO.dui[0], w), '&ldquo;Any DUIs in the past 5 years?&rdquo;', w)}<div class="yesmore" data-yesmore="${esc(sp(F.PRO.dui[0], w))}" hidden>${inp('_duiNote' + w, { label: 'Details', who: w, reg: 'DUI details', ph: 'How many, what year, anything still open' })}</div></div>
          <div class="hw" style="margin-top:8px">${inp(sp(F.PRO.ft, w), { label: 'Ft', type: 'num', who: w, reg: 'Height feet' })}${inp(sp(F.PRO.inch, w), { label: 'In', type: 'num', who: w, reg: 'Height inches' })}${inp(sp(F.PRO.wt, w), { label: 'Weight (lbs)', type: 'num', who: w, reg: 'Weight' })}</div>
          <div style="margin-top:6px">${yn(sp(F.PRO.ltc[0], w), '&ldquo;Do you have Long-Term Care protection?&rdquo;', w)}</div>
          <div class="grid g2">${inp(sp(F.PRO.ltcCov, w), { label: 'Coverage amount', type: 'money', who: w, reg: 'LTC coverage' })}${inp(sp(F.PRO.ltcPrem, w), { label: 'Premium per month', type: 'money', who: w, reg: 'LTC monthly cost' })}</div>
          <div class="uw" data-noring><span class="tip">Underwriting guide</span>${seg('_uw' + w, Object.keys(F.UW_GUIDES).map((k) => [k, k]))}<span class="tip" data-uw="${w}"></span></div>
        `))),

      S_('expenses', 'Expenses', () => section('expenses', '08', 'Expenses and savings', 'What is <em>left over</em>', `
        <div style="max-width:640px">${yn(EXP_.budget[0], '&ldquo;Do you keep a monthly budget?&rdquo;')}</div>
        ${Q('What are your approximate total household expenses each month?')}
        <div class="grid g2">${inp(EXP_.expenses, { type: 'money', reg: 'Total household expenses each month' })}</div>
        ${say('I&rsquo;ll email you a budget worksheet that if you can fill out before our next meeting, I can include in your financial analysis.', true)}
        <p class="tip" style="margin:-4px 0 18px"><a href="https://www.dropbox.com/scl/fi/r2bwfwv4uogyyjiwjuk8h/Budget-Worksheet.xlsx?rlkey=xb7ufw8avuu5gfcx2ev2yk3ln&st=m666l90a&dl=0" target="_blank" rel="noopener">Budget worksheet</a></p>
        <div class="flow">
          <div class="lbl">Total net income</div><div></div>${calc(EXP_.combined, { tag: 'both' })}
          <div class="lbl">10% of net income</div><div></div>${calc(EXP_.ten)}
          <div class="lbl">Minus monthly expenses</div><div class="op" style="color:var(--dim)">&minus;</div>${calc(EXP_.minus, { tag: '' })}
          <div class="lbl"><b>Total discretionary</b></div><div></div>${calc(EXP_.disc, { tag: 'left' })}
        </div>
        <p class="sentence" data-left></p>
        ${yn(EXP_.right[0], 'Does that sound about right?')}
        <div class="yesmore" data-nomore="${esc(EXP_.right[0])}" hidden><div class="grid g2">${inp('_leftThink', { label: 'How much do they think is left over?', type: 'money', reg: 'Left over they think' })}</div></div>
        ${Q('Do you see your bank account growing or staying the same at the end of each month?')}
        <div class="famrow">${seg('_growing', [['grow', 'Growing'], ['same', 'Staying the same']], { reg: 'Bank account growing or staying the same' })}</div>
        <div class="yesmore" data-growmore hidden><div class="grid g2">${inp(EXP_.growing, { label: '&ldquo;By how much?&rdquo;', ask: true, type: 'money', reg: 'Bank account growing, by how much' })}</div></div>
        <h3>Savings goal</h3>
        ${say('Most families we help save at least 10% of their net income for their financial futures. Would you like to set a goal of saving the average of 10%, more, or less?', true)}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${seg(EXP_.choice[0], [['10', '10%'], ['more', 'More'], ['less', 'Less']], { reg: 'Savings goal' })}
          <div data-show="more" style="width:110px">${inp(EXP_.morePct, { type: 'pct', reg: 'Savings goal more %', ph: '15' })}</div>
          <div data-show="less" style="width:110px">${inp(EXP_.lessPct, { type: 'pct', reg: 'Savings goal less %', ph: '5' })}</div></div>
        <p class="sentence" data-saving></p>
        <div class="grid g2">${inp(EXP_.sound, { label: 'How does that sound?' })}</div>

        <div class="closer"><div class="tag">The close &middot; ask it every time</div>
          <p class="say">We are going to take this info and put together a great plan for you. When we get back together, if the plan is better than what you are currently doing, would there be anything stopping you from investing in your future?</p></div>

        <div class="subhd"><span>Personal introductions</span></div>
        <p class="tip" style="margin:0 0 6px">Read this out loud, then ask.</p>
        ${say('Before we wrap up, one thing about how we work. You will never get a bill from us for any of this. The institutions we partner with compensate us, so your analysis is free. What keeps our doors open is personal introductions. Most families we help introduce us to 10 to 15 people they love. We intend to earn that.', true)}
        <div class="askrow">${say('As we went through this today, who came to mind who should have this same conversation?')}<button type="button" class="btn sm" data-intro-add="Came to mind">+ Name</button></div>
        ${nearBox('Came to mind')}
        <p class="tip" style="margin:-4px 0 14px">No phone numbers yet. No push. You come back to these names at Step 5.</p>
        ${say('I have a few ideas I would like to run by you. When people have money moving in their life, that is usually when they want someone in their corner. Is it okay if I run a few by you?', true)}
        <p class="tip" data-theirs-tip style="margin:0 0 8px"></p>
        <div class="events">${F.EVENTS.map((e) => `<div class="ev" data-ev="${e.id}"><div class="evtag">${e.tag}<span class="theirs">Their category</span></div><p class="say sm">${e.q}</p><button type="button" class="btn sm" data-intro-add="${esc(e.tag)}">+ Name</button>${nearBox(e.tag)}</div>`).join('')}</div>
        <div class="intros" data-noring>
          <div class="hd"></div><div class="hd">Name</div><div class="hd">How they know them</div><div class="hd">Why they came to mind</div><div class="hd">Event</div>
          ${F.INTRO_ROWS.map((r, i) => `<div class="irow" data-irow="${i}"><div class="n">${i + 1}</div>${inp(r.name, { reg: `Introduction ${i + 1} name`, ph: 'Name' })}${inp(r.how, { ph: 'Sister, coworker...' })}${inp(r.why, { ph: 'Why them' })}<div class="rmwrap"><div class="in"><select data-k="${esc(r.event)}" aria-label="Introduction ${i + 1} event"><option value=""></option>${['Came to mind', ...F.EVENTS.map((e) => e.tag)].map((t) => `<option>${t}</option>`).join('')}</select></div>${rmBtn('intro', '', i, 'Remove this name')}</div></div>`).join('')}
        </div>
        <div class="introfoot"><button type="button" class="btn sm ghost" data-intro-add="">+ Add a name</button><span class="tip" data-intro-count></span></div>
        <h3>Business partner</h3>
        ${say('Who do you know who is really good at their job, yet wants more?')}
        <div class="intros partner" data-noring><div class="irow"><div class="n">&#9733;</div>${inp(F.PARTNER.name, { reg: 'Business partner name', ph: 'Name' })}${inp(F.PARTNER.how, { ph: 'How they know them' })}${inp(F.PARTNER.why, { ph: 'Why them' })}<div></div></div></div>
        <p class="tip" style="margin-top:14px">If they hesitate, ask about it once. If they hesitate a second time, back off: &ldquo;Understood. Just know I&rsquo;m never too busy for someone you care about. Fair enough?&rdquo;</p>`)),

      S_('return', 'Next meeting', () => section('return', '09', 'Next meeting', 'Back <em>together</em>', `
        <div class="grid retgrid">
          ${inp(F.RETURN.date[0], { label: 'Return date', type: 'date', cal: true, ph: 'Type or pick' })}${inp(F.RETURN.hour, { label: 'Hour', type: 'num', ph: '7' })}${inp(F.RETURN.min, { label: 'Min', type: 'num', ph: '00' })}
          ${seg(F.RETURN.ampm[0], [['AM', 'AM'], ['PM', 'PM']], { label: '&nbsp;', yn: true, reg: 'AM or PM' })}
          ${(reg(F.RETURN.state, 'Their state'), '')}<div class="fld"><label>Their state</label><div class="in"><input data-k="${esc(F.RETURN.state)}" data-t="state" list="stateList" placeholder="NC or North Carolina" autocomplete="off" spellcheck="false" aria-label="State"></div></div>
        </div>
        <datalist id="stateList">${Object.entries(STATES).map(([c, s]) => `<option value="${s[0]}">${c}</option>`).join('')}</datalist>
        <div style="margin-top:12px">${seg('Eastern', F.RETURN.tz.map((t) => [t, t]), { label: 'Their time zone', reg: 'Time zone' })}</div>
        <p class="tip" data-tz-tip style="margin:8px 0 0"></p>
        <div class="tzcard" data-tzcard></div>`)),

      S_('notes', 'Notes', () => section('notes', '10', 'Notes', 'Notes and <em>recommendations</em>', `
        ${inp(F.NOTES[0], { label: 'Notes', area: true, rows: 7, ph: 'Anything you capture that has no box lands here too.' })}
        <h3>Recommendations</h3>
        <div class="grid g3">${F.RECS.map((r, i) => inp(r[0], { label: `Recommendation ${i + 1}`, area: true, rows: 4 })).join('')}</div>`)),
    ];
    $('#main').innerHTML = html.join('') + `<p class="footer-note">Saved only on this device. Nothing leaves this computer unless you download the PDF.</p>`;
    $('#nav').innerHTML = SECTIONS.map((s, i) => `<a href="#${s.id}" data-nav="${s.id}"><span class="ring" data-ring="${s.id}"></span><span>${s.name}</span></a>`).join('');
  }
  const EXP_ = F.EXP;

  /* ---------- next meeting: state to time zone, their time vs your time ---------- */
  // [name, zone most of the state is in]; split states get a tip to double check
  const STATES = {
    AL: ['Alabama', 'Central'], AK: ['Alaska', 'Alaska'], AZ: ['Arizona', 'Mountain'], AR: ['Arkansas', 'Central'], CA: ['California', 'Pacific'],
    CO: ['Colorado', 'Mountain'], CT: ['Connecticut', 'Eastern'], DE: ['Delaware', 'Eastern'], DC: ['District of Columbia', 'Eastern'], FL: ['Florida', 'Eastern'],
    GA: ['Georgia', 'Eastern'], HI: ['Hawaii', 'Hawaii'], ID: ['Idaho', 'Mountain'], IL: ['Illinois', 'Central'], IN: ['Indiana', 'Eastern'],
    IA: ['Iowa', 'Central'], KS: ['Kansas', 'Central'], KY: ['Kentucky', 'Eastern'], LA: ['Louisiana', 'Central'], ME: ['Maine', 'Eastern'],
    MD: ['Maryland', 'Eastern'], MA: ['Massachusetts', 'Eastern'], MI: ['Michigan', 'Eastern'], MN: ['Minnesota', 'Central'], MS: ['Mississippi', 'Central'],
    MO: ['Missouri', 'Central'], MT: ['Montana', 'Mountain'], NE: ['Nebraska', 'Central'], NV: ['Nevada', 'Pacific'], NH: ['New Hampshire', 'Eastern'],
    NJ: ['New Jersey', 'Eastern'], NM: ['New Mexico', 'Mountain'], NY: ['New York', 'Eastern'], NC: ['North Carolina', 'Eastern'], ND: ['North Dakota', 'Central'],
    OH: ['Ohio', 'Eastern'], OK: ['Oklahoma', 'Central'], OR: ['Oregon', 'Pacific'], PA: ['Pennsylvania', 'Eastern'], RI: ['Rhode Island', 'Eastern'],
    SC: ['South Carolina', 'Eastern'], SD: ['South Dakota', 'Central'], TN: ['Tennessee', 'Central'], TX: ['Texas', 'Central'], UT: ['Utah', 'Mountain'],
    VT: ['Vermont', 'Eastern'], VA: ['Virginia', 'Eastern'], WA: ['Washington', 'Pacific'], WV: ['West Virginia', 'Eastern'], WI: ['Wisconsin', 'Central'], WY: ['Wyoming', 'Mountain'],
  };
  const SPLIT = { FL: 'the panhandle is on Central', IN: 'a few northwest and southwest counties are on Central', KY: 'the western half is on Central', TN: 'East Tennessee (Knoxville, Chattanooga) is on Eastern', MI: 'four Upper Peninsula counties are on Central', TX: 'El Paso is on Mountain', KS: 'a few western counties are on Mountain', NE: 'the western panhandle is on Mountain', ND: 'the southwest corner is on Mountain', SD: 'the western half is on Mountain', ID: 'the northern panhandle is on Pacific', OR: 'most of Malheur County is on Mountain' };
  const IANA = { Eastern: 'America/New_York', Central: 'America/Chicago', Mountain: 'America/Denver', Pacific: 'America/Los_Angeles', Alaska: 'America/Anchorage', Hawaii: 'Pacific/Honolulu' };
  function stateCode(v) {
    const t = String(v || '').trim().replace(/\./g, '').toLowerCase(); if (!t) return '';
    if (t.length === 2 && STATES[t.toUpperCase()]) return t.toUpperCase();
    const hit = Object.entries(STATES).find(([, s]) => s[0].toLowerCase() === t);
    return hit ? hit[0] : '';
  }
  // minutes a zone is ahead of UTC at a given moment
  function zoneOff(tz, d) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - d.getTime()) / 60000;
  }
  function wallTime(y, mo, d, h, mi, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - zoneOff(tz, new Date(guess)) * 60000;
    const o2 = zoneOff(tz, new Date(t)); t = guess - o2 * 60000;
    return new Date(t);
  }
  function tzCard() {
    const card = $('[data-tzcard]'), tip = $('[data-tz-tip]'); if (!card) return;
    const code = stateCode(S[F.RETURN.state]), zone = S.Eastern;
    tip.textContent = code && SPLIT[code] ? `Heads up: most of ${STATES[code][0]} is on ${STATES[code][1]} time, but ${SPLIT[code]}. Ask which city, then tap the right zone.` : '';
    if (!zone) { card.innerHTML = code ? '' : '<div class="tzempty">Type their state and the time zone picks itself.</div>'; return; }
    const tz = code === 'AZ' && zone === 'Mountain' ? 'America/Phoenix' : IANA[zone];
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(S[F.RETURN.date[0]] || '');
    const h = parseInt(S[F.RETURN.hour], 10), mi = parseInt(S[F.RETURN.min] || '0', 10) || 0, ap = S[F.RETURN.ampm[0]];
    const where = code ? `${STATES[code][0]} &middot; ${zone} time` : `${zone} time`;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const myName = (d) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: mine, timeZoneName: 'longGeneric' }).formatToParts(d).find((x) => x.type === 'timeZoneName').value; } catch (e) { return mine; } };
    if (!m || !(h >= 1 && h <= 12) || !ap) {
      const now = new Date();
      const diff = (zoneOff(tz, now) - zoneOff(mine, now)) / 60;
      const rel = diff === 0 ? 'Same clock as you.' : `They are ${Math.abs(diff)} hour${Math.abs(diff) === 1 ? '' : 's'} ${diff < 0 ? 'behind' : 'ahead of'} you.`;
      card.innerHTML = `<div class="tzside them"><div class="k">Their time</div><div class="t">${where}</div><div class="s">${rel}</div></div><div class="tzempty">Add the date, hour and AM/PM to see the meeting in both time zones.</div>`;
      return;
    }
    const at = wallTime(+m[3], +m[1], +m[2], (h % 12) + (ap === 'PM' ? 12 : 0), mi, tz);
    const fmt = (z) => new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at).replace(' at ', ', ');
    const same = zoneOff(tz, at) === zoneOff(mine, at);
    card.innerHTML = `<div class="tzside them"><div class="k">Their time</div><div class="t">${fmt(tz)}</div><div class="s">${where}</div></div>
      <div class="tzside you"><div class="k">Your time</div><div class="t">${fmt(mine)}</div><div class="s">${esc(myName(at))}${same ? ' &middot; same clock' : ''}</div></div>`;
  }

  /* ---------- state to screen ---------- */
  function paint(keys) {
    const all = !keys;
    $$('[data-k]').forEach((el) => { const k = el.dataset.k; if (all || keys.includes(k)) { const v = S[k] ?? ''; if (el.value !== v && document.activeElement !== el) el.value = v; if (document.activeElement === el && !all && el.value !== v) el.value = v; } });
    $$('[data-seg]').forEach((g) => { const k = g.dataset.seg; if (all || keys.includes(k)) $$('button', g).forEach((b) => b.classList.toggle('on', String(S[k] ?? '') === b.dataset.v)); });
    $$('[data-bool]').forEach((b) => { const k = b.dataset.bool; if (all || keys.includes(k)) b.classList.toggle('on', S[k] === true); });
    update();
  }

  function setMoney(el, v) { el.textContent = v ? '$' + F.fmt(v) : '$0'; }
  function update() {
    const c = F.compute(S, hasSpouse());
    // calc boxes
    $$('[data-c]').forEach((el) => {
      let k = el.dataset.c, v;
      if (k.endsWith('__echo')) v = F.num(S[k.replace('__echo', '')]); else v = c[k];
      const box = el.classList.contains('calc') ? el : null;
      const target = box ? $('.v', el) : el;
      if (!v) { target.innerHTML = box ? '<span class="empty">$0</span>' : '$0'; if (box) box.classList.remove('neg'); return; }
      target.textContent = (v < 0 ? '-$' : '$') + F.fmt(Math.abs(v));
      if (box) box.classList.toggle('neg', v < 0);
    });
    $$('[data-m]').forEach((el) => setMoney(el, c[el.dataset.m]));
    // auto placeholders: ages from DOB, education 100K per kid
    if (!S._eduPer) S._eduPer = String(DB.eduPer || 100000);
    for (const p of [...F.PEOPLE, ...F.EXTRA_DEPS]) {
      const el = $(`[data-k="${CSS.escape(p.age)}"]`); if (!el) continue;
      const a = F.ageFrom(S[p.dob[0]]);
      el.placeholder = a ? a : ''; el.classList.toggle('has-auto', !!a);
    }
    for (const w of ['p', 's']) {
      const el = $(`[data-k="${CSS.escape(sp(F.PRO.dEdu, w))}"]`);
      if (el) { el.placeholder = c.kids ? `${F.fmt(c.eduAuto)} (${c.kids} kid${c.kids > 1 ? 's' : ''})` : `${c.eduPer / 1000}K per kid`; el.classList.toggle('has-auto', !!c.kids); }
      const mn = $(`[data-min="${w}"]`);
      if (mn) mn.innerHTML = `<b class="amt">${c[sp(F.PRO.dTotal, w)] ? '$' + F.fmt(c[sp(F.PRO.dTotal, w)]) : '$ ___'}</b> would be the min amount necessary to protect your loved ones. What are your thoughts on how much you would want to have?`;
      const gap = $(`[data-gap="${w}"]`);
      if (gap) {
        const need = c[sp(F.PRO.dTotal, w)], have = c['cov_' + w];
        gap.innerHTML = need ? `<span>Has <b>$${F.fmt(have)}</b></span><span>&middot;</span><span>Gap <b class="${c['gap_' + w] ? 'bad' : ''}">$${F.fmt(c['gap_' + w])}</b></span>` : '';
      }
      // term vs perm: the script opens only when they say they are not familiar
      { const fs = $(`[data-famscript="${w}"]`); if (fs) fs.hidden = S['_fam' + w] !== 'N'; }
      // extra old retirement accounts: same idea
      const XO = F.EXTRA_OLD[w];
      const usedO = XO.reduce((a, x, i) => ((String(S[x.emp] || '').trim() || String(S[x.bal] || '').trim()) ? i + 1 : a), 0);
      const nO = Math.min(XO.length, Math.max(usedO, S['_oldShow' + w] || 0));
      XO.forEach((x, i) => { const el = $(`[data-old="${w}${i}"]`); if (el) el.hidden = i >= nO; });
      const ob = $(`[data-old-add="${w}"]`); if (ob) ob.closest('.depfoot').hidden = nO >= XO.length;
      // extra plans: show the ones in use, plus any added with the button
      const XP = F.EXTRA_PLANS[w];
      const used = XP.reduce((a, x, i) => ([x.amt, x.type, x.company, x.cost, x.had].some((k) => String(S[k] || '').trim()) ? i + 1 : a), 0);
      const nShow = Math.min(XP.length, Math.max(used, S['_planShow' + w] || 0));
      XP.forEach((x, i) => { const el = $(`[data-plan="${w}${i}"]`); if (el) el.hidden = i >= nShow; });
      const pb = $(`[data-plan-add="${w}"]`); if (pb) pb.closest('.depfoot').hidden = nShow >= XP.length;
      // underwriting guide for the carrier they pick (Nationwide until they pick)
      const car = S['_uw' + w] || 'Nationwide', url = F.UW_GUIDES[car];
      $$(`[data-seg="_uw${w}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === car));
      const ug = $(`[data-uw="${w}"]`);
      // no link line: the carrier button opens its guide; a carrier with no guide yet says so
      if (ug) ug.textContent = url ? '' : `${car} guide not added yet`;
      // highlight the pay row they use
      const f = S[sp(F.INC.freq[0], w)];
      $$(`.col-${w} [data-pay]`).forEach((r) => { r.classList.toggle('hot', r.dataset.pay === f); r.classList.toggle('dim', !!f && r.dataset.pay !== f && !F.num(S[sp({ b: F.INC.biw, s: F.INC.semi, w: F.INC.week, m: F.INC.month }[r.dataset.pay], w)])); });
    }
    { const ef = $('[data-estate]'); if (ef) ef.hidden = S._estateImp !== 'Y'; }
    // a details box under a question that only opens on Yes
    $$('[data-yesmore]').forEach((el) => { el.hidden = S[el.dataset.yesmore] !== 'Y'; });
    // and one that only opens on No
    $$('[data-nomore]').forEach((el) => { el.hidden = S[el.dataset.nomore] !== 'N'; });
    // growing opens "by how much" (an amount typed before this existed still shows)
    { const gm = $('[data-growmore]'); if (gm) gm.hidden = !(S._growing === 'grow' || (!S._growing && String(S[EXP_.growing] || '').trim())); }
    // sentences
    const left = c[EXP_.disc];
    $('[data-left]').innerHTML = S[EXP_.expenses] || c[EXP_.combined] ? `Based on what is coming in and what is going out, it looks like you should have about <b>$${F.fmt(left)}</b> left over at the end of the month. Does that sound about right?` : '';
    const ch = S[EXP_.choice[0]];
    $$('[data-show]').forEach((el) => { el.style.display = el.dataset.show === ch ? '' : 'none'; });
    $('[data-saving]').innerHTML = ch ? `So at <b>${c.savePct || '__'}%</b>, we are looking at saving <b>$${F.fmt(c[EXP_.saving])}</b> a month to help you reach your financial goals and dreams. How does that sound?` : '';
    intros();
    deps();
    debts();
    drawMulti();
    tzCard();
    padSync();
    $$('#main textarea').forEach(grow);
    // names everywhere
    const nm = { p: (S.PROSPECT || '').trim(), s: (S['Spouse Name'] || '').trim() };
    for (const w of ['p', 's']) {
      const first = nm[w].split(/\s+/)[0];
      $$(`[data-nm="${w}"]`).forEach((el) => (el.textContent = first || (w === 'p' ? 'Prospect' : 'Spouse')));
      $$(`[data-av="${w}"]`).forEach((el) => (el.textContent = (first || (w === 'p' ? 'P' : 'S'))[0].toUpperCase()));
      const b = $(`#spk [data-w="${w}"] span`); if (b) b.textContent = first || (w === 'p' ? 'Prospect' : 'Spouse');
    }
    const fam = nm.p ? (nm.s && hasSpouse() ? `${nm.p.split(' ')[0]} & ${nm.s}` : nm.p) : 'New client';
    $('#whoName').textContent = fam;
    document.title = (nm.p ? fam + ' · ' : '') + 'FNA Intake';
    // spouse on/off
    $('#spouseToggle').classList.toggle('on', hasSpouse());
    $$('.duo').forEach((d) => d.classList.toggle('solo', !hasSpouse()));
    $$('[data-spouse-row]').forEach((el) => (el.style.display = hasSpouse() ? '' : 'none'));
    $('#spk').classList.toggle('solo', !hasSpouse());
    if (!hasSpouse() && speaker === 's') setSpeaker('p');
    rail(c, nm);
    rings();
  }

  /* ---------- dependents: one line, more on tap ---------- */
  const DEPS = F.DEPS;
  // the two switches on each child line
  const flags = (d) => { const f = F.depFlag(d); return `<button type="button" class="chip sm" data-bool="${esc(f.notDep)}" title="Separated, grown, or lives somewhere else, but still in the plan"><span class="ck"></span>Not a dependent</button><button type="button" class="chip sm" data-bool="${esc(f.noCol)}" title="Leave this child out of the Education number"><span class="ck"></span>No college money</button>`; };
  const depFilled = (p) => [p.name, p.sex, p.dob[0], p.age].some((k) => String(S[k] || '').trim());
  const depShown = () => { let last = -1; DEPS.forEach((p, i) => { if (depFilled(p)) last = i; }); return Math.min(DEPS.length, Math.max(0, last + 1, S._depShow || 0)); };
  function deps() {
    const n = depShown();
    $$('[data-dep]').forEach((el) => { el.hidden = +el.dataset.dep >= n; });
    const b = $('#depAdd'); if (b) b.hidden = n >= DEPS.length;
  }
  function addDep() {
    const n = depShown(); if (n >= DEPS.length) return;
    S._depShow = n + 1; save(); deps();
    const el = $(`[data-k="${CSS.escape(DEPS[n].name)}"]`); if (el) el.focus();
  }
  const XD = F.EXTRA_DEBTS;
  const xdFilled = (r) => [r.type, r.bal, r.rate, r.pay].some((k) => String(S[k] || '').trim());
  const xdShown = () => { let last = -1; XD.forEach((r, i) => { if (xdFilled(r)) last = i; }); return Math.min(XD.length, Math.max(0, last + 1, S._debtShow || 0)); };
  function debts() {
    const n = xdShown();
    $$('[data-xdebt]').forEach((el) => { el.hidden = +el.dataset.xdebt >= n; });
    const b = $('#debtAdd'); if (b) b.hidden = n >= XD.length;
  }
  function addDebt() {
    const n = xdShown(); if (n >= XD.length) return;
    S._debtShow = n + 1; save(); debts();
    const el = $(`[data-k="${CSS.escape(XD[n].type)}"]`); if (el) el.focus();
  }
  // text boxes grow with the answer
  function grow(el) {
    if (!el.offsetParent || el.clientWidth < 80) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight + 2, el.classList.contains('one') ? 40 : 72) + 'px';
  }

  /* ---------- remove a line: clear it, slide the lines below it up one ---------- */
  const visibleRows = (attr, w) => $$(`[${attr}^="${w}"]`).filter((el) => !el.hidden).length;
  function rmSpec(kind, w) {
    if (kind === 'dep') return { rows: DEPS.map((p, i) => [p.name, p.sex, p.dob[0], p.age, F.depFlag(i).notDep, F.depFlag(i).noCol]), show: '_depShow', min: 0, shown: depShown() };
    if (kind === 'debt') return { rows: XD.map((r) => [r.type, r.bal, r.rate, r.pay]), show: '_debtShow', min: 0, shown: xdShown() };
    if (kind === 'intro') return { rows: F.INTRO_ROWS.map((r) => [r.name, r.how, r.why, r.event]), show: '_introShow', min: 3, shown: introShown() };
    if (kind === 'old') return { rows: F.EXTRA_OLD[w].map((x) => [x.emp, x.bal]), show: '_oldShow' + w, min: 0, shown: visibleRows('data-old', w) };
    if (kind === 'plan') return { rows: F.EXTRA_PLANS[w].map((x) => [x.amt, x.type, x.company, x.cost, x.had]), show: '_planShow' + w, min: 0, shown: visibleRows('data-plan', w) };
    return null;
  }
  function removeLine(kind, w, i) {
    const sp_ = rmSpec(kind, w); if (!sp_) return;
    // let go of the box being typed in first, so every box on the line repaints
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const { rows } = sp_;
    for (let j = i; j < rows.length - 1; j++) rows[j].forEach((k, c) => { const nk = rows[j + 1][c]; if (S[nk] === undefined) delete S[k]; else S[k] = S[nk]; });
    rows[rows.length - 1].forEach((k) => delete S[k]);
    S[sp_.show] = Math.max(sp_.min, sp_.shown - 1);
    save(); paint();
  }

  /* ---------- introductions (Cates) ---------- */
  const filledRow = (r) => !!(String(S[r.name] || '').trim() || String(S[r.how] || '').trim() || String(S[r.why] || '').trim());
  const introShown = () => {
    let last = -1; F.INTRO_ROWS.forEach((r, i) => { if (filledRow(r) || S[r.event]) last = i; });
    // "came to mind" names sit under their question, so the table below still keeps 3 open lines
    const nearN = F.INTRO_ROWS.filter((r) => S[r.event]).length;
    return Math.min(10, Math.max(3 + nearN, last + 1, S._introShow || 0));
  };
  function intros() {
    const n = introShown();
    $$('[data-irow]').forEach((el) => { el.hidden = +el.dataset.irow >= n; });
    // each name moves up under the question it came from; names with no question stay in the table
    const nears = $$('[data-intro-near]'), table = $('.intros:not([data-intro-near])');
    if (nears.length && table) {
      const rows = $$('[data-irow]').sort((a, b) => a.dataset.irow - b.dataset.irow);
      const groups = new Map(nears.map((bx) => [bx, []])), down = [];
      rows.forEach((el) => {
        const tag = S[F.INTRO_ROWS[+el.dataset.irow].event];
        const bx = !el.hidden && tag && nears.find((x) => x.dataset.introNear === tag);
        if (bx) groups.get(bx).push(el); else down.push(el);
      });
      // only move lines when the order changed, so typing never loses its place
      const sync = (box, list) => { const cur = $$(':scope > [data-irow]', box); if (cur.length !== list.length || cur.some((el, i) => el !== list[i])) list.forEach((el) => box.appendChild(el)); };
      groups.forEach((list, bx) => { sync(bx, list); bx.hidden = !list.length; });
      sync(table, down);
    }
    // their own money-moving event goes first (Cates: "the first one is actually yours")
    const theirs = F.theirEvents(S);
    F.EVENTS.forEach((e, i) => { const el = $(`[data-ev="${e.id}"]`); if (!el) return; const on = theirs.has(e.id); el.classList.toggle('mine', on); el.style.order = on ? i - 10 : i; });
    const tip = $('[data-theirs-tip]');
    if (tip) tip.textContent = theirs.size ? 'Open with the one they are in: "The first one is actually yours."' : 'Ask one at a time. Talk about each name before the next one.';
    const cnt = F.introCount(S), add = $('[data-intro-add=""]');
    const c = $('[data-intro-count]'); if (c) c.textContent = cnt ? `${cnt} name${cnt > 1 ? 's' : ''} so far` : '';
    if (add) add.hidden = n >= 10;
  }
  function addIntro(tag) {
    let i = F.INTRO_ROWS.findIndex((r, k) => k < introShown() && !filledRow(r) && (!S[r.event] || S[r.event] === tag));
    if (i < 0) i = F.INTRO_ROWS.findIndex((r) => !filledRow(r) && !S[r.event]);
    if (i < 0) { toast(['All 10 lines are full. Put the rest in Notes.'], {}, []); return; }
    S._introShow = Math.max(introShown(), i + 1);
    if (tag) S[F.INTRO_ROWS[i].event] = tag;
    save(); paint([F.INTRO_ROWS[i].event]);
    const el = $(`[data-k="${CSS.escape(F.INTRO_ROWS[i].name)}"]`);
    // cursor lands right away (no wait), then the page glides to the line
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  function rail(c, nm) {
    const first = (w) => (nm[w].split(/\s+/)[0] || (w === 'p' ? 'Prospect' : 'Spouse'));
    const two = hasSpouse();
    const row = (l, v, cls = '', dot = '') => `<div class="mrow ${cls}"><span>${dot ? `<i class="${dot}"></i>` : ''}${l}</span><b>${v}</b></div>`;
    const $m = (v) => (v < 0 ? '-$' : '$') + F.fmt(Math.abs(v || 0));
    const comb = c[EXP_.combined], left = c[EXP_.disc];
    const goalPct = comb ? Math.min(100, Math.round((c[EXP_.saving] / comb) * 100)) : 0;
    $('#math').innerHTML = `
      <h4>Take home <i>per month</i></h4>
      ${row(first('p'), $m(c[F.INC.net]), '', 'dp')}${two ? row(first('s'), $m(c[F.INC.net + 'S']), '', 'ds') : ''}
      ${row('Household', $m(comb), 'hl')}
      <div class="msep"></div>
      ${row('Expenses', $m(c[EXP_.minus]))}
      ${row('Left over', $m(left), S[EXP_.expenses] ? (left >= 0 ? 'good' : 'bad') : '')}
      ${row('10% of take home', $m(c[EXP_.ten]))}
      ${S[EXP_.choice[0]] ? row(`Saving goal at ${c.savePct || 0}%`, $m(c[EXP_.saving]), 'hl') + `<div class="bar"><i style="width:${left > 0 ? Math.min(100, Math.round((c[EXP_.saving] / left) * 100)) : goalPct}%"></i></div><div class="tip">${left > 0 ? Math.round((c[EXP_.saving] / left) * 100) + '% of what is left over' : ''}</div>` : ''}`;
    $('#math2').innerHTML = `
      <h4>Debt</h4>${row('Total owed', $m(c.debtAll))}${row('Monthly payments', $m(c.debtPay))}
      <div class="msep"></div><h4 style="margin-top:12px">Saved for retirement</h4>
      ${row(first('p'), $m(c.ret_p), '', 'dp')}${two ? row(first('s'), $m(c.ret_s), '', 'ds') : ''}`;
    $('#math3').innerHTML = `<h4>Protection <i>DIME</i></h4>
      ${['p', 's'].filter((w) => w === 'p' || two).map((w) => `${row(`${first(w)} needs`, $m(c[sp(F.PRO.dTotal, w)]), '', w === 'p' ? 'dp' : 'ds')}${row('Has', $m(c['cov_' + w]))}${row('Gap', $m(c['gap_' + w]), c['gap_' + w] ? 'bad' : '')}`).join('<div class="msep"></div>')}`;
    const log = (S._log || []).slice(-6).reverse();
    $('#log').innerHTML = log.length ? log.map((l) => `<div class="it" data-jump="${esc(l.keys[0] || '')}"><div class="w ${l.who}">${esc(l.whoName)}</div>${l.items.map((x) => `<div>${esc(x)}</div>`).join('')}</div>`).join('') : '<div class="none">Type what you hear in the bar below. It lands in the right box.</div>';
  }

  function rings() {
    let tot = 0, got = 0;
    for (const s of SECTIONS) {
      const sec = document.getElementById(s.id); if (!sec) continue;
      let keys = $$('[data-k],[data-seg],[data-bool],[data-multi]', sec).filter((el) => (hasSpouse() || !el.closest('.col-s, [data-spouse-row]')) && !el.closest('[data-noring]') && !el.closest('[data-dep][hidden]') && !el.closest('[data-xdebt][hidden]') && !el.closest('[data-plan][hidden]') && !el.closest('[data-old][hidden]')).map((el) => el.dataset.k || el.dataset.seg || el.dataset.bool || el.dataset.multi);
      keys = [...new Set(keys)];
      const filled = keys.filter((k) => S[k] !== undefined && S[k] !== '' && S[k] !== false).length;
      tot += keys.length; got += filled;
      const pct = keys.length ? Math.round((filled / keys.length) * 100) : 0;
      const r = $(`[data-ring="${s.id}"]`);
      if (r) { r.style.setProperty('--v', Math.min(100, pct * 2.5)); r.classList.toggle('full', pct >= 40); }
    }
    // bottom progress bar, like the deck: most families fill about 40% of the boxes, so that reads as full
    const bar = document.getElementById('prog'); if (bar) bar.style.width = Math.min(100, tot ? (got / tot) * 250 : 0) + '%';
  }

  /* ---------- input handling ---------- */
  function normDate(v) {
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(v.trim());
    if (!m) return v;
    let y = m[3];
    if (y.length === 2) { const n = 2000 + +y; y = String(n > new Date().getFullYear() ? n - 100 : n); }
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  const normMoney = (v) => { if (!String(v).trim()) return ''; if (!/^\s*-?\$?\s*[\d,]*\.?\d+\s*[km]?\s*$/i.test(v)) return v; return F.fmt(F.num(v)); };

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'cap') return preview();
    if (el.id === 'palIn') return palFilter();
    if (el.dataset && el.dataset.mk) { const rows = getRows(el.dataset.mk); rows[+el.dataset.i] = el.value; setRows(el.dataset.mk, rows); return; }
    const k = el.dataset && el.dataset.k; if (!k) return;
    let v = el.value;
    if (el.dataset.t === 'date' && e.inputType === 'insertText' && /^\d{2}$|^\d{2}\/\d{2}$/.test(v)) { v += '/'; el.value = v; }
    S[k] = v;
    // their state picks their time zone (they can still tap a different one)
    if (el.dataset.t === 'state') { const c = stateCode(v); if (c && STATES[c][1] !== S.Eastern) { S.Eastern = STATES[c][1]; save(); paint(['Eastern']); flash('Eastern'); return; } }
    save(); update();
    if (el.tagName === 'TEXTAREA') grow(el);
  });
  // the calendar button opens the browser's date picker; picking a day fills the box as MM/DD/YYYY
  document.addEventListener('change', (e) => {
    const p = e.target; if (!p.dataset || !p.dataset.calfor || !p.value) return;
    const [y, m, d] = p.value.split('-');
    S[p.dataset.calfor] = `${m}/${d}/${y}`; save(); paint([p.dataset.calfor]); flash(p.dataset.calfor);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target, k = el.dataset && el.dataset.k; if (!k) return;
    let v = el.value;
    if (el.dataset.t === 'money') v = normMoney(v);
    if (el.dataset.t === 'date') v = normDate(v);
    if (el.dataset.t === 'state') v = stateCode(v) || v.trim();
    if (el.dataset.t === 'pct' || el.dataset.t === 'num') v = v.replace(/[%\s,]/g, '');
    if (v !== el.value) { el.value = v; S[k] = v; save(); update(); }
  });
  document.addEventListener('focusin', (e) => { const col = e.target.closest && e.target.closest('.col'); if (col) setSpeaker(col.dataset.w, true); });
  document.addEventListener('click', (e) => {
    // tapping a carrier opens its underwriting guide in a new tab
    const uwb = e.target.closest('[data-seg^="_uw"] button');
    if (uwb && F.UW_GUIDES[uwb.dataset.v]) window.open(F.UW_GUIDES[uwb.dataset.v], '_blank', 'noopener');
    const rm = e.target.closest('[data-rm]');
    if (rm) { removeLine(rm.dataset.rm, rm.dataset.rmw, +rm.dataset.i); return; }
    const ia = e.target.closest('[data-intro-add]');
    if (ia) { addIntro(ia.dataset.introAdd); return; }
    if (e.target.closest('#depAdd')) { addDep(); return; }
    if (e.target.closest('#debtAdd')) { addDebt(); return; }
    const oa = e.target.closest('[data-old-add]');
    if (oa) {
      const w = oa.dataset.oldAdd, XO = F.EXTRA_OLD[w];
      const n = $$(`[data-old^="${w}"]`).filter((el) => !el.hidden).length; if (n >= XO.length) return;
      S['_oldShow' + w] = n + 1; save(); update();
      const el = $(`[data-k="${CSS.escape(XO[n].emp)}"]`); if (el) el.focus();
      setSpeaker(w, true);
      return;
    }
    const pa = e.target.closest('[data-plan-add]');
    if (pa) {
      const w = pa.dataset.planAdd, XP = F.EXTRA_PLANS[w];
      const n = $$(`[data-plan^="${w}"]`).filter((el) => !el.hidden).length; if (n >= XP.length) return;
      S['_planShow' + w] = n + 1; save(); update();
      const el = $(`[data-k="${CSS.escape(XP[n].amt)}"]`); if (el) el.focus();
      setSpeaker(w, true);
      return;
    }
    const ma = e.target.closest('[data-multi-add]');
    if (ma) {
      const k = ma.dataset.multiAdd, rows = getRows(k); rows.push(''); setRows(k, rows);
      const ins = $$(`[data-mk="${CSS.escape(k)}"]`); if (ins.length) ins[ins.length - 1].focus();
      const col = ma.closest('.col'); if (col) setSpeaker(col.dataset.w, true);
      return;
    }
    const mr = e.target.closest('[data-multi-rm]');
    if (mr) { const k = mr.dataset.multiRm, rows = getRows(k); rows.splice(+mr.dataset.i, 1); setRows(k, rows.length ? rows : ['']); return; }
    const cb = e.target.closest('[data-cal]');
    if (cb) {
      const k = cb.dataset.cal, pick = $(`[data-calfor="${CSS.escape(k)}"]`);
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(S[k] || '');
      pick.value = m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
      try { pick.showPicker(); } catch (err) { pick.focus(); pick.click(); }
      return;
    }
    const b = e.target.closest('button');
    const g = b && b.parentElement && b.parentElement.closest('[data-seg]');
    if (g && b.dataset.v !== undefined) {
      const k = g.dataset.seg; S[k] = S[k] === b.dataset.v ? '' : b.dataset.v; save(); paint([k]);
      const col = g.closest('.col'); if (col) setSpeaker(col.dataset.w, true);
      if (g.dataset.focus && S[k]) { const w = col ? col.dataset.w : 'p'; const tgt = $(`[data-k="${CSS.escape(sp({ b: F.INC.biw, s: F.INC.semi, w: F.INC.week, m: F.INC.month }[S[k]], w))}"]`); if (tgt) tgt.focus(); }
      if (k === EXP_.choice[0] && (S[k] === 'more' || S[k] === 'less')) { const t = $(`[data-k="${CSS.escape(S[k] === 'more' ? EXP_.morePct : EXP_.lessPct)}"]`); if (t) setTimeout(() => t.focus(), 30); }
      return;
    }
    const bool = e.target.closest('[data-bool]');
    if (bool) { const k = bool.dataset.bool; S[k] = S[k] !== true; save(); paint([k]); return; }
    const sw = e.target.closest('#spouseToggle');
    if (sw) { e.preventDefault(); S._hasSpouse = !hasSpouse(); save(); update(); return; }
    const spk = e.target.closest('#spk button');
    if (spk) { setSpeaker(spk.dataset.w); $('#cap').focus(); preview(); return; }
    const j = e.target.closest('[data-jump]');
    if (j && j.dataset.jump) { jump(j.dataset.jump); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); document.getElementById(nav.dataset.nav).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  function setSpeaker(w, quiet) {
    if (w === 's' && !hasSpouse()) w = 'p';
    speaker = w;
    $$('#spk button').forEach((b) => b.classList.toggle('on', b.dataset.w === w));
    $$('.col').forEach((c) => c.classList.toggle('talking', c.dataset.w === w));
    if (!quiet) preview();
  }

  /* ---------- quick capture ---------- */
  const ctx = () => ({ state: S, speaker, hasSpouse: hasSpouse(), names: { p: S.PROSPECT || '', s: S['Spouse Name'] || '' }, sex: { p: S['Prospect M'] || '', s: S['Spouse M'] || '' } });
  const show = (v) => (v === true ? 'checked' : v === 'Y' ? 'Yes' : v === 'N' ? 'No' : v === 'b' ? 'every 2 weeks' : v === 's' ? 'twice a month' : v === 'w' ? 'weekly' : v === 'm' ? 'monthly' : String(v));
  const isMoneyKey = (k) => F.MONEY.has(k);
  function preview() {
    const t = $('#cap').value.trim();
    const box = $('#pv');
    if (!t) { box.innerHTML = ''; return; }
    const parts = t.split(/\s*;\s*/).filter(Boolean);
    const acts = parts.flatMap((p) => FNACapture.parse(p, ctx()).actions);
    box.innerHTML = acts.map((a) => `<span class="pv ${a.key === F.NOTES[0] ? 'note' : ''}">&rarr; ${esc(a.label)}${a.key === F.NOTES[0] ? '' : `: <b>${isMoneyKey(a.key) && a.value !== 'None' ? '$' : ''}${esc(show(a.value))}${/pct|%/i.test(a.label) ? '%' : ''}</b>`}</span>`).join('');
  }
  function capture() {
    const t = $('#cap').value.trim(); if (!t) return;
    const parts = t.split(/\s*;\s*/).filter(Boolean);
    const prev = {}, keys = [], items = [];
    let who = speaker;
    for (const p of parts) {
      const r = FNACapture.parse(p, ctx());
      who = r.who;
      for (const a of r.actions) {
        if (!(a.key in prev)) prev[a.key] = S[a.key];
        if (a.mode === 'append' && S[a.key]) S[a.key] = S[a.key] + (a.key === F.NOTES[0] ? '\n' : '; ') + a.value;
        else S[a.key] = a.value;
        keys.push(a.key);
        items.push(a.key === F.NOTES[0] ? `Notes: ${a.value}` : `${a.label}: ${isMoneyKey(a.key) && a.value !== 'None' ? '$' : ''}${show(a.value)}`);
      }
    }
    if (!keys.length) return;
    const whoName = (who === 's' ? S['Spouse Name'] : S.PROSPECT || '').split(' ')[0] || (who === 's' ? 'Spouse' : 'Prospect');
    S._log = [...(S._log || []), { t: Date.now(), who, whoName, items, keys, text: t }].slice(-40);
    save(); paint(keys);
    keys.forEach(flash);
    toast(items, prev, keys);
    $('#cap').value = ''; preview();
  }
  function flash(k) {
    const els = [...$$(`[data-k="${CSS.escape(k)}"]`), ...$$(`[data-seg="${CSS.escape(k)}"]`), ...$$(`[data-bool="${CSS.escape(k)}"]`), ...$$(`[data-mk="${CSS.escape(k)}"]`)];
    els.forEach((el) => { el.classList.remove('filled-flash'); void el.offsetWidth; el.classList.add('filled-flash'); });
  }
  function toast(items, prev, keys) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="ttl">Filled in</div><ul>${items.map((i) => `<li>${esc(i).replace(/^([^:]+):/, '<span>$1:</span>').replace(/: (.+)$/, ': <b>$1</b>')}</li>`).join('')}</ul><div class="acts"><button class="btn sm" data-a="show">Show me</button><button class="btn sm ghost" data-a="undo">Undo</button></div>`;
    $('#toasts').appendChild(el);
    const live = $$('#toasts .toast:not(.out)'); if (live.length > 3) live.slice(0, live.length - 3).forEach((t) => t.parentNode.removeChild(t));
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 360); };
    let tm = setTimeout(kill, 5200);
    el.addEventListener('mouseenter', () => clearTimeout(tm));
    el.addEventListener('mouseleave', () => (tm = setTimeout(kill, 2500)));
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'undo') { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete S[k]; else S[k] = v; } S._log = (S._log || []).slice(0, -1); save(); paint(Object.keys(prev)); kill(); }
      if (a.dataset.a === 'show') { jump(keys[0]); kill(); }
    });
  }
  function jump(k) {
    const el = $(`[data-k="${CSS.escape(k)}"]`) || $(`[data-seg="${CSS.escape(k)}"]`) || $(`[data-bool="${CSS.escape(k)}"]`) || $(`[data-mk="${CSS.escape(k)}"]`);
    if (!el) return;
    const dep = el.closest('[data-dep]'); if (dep && dep.hidden) { S._depShow = +dep.dataset.dep + 1; deps(); }
    const xd = el.closest('[data-xdebt]'); if (xd && xd.hidden) { S._debtShow = +xd.dataset.xdebt + 1; debts(); }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { if (el.focus) el.focus({ preventScroll: true }); flash(k); }, 380);
  }

  /* ---------- floating notepad: the Notes box, reachable from anywhere ---------- */
  const NOTE = F.NOTES[0];
  const padOn = () => $('#pad').classList.contains('on');
  function padOpen(on) {
    $('#pad').classList.toggle('on', on); $('#padBtn').classList.toggle('on', on);
    DB.padOpen = on; persist();
    if (on) { padSync(); setTimeout(() => { const t = $('#padTxt'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 60); }
  }
  function padSync() {
    const t = $('#padTxt'); if (!t) return;
    const v = String(S[NOTE] || '');
    if (document.activeElement !== t && t.value !== v) t.value = v;
    const nm = (S.PROSPECT || '').trim().split(/\s+/)[0];
    $('#padWho').textContent = nm ? 'for ' + nm : '';
    $('#padBtn').classList.toggle('has', !!v.trim());
  }
  // typing in the pad is typing in Notes: same key, same save, prints on the PDF Notes lines
  document.addEventListener('input', (e) => { if (e.target.id !== 'padTxt') return; S[NOTE] = e.target.value; save(); paint([NOTE]); });

  /* ---------- find a field (Cmd/Ctrl K) ---------- */
  let palSel = 0, palList = [];
  function palOpen() { $('#veil').classList.add('on'); $('#pal').classList.add('on'); $('#palIn').value = ''; palFilter(); setTimeout(() => $('#palIn').focus(), 20); }
  function palClose() { $('#pal').classList.remove('on'); closeVeil(); }
  function palFilter() {
    const q = $('#palIn').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const nm = { p: (S.PROSPECT || 'Prospect').split(' ')[0], s: (S['Spouse Name'] || 'Spouse').split(' ')[0] };
    palList = REG.filter((r) => !r.who || r.who === 'p' || hasSpouse()).filter((r) => { const hay = `${r.label} ${r.secName} ${r.who ? nm[r.who] + ' ' + (r.who === 'p' ? 'prospect' : 'spouse wife husband partner') : ''}`.toLowerCase(); return q.every((w) => hay.includes(w)); }).slice(0, 60);
    palSel = 0;
    $('#palRes').innerHTML = palList.map((r, i) => `<div class="r ${i === 0 ? 'on' : ''}" data-i="${i}">${r.who ? `<span class="w ${r.who}">${esc(nm[r.who])}</span>` : ''}<span>${esc(r.label)}</span><span class="sec">${esc(r.secName)}</span></div>`).join('') || '<div class="r">No match</div>';
  }
  function palGo(i) { const r = palList[i]; if (!r) return; palClose(); jump(r.key); }
  document.addEventListener('mousedown', (e) => { const r = e.target.closest('#palRes .r[data-i]'); if (r) { e.preventDefault(); palGo(+r.dataset.i); } });

  /* ---------- clients drawer ---------- */
  function openClients() {
    const list = Object.entries(DB.clients).sort((a, b) => b[1].updated - a[1].updated);
    $('#clientList').innerHTML = list.length ? list.map(([id, c]) => {
      const st = c.state, nm = st.PROSPECT ? st.PROSPECT + (st['Spouse Name'] && st._hasSpouse !== false ? ' & ' + st['Spouse Name'].split(' ')[0] : '') : 'Unnamed client';
      const ic = F.introCount(st);
      return `<div class="client ${id === CUR ? 'cur' : ''}" data-open="${id}"><div><div class="nm">${esc(nm)}</div><div class="dt">${esc(st.DATE || '')} &middot; ${ic} intro name${ic === 1 ? '' : 's'} &middot; edited ${new Date(c.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div><button class="btn sm ghost x" data-del="${id}" title="Delete">Delete</button></div>`;
    }).join('') : '<p class="tip" style="padding:12px">No saved clients yet.</p>';
    $('#veil').classList.add('on'); $('#drawer').classList.add('on');
  }
  function closeVeil() { $('#veil').classList.remove('on'); $('#drawer').classList.remove('on'); $('#pal').classList.remove('on'); $('#rail').classList.remove('on'); }
  const unfocus = () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); };
  function loadClient(id) { unfocus(); CUR = id; S = DB.clients[id].state; DB.current = id; persist(); paint(); closeVeil(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function newClient() { unfocus(); CUR = newId(); S = blank(); DB.current = null; persist(); paint(); closeVeil(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $(`[data-k="PROSPECT"]`).focus(), 300); }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
    if (d) { e.stopPropagation(); const st = DB.clients[d.dataset.del].state; if (confirm(`Delete ${st.PROSPECT || 'this client'} from this device? This cannot be undone.`)) { delete DB.clients[d.dataset.del]; if (d.dataset.del === CUR) { CUR = newId(); S = blank(); paint(); } persist(); openClients(); } return; }
    if (o) loadClient(o.dataset.open);
  });

  /* ---------- PDF ---------- */
  let TEMPLATE = null;
  const tpl = () => { if (!TEMPLATE) { const b = atob(window.__FNA_PDF__); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); TEMPLATE = u; } return TEMPLATE; };
  const fileName = () => { const n = (S.PROSPECT || 'Client').trim().split(/\s+/); const last = n.length > 1 ? n[n.length - 1] + ', ' + n.slice(0, -1).join(' ') : n[0]; const d = (S.DATE || today()).split('/'); return `FNA Intake - ${last} - ${d[2]}-${d[0]}-${d[1]}.pdf`; };
  async function makePdf() {
    const spec = F.toPdfSpec(S, hasSpouse());
    const out = await FNAPdf.fillPdf(PDFLib, tpl(), spec);
    return new Blob([out], { type: 'application/pdf' });
  }
  async function pdfAction(kind) {
    const btn = kind === 'dl' ? $('#dlBtn') : $('#pvBtn');
    const old = btn.innerHTML; btn.innerHTML = 'Building&hellip;'; btn.disabled = true;
    try {
      const blob = await makePdf();
      const url = URL.createObjectURL(blob);
      if (kind === 'dl') { const a = document.createElement('a'); a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); }
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { alert('Could not build the PDF: ' + err.message); console.error(err); }
    btn.innerHTML = old; btn.disabled = false;
  }
  async function importPdf(file) {
    try {
      const vals = await FNAPdf.readPdf(PDFLib, new Uint8Array(await file.arrayBuffer()));
      const st = F.fromPdfValues(vals);
      const tw = twinOf(st, null);
      CUR = tw || newId(); S = Object.assign(blank(), st, { _hasSpouse: !!(st['Spouse Name'] || Object.keys(st).some((k) => F.PAGE4.has(k))) });
      if (tw) dupWarned = 'skip';
      save(); paint();
      toast([tw ? `Updated ${st.PROSPECT} with ${file.name} (no second copy)` : `Loaded ${Object.keys(st).length} answers from ${file.name}`], {}, []);
    } catch (err) { alert('That PDF could not be read: ' + err.message); }
  }

  /* ---------- keys ---------- */
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#pal').classList.contains('on') ? palClose() : palOpen(); return; }
    if (e.altKey && e.code === 'KeyS') { e.preventDefault(); setSpeaker(speaker === 'p' ? 's' : 'p'); return; }
    if (e.altKey && e.code === 'KeyN') { e.preventDefault(); padOpen(!padOn()); return; }
    if (e.key === 'Escape' && padOn()) { padOpen(false); return; }
    if (e.key === 'Escape') { closeVeil(); if (document.activeElement.id === 'cap') document.activeElement.blur(); return; }
    if ($('#pal').classList.contains('on')) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, Math.min(palList.length - 1, palSel + (e.key === 'ArrowDown' ? 1 : -1))); $$('#palRes .r').forEach((r, i) => r.classList.toggle('on', i === palSel)); const on = $('#palRes .r.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); palGo(palSel); }
      return;
    }
    if (e.key === '/' && !typing) { e.preventDefault(); $('#cap').focus(); return; }
    if (e.key === 'Enter' && document.activeElement.id === 'cap') { e.preventDefault(); capture(); }
    const oneLine = document.activeElement.tagName === 'INPUT' || document.activeElement.classList.contains('one');
    if (e.key === 'Enter' && !e.shiftKey && typing && oneLine && document.activeElement.id !== 'cap' && document.activeElement.id !== 'palIn') {
      if (document.activeElement.classList.contains('one')) e.preventDefault();
      // Enter moves to the next box, like a paper form
      const all = $$('#main input, #main textarea').filter((x) => x.offsetParent && !x.classList.contains('calpick'));
      const i = all.indexOf(document.activeElement); if (i >= 0 && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); }
    }
  });

  /* ---------- boot ---------- */
  render();
  $('#saveDot');
  paint();
  setSpeaker('p', true);
  $('#capGo').addEventListener('click', capture);
  let growT; window.addEventListener('resize', () => { clearTimeout(growT); growT = setTimeout(() => $$('#main textarea').forEach(grow), 120); });
  $('#dlBtn').addEventListener('click', () => pdfAction('dl'));
  $('#pvBtn').addEventListener('click', () => pdfAction('pv'));
  // hand this client to the FNA Report app (same site, same device storage)
  // Build report is hidden until compliance says how it fits with MyWFG (Edgar, 11/24). The code stays.
  $('#rptBtn').addEventListener('click', () => {
    if (!(S.PROSPECT || '').trim()) { alert('Add the prospect name first.'); return; }
    clearTimeout(saveT); DB.clients[CUR] = { state: S, updated: Date.now() }; DB.current = CUR; persist();
    window.location.href = `../fna-report/index.html?intake=${encodeURIComponent(CUR)}`;
  });
  $('#newBtn').addEventListener('click', newClient);
  $('#padBtn').addEventListener('click', () => padOpen(!padOn()));
  $('#padX').addEventListener('click', () => padOpen(false));
  $('#padGo').addEventListener('click', () => { padOpen(false); jump(NOTE); });
  if (DB.padOpen) padOpen(true);
  $('#clientsBtn').addEventListener('click', openClients);
  $('#closeDrawer').addEventListener('click', closeVeil);
  $('#veil').addEventListener('click', closeVeil);
  $('#mathBtn').addEventListener('click', () => { $('#rail').classList.add('on'); $('#veil').classList.add('on'); });
  $('#findBtn').addEventListener('click', palOpen);
  $('#openBtn').addEventListener('click', () => $('#pdfFile').click());
  $('#pdfFile').addEventListener('change', (e) => { if (e.target.files[0]) importPdf(e.target.files[0]); e.target.value = ''; });
  // highlight the section in view
  const io = new IntersectionObserver((ents) => { ents.forEach((en) => { if (en.isIntersecting) $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === en.target.id)); }); }, { rootMargin: '-35% 0px -60% 0px' });
  $$('section.card').forEach((s) => io.observe(s));
  // rotating examples in the capture bar
  const ex = ['she takes home 2,100 twice a month', 'his 401k is 85k and he puts in 6%', 'car loan 18k at 6.9%, 420 a month', 'son Leo, 8 years old', 'term plan 500k with State Farm, 45 a month', '5\'10, 185 lbs, nonsmoker', 'expenses about 6,800 a month', 'come back Tuesday at 7pm'];
  let exI = 0; setInterval(() => { const c = $('#cap'); if (c && !c.value && document.activeElement !== c) { exI = (exI + 1) % ex.length; c.placeholder = 'Type in additional details here'; } }, 3800);
  window.__fna = { get state() { return S; }, capture: (t) => { $('#cap').value = t; capture(); }, makePdf, F };
})();
