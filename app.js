/* MTSAT Open House Board — หน้าเว็บ (ไม่มีขั้น build: แก้ไฟล์นี้แล้วอัปโหลดได้เลย) */
(function () {
  'use strict';

  const CFG = window.MTSAT_CONFIG || {};
  const STATUS = [
    { id: 'NotStarted', th: 'ยังไม่เริ่ม', cls: 'cap-ns' },
    { id: 'InProgress', th: 'กำลังทำ', cls: 'cap-ip' },
    { id: 'Blocked', th: 'ติดปัญหา', cls: 'cap-bl' },
    { id: 'Done', th: 'เสร็จ', cls: 'cap-dn' },
  ];
  const ST = {};
  STATUS.forEach(s => { ST[s.id] = s; });
  const PRIORITY = { High: 'สูง', Medium: 'กลาง', Low: 'ต่ำ' };
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const VIEWS = [
    { id: 'board', th: 'บอร์ด' },
    { id: 'mine', th: 'งานของฉัน' },
    { id: 'table', th: 'ตาราง' },
    { id: 'calendar', th: 'ปฏิทิน' },
    { id: 'dashboard', th: 'ภาพรวม' },
    { id: 'team', th: 'ทีม' },
    { id: 'meet', th: 'นัดประชุม', when: () => S.data.me.role !== 'Staff' },
    { id: 'admin', th: 'จัดการคน', when: () => S.data.me.isHR },
    { id: 'trash', th: 'ถังขยะ', when: () => S.data.me.role !== 'Staff' },
  ];

  const S = {
    token: null, tokenExp: 0, data: null, version: null, view: 'board',
    filters: { unit: '', q: '', who: 'all', archived: false },
    calMonth: null, tableSort: { key: 'dueDate', dir: 1 },
    drawer: null, admin: null, adminQ: '', trash: null, pending: 0, pollTimer: null,
    meet: null, cal: null,
  };
  const app = document.getElementById('app');
  const drawerRoot = document.getElementById('drawer-root');
  const toastRoot = document.getElementById('toast-root');

  // ============================ ตัวช่วย ============================

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 32);
  const num = n => (n == null || n === '' ? '' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 }));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  function todayYmd() {
    const d = new Date(Date.now() + 7 * 3600e3);
    return d.toISOString().slice(0, 10);
  }
  function dateTh(ymd, withYear) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    if (!m) return '';
    const s = Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1];
    const y = Number(m[1]);
    return withYear || y !== Number(todayYmd().slice(0, 4)) ? s + ' ' + (y + 543) : s;
  }
  function dateTimeTh(iso) {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString();
    return dateTh(d.slice(0, 10)) + ' ' + d.slice(11, 16) + ' น.';
  }
  function initials(name) {
    const s = String(name || '?').trim();
    return /^[เแโใไ]/.test(s) ? s.slice(0, 2) : s.slice(0, 1).toUpperCase();
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' || kind === 'warn' ? 7000 : 3500);
  }

  function setPending(delta) {
    S.pending = Math.max(0, S.pending + delta);
    let el = document.querySelector('.saving');
    if (S.pending && !el) {
      el = document.createElement('div');
      el.className = 'saving';
      el.textContent = 'กำลังบันทึก…';
      document.body.appendChild(el);
    } else if (!S.pending && el) el.remove();
  }

  // ============================ เข้าสู่ระบบ ============================

  function decodeJwt(t) {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  }
  function loadToken() {
    if (CFG.DEV_EMAIL) { S.token = 'dev:' + CFG.DEV_EMAIL; S.tokenExp = Date.now() / 1000 + 864e3; return; }
    try {
      const t = JSON.parse(localStorage.getItem('mtsat.token') || 'null');
      if (t && t.exp * 1000 > Date.now() + 60000) { S.token = t.token; S.tokenExp = t.exp; }
    } catch (e) { /* storage ปิดอยู่ */ }
  }
  function saveToken(tok) {
    const p = decodeJwt(tok);
    S.token = tok;
    S.tokenExp = p.exp;
    try { localStorage.setItem('mtsat.token', JSON.stringify({ token: tok, exp: p.exp })); } catch (e) { /* ไม่เป็นไร */ }
  }
  function clearToken() {
    S.token = null;
    S.tokenExp = 0;
    try { localStorage.removeItem('mtsat.token'); } catch (e) { /* ไม่เป็นไร */ }
  }

  function renderLogin(message) {
    stopPolling();
    closeDrawer(true);
    const configured = CFG.API_URL && (CFG.CLIENT_ID || CFG.DEV_EMAIL);
    app.innerHTML = `
      <div class="login">
        <section class="login-art">
          <div>
            <h1>MTSAT Open House Board</h1>
          </div>
          <div class="rack" aria-hidden="true">
            ${STATUS.map((s, i) => `<div class="tube ${s.cls}"><div class="cap" style="background:var(--cap)"></div>
              <div class="glass" style="--fill:${[18, 55, 30, 85][i]}%"></div><small>${s.th}</small></div>`).join('')}
          </div>
          <p>ที่เดียวสำหรับงานทุกฝ่ายของ Open House — ดู สร้าง และอัปเดตงานได้จากมือถือ</p>
        </section>
        <section class="login-form">
          <div class="login-card">
            <h2>เข้าสู่ระบบ</h2>
            <p class="note">ใช้บัญชี Google ที่แจ้งไว้กับฝ่าย HR ได้ทั้งอีเมลมหาวิทยาลัยและ Gmail ส่วนตัว</p>
            ${message ? `<p class="err">${esc(message)}</p>` : ''}
            ${configured ? '<div id="gbtn"></div>' : '<p class="err">หน้าเว็บยังไม่ได้ตั้งค่า API_URL / CLIENT_ID ในไฟล์ config.js</p>'}
            ${CFG.DEV_EMAIL ? `<button class="btn primary" data-act="dev-login">เข้าสู่ระบบ (โหมดทดสอบ: ${esc(CFG.DEV_EMAIL)})</button>` : ''}
          </div>
        </section>
      </div>`;
    if (configured && !CFG.DEV_EMAIL) initGis();
  }

  function initGis() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGis, 150); return; }
    google.accounts.id.initialize({
      client_id: CFG.CLIENT_ID,
      callback: r => { saveToken(r.credential); start(); },
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    const box = document.getElementById('gbtn');
    if (box) google.accounts.id.renderButton(box, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 300 });
    google.accounts.id.prompt();
  }

  function signOut() {
    clearToken();
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    S.data = null;
    location.hash = '';
    renderLogin('ออกจากระบบแล้ว');
  }

  // ============================ API ============================

  class ApiErr extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  async function api(action, payload, write) {
    if (!S.token || S.tokenExp * 1000 < Date.now() + 15000) {
      clearToken();
      renderLogin('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      throw new ApiErr('AUTH_INVALID', 'เซสชันหมดอายุ');
    }
    const body = { action: action, idToken: S.token, payload: payload || {} };
    if (write) body.requestId = rid();
    if (write) setPending(1);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let j;
        try {
          const r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body) });
          j = await r.json();
        } catch (netErr) {
          if (attempt === 0) { await sleep(900); continue; }   // ส่งซ้ำด้วย requestId เดิม = ไม่บันทึกซ้ำ
          throw new ApiErr('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
        }
        if (!j.ok) {
          const e = new ApiErr(j.error.code, j.error.message);
          if (e.code === 'AUTH_INVALID' || e.code === 'AUTH_REQUIRED') { clearToken(); renderLogin(e.message); }
          if (e.code === 'NOT_REGISTERED') { clearToken(); renderLogin(e.message); }
          throw e;
        }
        return j;
      }
    } finally {
      if (write) setPending(-1);
    }
  }

  function fail(e) {
    if (e && (e.code === 'AUTH_INVALID' || e.code === 'AUTH_REQUIRED' || e.code === 'NOT_REGISTERED')) return;
    toast(e && e.message ? e.message : 'ทำรายการไม่สำเร็จ', 'err');
    if (e && !e.code) console.error(e);
  }

  // ============================ ข้อมูล ============================

  function indexData() {
    const d = S.data;
    d.unitById = {}; d.units.forEach(u => { d.unitById[u.id] = u; });
    d.posById = {}; d.positions.forEach(p => { d.posById[p.id] = p; });
    d.personById = {}; d.people.forEach(p => { d.personById[p.id] = p; });
    d.taskById = {}; d.tasks.forEach(t => { d.taskById[t.id] = t; });
    d.childrenOf = {};
    d.tasks.forEach(t => { if (t.parentId) (d.childrenOf[t.parentId] = d.childrenOf[t.parentId] || []).push(t); });
    d.titleOf = {};
    d.memberships.forEach(m => {
      const p = d.posById[m.positionId];
      if (p && !d.titleOf[m.personId]) d.titleOf[m.personId] = p.name;
    });
    d.myUnits = d.me.units.filter(id => d.unitById[id] && d.unitById[id].level === 2);
  }

  function upsertTask(t) {
    const d = S.data;
    const i = d.tasks.findIndex(x => x.id === t.id);
    if (i === -1) d.tasks.push(t); else d.tasks[i] = Object.assign({}, d.tasks[i], t);
    indexData();
  }

  async function refresh() {
    const j = await api('bootstrap');
    S.data = j.data;
    S.version = j.version;
    indexData();
  }

  const unitName = id => (S.data.unitById[id] ? S.data.unitById[id].name : id || '');
  const personName = id => {
    const p = S.data.personById[id];
    return p ? (p.nickname ? p.nickname : p.name) : id;
  };
  const personFull = id => {
    const p = S.data.personById[id];
    return p ? p.name + (p.nickname ? ' (' + p.nickname + ')' : '') : id;
  };
  const isBoard = () => S.data.me.role !== 'Staff';

  /** งานที่ผ่านตัวกรองบนแถบเครื่องมือ */
  function filtered(opts) {
    const f = S.filters, me = S.data.me.personId, q = f.q.trim().toLowerCase();
    return S.data.tasks.filter(t => {
      if (!f.archived && t.archived) return false;
      if (f.unit && t.ownerUnitId !== f.unit && t.collabUnitIds.indexOf(f.unit) === -1) return false;
      if (f.who === 'mine' && t.assigneeIds.indexOf(me) === -1) return false;
      if (q && (t.title + ' ' + t.id).toLowerCase().indexOf(q) === -1) return false;
      if (opts && opts.topOnly && t.parentId && S.data.taskById[t.parentId]) return false;
      return true;
    });
  }

  // ============================ เส้นทาง ============================

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/');
    if (parts[0] === 'task' && parts[1]) {
      openTask(decodeURIComponent(parts[1]));
      if (!app.querySelector('.top')) renderShell();
      return;
    }
    const v = parts[0] || 'board';
    const known = VIEWS.concat([{ id: 'profile' }]).find(x => x.id === v && (!x.when || x.when()));
    S.view = known ? v : 'board';
    closeDrawer(true);
    renderShell();
  }

  function go(view) { location.hash = '#/' + view; }

  // ============================ โครงหน้า ============================

  function renderShell() {
    const d = S.data, me = d.me;
    const tabs = VIEWS.filter(v => !v.when || v.when())
      .map(v => `<a href="#/${v.id}" ${S.view === v.id ? 'aria-current="page"' : ''}>${v.th}</a>`).join('');
    app.innerHTML = `
      <header class="top"><div class="top-row">
        <a class="mark" href="#/board"><span class="dot" aria-hidden="true"></span>MTSAT Board</a>
        <nav class="tabs" aria-label="มุมมอง">${tabs}</nav>
        <div class="who">
          <button class="btn primary small" data-act="new-task">+ งานใหม่</button>
          ${me.role !== 'Staff' ? `<span class="role">${me.role === 'Admin' ? 'Admin' : 'Board'}</span>` : ''}
          <a class="avatar" href="#/profile" title="${esc(me.displayName)}">${esc(initials(me.nickname || me.displayName))}</a>
        </div>
      </div></header>
      <main id="main"></main>`;
    renderMain();
  }

  function renderMain() {
    const main = document.getElementById('main');
    if (!main) return;
    const fn = { board: viewBoard, mine: viewMine, table: viewTable, calendar: viewCalendar, dashboard: viewDashboard,
                 team: viewTeam, meet: viewMeet, admin: viewAdmin, trash: viewTrash, profile: viewProfile }[S.view] || viewBoard;
    main.innerHTML = fn();
    afterRender();
  }

  /** วาดเฉพาะส่วนเนื้อหา (ใช้ตอนพิมพ์ค้นหา เพื่อไม่ให้ช่องค้นหาหลุดโฟกัส) */
  function renderBody() {
    const vb = document.getElementById('vb');
    if (!vb) { renderMain(); return; }
    const fn = { board: boardBody, table: tableBody, calendar: calendarBody }[S.view];
    if (fn) { vb.innerHTML = fn(); afterRender(); } else renderMain();
  }

  function afterRender() {
    if (S.view === 'board') bindDnD();
  }

  function toolbar(extra) {
    const d = S.data, f = S.filters;
    const unitIds = isBoard()
      ? d.units.filter(u => u.level === 2).map(u => u.id)
      : Array.from(new Set(d.myUnits.concat(d.tasks.reduce((a, t) => a.concat([t.ownerUnitId], t.collabUnitIds), []))));
    const groups = {};
    unitIds.forEach(id => {
      const u = d.unitById[id];
      if (!u) return;
      const g = d.unitById[u.parentId] ? d.unitById[u.parentId].name : '';
      (groups[g] = groups[g] || []).push(u);
    });
    const opts = Object.keys(groups).map(g => `<optgroup label="${esc(g)}">${groups[g].sort((a, b) => a.sort - b.sort)
      .map(u => `<option value="${esc(u.id)}" ${f.unit === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</optgroup>`).join('');
    return `<div class="toolbar">
      <input type="search" placeholder="ค้นหางาน" value="${esc(f.q)}" data-filter="q" aria-label="ค้นหางาน">
      <select data-filter="unit" aria-label="ฝ่าย"><option value="">ทุกฝ่ายที่เห็นได้</option>${opts}</select>
      <select data-filter="who" aria-label="ผู้รับผิดชอบ">
        <option value="all" ${f.who === 'all' ? 'selected' : ''}>ทุกคน</option>
        <option value="mine" ${f.who === 'mine' ? 'selected' : ''}>เฉพาะงานของฉัน</option>
      </select>
      <label class="check"><input type="checkbox" data-filter="archived" ${f.archived ? 'checked' : ''}> แสดงงานที่ Archive</label>
      ${extra || ''}
    </div>`;
  }

  // ============================ บอร์ด ============================

  function viewBoard() {
    return `<div class="page-head"><div><h1>บอร์ดงาน</h1><p>ลากการ์ดไปอีกคอลัมน์เพื่อเปลี่ยนสถานะ หรือแตะการ์ดเพื่อเปิดรายละเอียด</p></div></div>
      ${toolbar()}<div id="vb">${boardBody()}</div>`;
  }

  function boardBody() {
    const tasks = filtered({ topOnly: true });
    return `<div class="board">${STATUS.map(s => {
      const list = tasks.filter(t => t.status === s.id).sort(cardSort);
      return `<section class="col ${s.cls}" data-col="${s.id}" aria-label="${s.th}">
        <div class="col-head"><span class="capbar" aria-hidden="true"></span><h2>${s.th}</h2><span class="count">${list.length}</span></div>
        <div class="cards">${list.map(card).join('') || '<div class="empty">ไม่มีงาน</div>'}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function cardSort(a, b) {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || a.sortOrder - b.sortOrder;
  }

  function dueFlag(t) {
    if (t.archived) return '<span class="flag arch">Archive</span>';
    if (t.overdue) return `<span class="flag late">เกินกำหนด ${esc(dateTh(t.dueDate))}</span>`;
    if (t.dueSoon) return `<span class="flag soon">ครบ ${esc(dateTh(t.dueDate))}</span>`;
    return t.dueDate ? `<span>ครบ ${esc(dateTh(t.dueDate))}</span>` : '';
  }

  function peopleDots(ids, max) {
    if (!ids.length) return '';
    const shown = ids.slice(0, max || 4);
    return `<span class="people" title="${esc(ids.map(personFull).join(', '))}">${shown.map(id => `<span>${esc(initials(personName(id)))}</span>`).join('')}${ids.length > shown.length ? `<span>+${ids.length - shown.length}</span>` : ''}</span>`;
  }

  function card(t) {
    const s = ST[t.status] || ST.NotStarted;
    const canDrag = t.access === 'owner' || t.access === 'collab';
    return `<div class="card ${s.cls}" role="button" tabindex="0" data-open="${esc(t.id)}" data-id="${esc(t.id)}" ${canDrag ? 'draggable="true"' : ''}>
      <h3>${esc(t.title)}</h3>
      <div class="meta">
        <span>${esc(unitName(t.ownerUnitId))}</span>
        ${dueFlag(t)}
        ${t.childCount ? `<span>งานย่อย ${t.childDone}/${t.childCount}</span>` : ''}
        ${t.priority === 'High' ? '<span class="flag late">สำคัญมาก</span>' : ''}
        ${peopleDots(t.assigneeIds)}
      </div>
      ${t.progress > 0 && t.status !== 'Done' ? `<div class="bar"><i style="width:${t.progress}%"></i></div>` : ''}
    </div>`;
  }

  function bindDnD() {
    document.querySelectorAll('.card[draggable=true]').forEach(c => {
      c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    document.querySelectorAll('.col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        if (id) changeStatus(id, col.dataset.col);
      });
    });
  }

  async function changeStatus(id, status) {
    const t = S.data.taskById[id];
    if (!t || t.status === status) return;
    const before = Object.assign({}, t);
    upsertTask(Object.assign({}, t, { status: status, progress: status === 'Done' && !t.hasChildren ? 100 : t.progress }));
    renderBody();
    try {
      const j = await api('task.update', { taskId: id, baseRevision: before.revision, changes: { status: status } }, true);
      upsertTask(j.data.task);
      S.version = null;
      showConflicts(j.data.conflicts);
      renderBody();
      toast('ย้าย "' + t.title + '" ไปที่ ' + ST[status].th);
    } catch (e) {
      upsertTask(before);
      renderBody();
      fail(e);
    }
  }

  function showConflicts(list) {
    (list || []).forEach(c => {
      toast('บันทึกทับค่าที่ ' + c.changedByName + ' แก้เมื่อ ' + dateTimeTh(c.changedAt) + ' (' + fieldTh(c.field) + ': ' + c.overwrittenValue + ')', 'warn');
    });
  }
  function fieldTh(f) {
    return { Title: 'ชื่องาน', Description: 'รายละเอียด', Status: 'สถานะ', Priority: 'ความสำคัญ', StartDate: 'วันเริ่ม', DueDate: 'วันครบกำหนด',
             Progress: 'ความคืบหน้า', AllocatedBudget: 'งบที่ตั้งไว้', ActualSpend: 'ใช้จริง', Assignees: 'ผู้รับผิดชอบ', CollabUnits: 'ฝ่ายร่วม',
             ArchivedAt: 'Archive', SortOrder: 'ลำดับ', _created: 'สร้างงาน' }[f] || f;
  }

  // ============================ งานของฉัน ============================

  function viewMine() {
    const me = S.data.me.personId;
    const mine = S.data.tasks.filter(t => t.assigneeIds.indexOf(me) !== -1 && !t.archived).sort(cardSort);
    const open = mine.filter(t => t.status !== 'Done');
    const groups = [
      ['เกินกำหนด', open.filter(t => t.overdue)],
      ['ใกล้ครบกำหนด', open.filter(t => t.dueSoon)],
      ['ติดปัญหา', open.filter(t => !t.overdue && !t.dueSoon && t.status === 'Blocked')],
      ['กำลังทำและยังไม่เริ่ม', open.filter(t => !t.overdue && !t.dueSoon && t.status !== 'Blocked')],
      ['เสร็จแล้ว', mine.filter(t => t.status === 'Done')],
    ];
    const body = groups.filter(g => g[1].length).map(g => `<section class="group"><h2>${g[0]} <span class="n">${g[1].length}</span></h2>
      <div class="list">${g[1].map(item).join('')}</div></section>`).join('');
    return `<div class="page-head"><div><h1>งานของฉัน</h1><p>${open.length ? 'ค้างอยู่ ' + open.length + ' งาน จากทุกฝ่ายที่คุณได้รับมอบหมาย' : 'ไม่มีงานค้าง'}</p></div></div>
      ${body || '<div class="list"><div class="empty">ยังไม่มีงานที่มอบหมายให้คุณ งานที่มีคนเพิ่มชื่อคุณเป็นผู้รับผิดชอบจะขึ้นที่นี่</div></div>'}`;
  }

  function item(t) {
    const s = ST[t.status] || ST.NotStarted;
    const parent = t.parentId && S.data.taskById[t.parentId];
    return `<button class="item ${s.cls}" data-open="${esc(t.id)}">
      <span class="capdot" aria-hidden="true"></span>
      <span class="main"><span class="t">${esc(t.title)}</span>
        <span class="meta">${parent ? `<span>ใน ${esc(parent.title)}</span>` : ''}<span>${esc(unitName(t.ownerUnitId))}</span><span class="pill ${s.cls}">${s.th}</span>${dueFlag(t)}</span>
      </span></button>`;
  }

  // ============================ ตาราง ============================

  function viewTable() {
    return `<div class="page-head"><div><h1>ตารางงาน</h1><p>กดหัวคอลัมน์เพื่อเรียงลำดับ</p></div></div>${toolbar()}<div id="vb">${tableBody()}</div>`;
  }

  function tableBody() {
    const tasks = filtered({ topOnly: true });
    const k = S.tableSort.key, dir = S.tableSort.dir;
    const val = t => ({ id: t.id, title: t.title, unit: unitName(t.ownerUnitId), status: STATUS.findIndex(s => s.id === t.status),
                        priority: ['High', 'Medium', 'Low'].indexOf(t.priority), dueDate: t.dueDate || '9999', progress: t.progress,
                        budget: t.allocatedBudget || 0 })[k];
    tasks.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
    const head = [['id', 'รหัส'], ['title', 'งาน'], ['unit', 'ฝ่าย'], ['status', 'สถานะ'], ['priority', 'ความสำคัญ'],
                  ['dueDate', 'ครบกำหนด'], ['progress', 'คืบหน้า'], ['people', 'ผู้รับผิดชอบ'], ['budget', 'งบ (บาท)']];
    const row = (t, sub) => {
      const s = ST[t.status] || ST.NotStarted;
      return `<tr class="row${sub ? ' sub' : ''}" data-open="${esc(t.id)}">
        <td>${esc(t.id)}</td><td>${sub ? '↳ ' : ''}${esc(t.title)}</td><td>${esc(unitName(t.ownerUnitId))}</td>
        <td><span class="pill ${s.cls}">${s.th}</span></td><td>${PRIORITY[t.priority] || ''}</td>
        <td>${dueFlag(t)}</td><td class="num">${t.progress}%</td><td>${esc(t.assigneeIds.map(personName).join(', '))}</td>
        <td class="num">${t.allocatedBudget != null ? num(t.actualSpend || 0) + ' / ' + num(t.allocatedBudget) : ''}</td></tr>`;
    };
    const rows = tasks.map(t => row(t) + (S.data.childrenOf[t.id] || [])
      .filter(c => S.filters.archived || !c.archived).sort(cardSort).map(c => row(c, true)).join('')).join('');
    return `<div class="table-wrap"><table class="grid"><thead><tr>${head.map(h => `<th data-sort="${h[0]}" scope="col">${h[1]}${k === h[0] ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="empty">ไม่มีงานตามตัวกรองนี้</td></tr>'}</tbody></table></div>`;
  }

  // ============================ ปฏิทิน ============================

  function viewCalendar() {
    return `<div class="page-head"><div><h1>ปฏิทินงาน</h1><p>งานแสดงตามวันครบกำหนด</p></div></div>${toolbar()}<div id="vb">${calendarBody()}</div>`;
  }

  function calendarBody() {
    if (!S.calMonth) S.calMonth = todayYmd().slice(0, 7);
    const [y, m] = S.calMonth.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;   // เริ่มวันจันทร์
    const start = new Date(first.getTime() - offset * 864e5);
    const today = todayYmd();
    const byDay = {};
    filtered().filter(t => t.dueDate).forEach(t => { (byDay[t.dueDate] = byDay[t.dueDate] || []).push(t); });
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10);
      const list = (byDay[d] || []).sort(cardSort);
      cells += `<div class="day${d.slice(0, 7) !== S.calMonth ? ' out' : ''}${d === today ? ' today' : ''}">
        <span class="d">${Number(d.slice(8))}</span>
        ${list.slice(0, 4).map(t => `<button class="chip ${ST[t.status].cls}" data-open="${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}
        ${list.length > 4 ? `<span class="sub">+${list.length - 4} งาน</span>` : ''}</div>`;
      if (i >= 34 && d.slice(0, 7) !== S.calMonth && i % 7 === 6) break;
    }
    return `<div class="cal"><div class="cal-head">
        <h2>${MONTHS_FULL[m - 1]} ${y + 543}</h2>
        <button class="btn small" data-act="cal" data-d="-1" aria-label="เดือนก่อน">‹</button>
        <button class="btn small" data-act="cal" data-d="0">เดือนนี้</button>
        <button class="btn small" data-act="cal" data-d="1" aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="cal-grid">${['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div></div>`;
  }

  // ============================ ภาพรวม ============================

  function viewDashboard() {
    const d = S.data;
    const scope = d.tasks.filter(t => !t.parentId && (isBoard() || d.myUnits.indexOf(t.ownerUnitId) !== -1));
    const total = scope.length;
    const by = {};
    STATUS.forEach(s => { by[s.id] = scope.filter(t => t.status === s.id).length; });
    const overdue = scope.filter(t => t.overdue).sort(cardSort);
    const soon = scope.filter(t => t.dueSoon);

    const unitIds = Array.from(new Set(scope.map(t => t.ownerUnitId)));
    const units = unitIds.map(id => {
      const ts = scope.filter(t => t.ownerUnitId === id);
      const alloc = ts.reduce((a, t) => a + (t.allocatedBudget || 0), 0);
      const spent = ts.reduce((a, t) => a + (t.actualSpend || 0), 0);
      const cap = (d.budgets.find(b => b.unitId === id) || {}).cap;
      return { id: id, total: ts.length, done: ts.filter(t => t.status === 'Done').length, late: ts.filter(t => t.overdue).length,
               alloc: alloc, spent: spent, cap: cap };
    }).sort((a, b) => b.late - a.late || pct(a.done, a.total) - pct(b.done, b.total));

    const load = {};
    d.tasks.filter(t => t.status !== 'Done' && !t.archived && (isBoard() || d.myUnits.indexOf(t.ownerUnitId) !== -1))
      .forEach(t => t.assigneeIds.forEach(p => { load[p] = (load[p] || 0) + 1; }));
    const loadList = Object.keys(load).map(p => ({ p: p, n: load[p] })).sort((a, b) => b.n - a.n).slice(0, 15);
    const maxLoad = loadList.length ? loadList[0].n : 1;
    const budgetUnits = units.filter(u => u.alloc || u.spent || u.cap);

    const scopeText = isBoard() ? 'ทุกฝ่าย' : d.myUnits.map(unitName).join(', ') || 'ฝ่ายของคุณ';
    return `<div class="page-head"><div><h1>ภาพรวม</h1><p>${esc(scopeText)} · นับเฉพาะงานหลัก รวมงานที่ Archive แล้ว</p></div></div>
    ${total ? `<div class="dash">
      <section class="panel third"><h2>ความคืบหน้ารวม</h2>
        <div class="big">${pct(by.Done, total)}%</div><div class="sub">เสร็จ ${by.Done} จาก ${total} งาน</div>
        <div class="stack" role="img" aria-label="สัดส่วนสถานะ">${STATUS.map(s => by[s.id] ? `<i class="${s.cls}" style="flex:${by[s.id]}" title="${s.th} ${by[s.id]}"></i>` : '').join('')}</div>
        <div class="legend">${STATUS.map(s => `<span class="pill ${s.cls}">${s.th} ${by[s.id]}</span>`).join('')}</div>
      </section>
      <section class="panel third"><h2>ต้องตามด่วน</h2>
        <div class="big" style="color:${overdue.length ? 'var(--late)' : 'inherit'}">${overdue.length}</div>
        <div class="sub">งานเกินกำหนด · ใกล้ครบกำหนดอีก ${soon.length} งาน</div>
        <div class="list" style="margin-top:12px">${overdue.slice(0, 5).map(item).join('') || '<div class="empty">ไม่มีงานเกินกำหนด</div>'}</div>
      </section>
      <section class="panel third"><h2>ภาระงานรายคน</h2><div class="sub" style="margin-bottom:8px">จำนวนงานที่ยังไม่เสร็จ</div>
        ${loadList.map(x => `<div class="hbar"><span class="label">${esc(personFull(x.p))}</span>
          <span class="track"><i style="width:${pct(x.n, maxLoad)}%;background:var(--cap-ip)"></i></span><span class="val">${x.n} งาน</span></div>`).join('') || '<div class="empty">ยังไม่มีการมอบหมายงาน</div>'}
      </section>
      <section class="panel wide"><h2>ความคืบหน้ารายฝ่าย</h2>
        ${units.map(u => `<div class="hbar"><span class="label">${esc(unitName(u.id))}</span>
          <span class="track"><i class="${u.late ? 'warn' : ''}" style="width:${pct(u.done, u.total)}%"></i></span>
          <span class="val">เสร็จ ${u.done}/${u.total}${u.late ? ' · เกินกำหนด ' + u.late : ''}</span></div>`).join('')}
      </section>
      ${budgetUnits.length ? `<section class="panel wide"><h2>งบประมาณรายฝ่าย (บาท)</h2>
        ${budgetUnits.map(u => {
          const base = u.cap || u.alloc || 1;
          const over = u.cap && u.alloc > u.cap;
          return `<div class="hbar"><span class="label">${esc(unitName(u.id))}</span>
            <span class="track"><i class="${over || u.spent > base ? 'warn' : ''}" style="width:${Math.min(100, pct(u.spent, base))}%"></i></span>
            <span class="val">ใช้ ${num(u.spent)} / ตั้งไว้ ${num(u.alloc)}${u.cap ? ' · เพดาน ' + num(u.cap) : ''}${over ? ' · เกินเพดาน' : ''}</span></div>`;
        }).join('')}</section>` : ''}
    </div>` : '<div class="list"><div class="empty">ยังไม่มีงานในขอบเขตนี้ กด "+ งานใหม่" เพื่อเริ่ม</div></div>'}`;
  }

  // ============================ ทีม ============================

  function viewTeam() {
    const d = S.data;
    const peopleAt = {};
    d.memberships.forEach(m => { (peopleAt[m.positionId] = peopleAt[m.positionId] || []).push(m); });
    const groups = d.units.filter(u => u.level === 1).sort((a, b) => a.sort - b.sort).map(g => {
      const subs = d.units.filter(u => u.parentId === g.id).sort((a, b) => a.sort - b.sort);
      return `<section class="org-group"><h2>${esc(g.name)}</h2><div class="org-units">${subs.map(u => {
        const pos = d.positions.filter(p => p.unitId === u.id).sort((a, b) => a.sort - b.sort);
        return `<div class="org-unit"><h3>${esc(u.name)}</h3>${pos.map(p => {
          const ms = peopleAt[p.id] || [];
          return `<div class="pos"><div class="pn"><span>${esc(p.name)}${p.board ? ' <span class="board-badge">Board</span>' : ''}</span>
            <span>${ms.length}${p.planned ? '/' + p.planned : ''}</span></div>
            <div class="ppl">${ms.map(m => {
              const per = d.personById[m.personId];
              if (!per) return '';
              const contact = per.phone || per.lineId ? `<span class="contact">${esc([per.phone, per.lineId ? 'LINE ' + per.lineId : ''].filter(Boolean).join(' · '))}</span>` : '';
              return `<span>${esc(per.name)}${per.nickname ? ' (' + esc(per.nickname) + ')' : ''}${m.boardStatus === 'Pending' ? ' <span class="sub">รออนุมัติ</span>' : ''} ${contact}</span>`;
            }).join('')}</div></div>`;
        }).join('')}</div>`;
      }).join('')}</div></section>`;
    }).join('');
    return `<div class="page-head"><div><h1>โครงสร้างทีม</h1><p>ตัวเลขด้านขวาคือคนที่มีอยู่ / จำนวนที่วางแผนไว้${isBoard() ? ' · เบอร์โทรและ LINE เห็นเฉพาะ Board' : ''}</p></div></div>
      <div class="org">${groups}</div>`;
  }

  // ============================ โปรไฟล์ ============================

  function viewProfile() {
    const me = S.data.me;
    return `<div class="page-head"><div><h1>${esc(me.displayName)}</h1><p>${esc(me.email)} · สิทธิ์ ${esc(me.role)}${me.isHR ? ' · จัดการคนได้' : ''}</p></div>
      <button class="btn" data-act="signout">ออกจากระบบ</button></div>
      <div class="dash">
        <section class="panel"><h2>ตำแหน่ง</h2>
          <div class="tags">${me.titles.map(t => `<span class="tag plain">${esc(t.position)} · ${esc(t.unit)}${t.boardStatus === 'Pending' ? ' (รออนุมัติ Board)' : ''}</span>`).join('') || '<span class="sub">ยังไม่มีตำแหน่ง ติดต่อฝ่าย HR</span>'}</div>
        </section>
        <section class="panel"><h2>ข้อมูลติดต่อและอีเมล</h2>
          <form class="form-grid" data-form="me">
            <label class="field">ชื่อเล่น<input type="text" name="nickname" value="${esc(me.nickname)}" maxlength="50"></label>
            <label class="field">เบอร์โทร<input type="text" name="phone" value="${esc(me.phone)}" maxlength="30"></label>
            <label class="field">LINE ID<input type="text" name="lineId" value="${esc(me.lineId)}" maxlength="50"></label>
            <label class="check"><input type="checkbox" name="emailOptOut" ${me.emailOptOut ? 'checked' : ''}> ไม่รับอีเมลแจ้งเตือนและสรุปงานรายวัน</label>
            <div><button class="btn primary" type="submit">บันทึกข้อมูล</button></div>
          </form>
          <p class="sub">เบอร์โทรและ LINE จะแสดงให้เฉพาะ Board เห็น</p>
        </section>
        ${profileCalendarHtml()}
      </div>`;
  }

  // ============================ นัดประชุม (Board) ============================

  const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const DUR = [30, 60, 90, 120, 180];
  const CAL_STATUS = {
    OK: { th: 'เชื่อมแล้ว', cls: 'ok' },
    NoAccess: { th: 'ยังไม่ได้แชร์ให้ระบบ', cls: 'wait' },
    Error: { th: 'ตรวจไม่ได้', cls: 'bad' },
    NoEmail: { th: 'ไม่มีอีเมล', cls: 'bad' },
    Unchecked: { th: 'ยังไม่ได้ตรวจ', cls: 'wait' },
  };
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dowOf = ymd => DOW[new Date(ymd + 'T00:00:00Z').getUTCDay()];
  const bkkMs = (ymd, min) => Date.parse(ymd + 'T00:00:00+07:00') + min * 60000;
  const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  const bkkParts = iso => {
    const d = new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString();
    return { ymd: d.slice(0, 10), min: Number(d.slice(11, 13)) * 60 + Number(d.slice(14, 16)) };
  };
  function meetState() {
    if (!S.meet) S.meet = { from: todayYmd(), days: 7, startH: 9, endH: 22, dur: 60, sel: null, fb: null, loading: false, meetings: null, form: null };
    return S.meet;
  }
  function calBadge(status, reason) {
    const st = CAL_STATUS[status] || CAL_STATUS.Error;
    return `<span class="cal-st ${st.cls}">${st.th}${status === 'Error' && reason ? ' (' + esc(reason) + ')' : ''}</span>`;
  }
  function calSetupHtml(central) {
    return `<ol class="steps">
      <li>เปิด <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">การตั้งค่า Google Calendar</a> บนคอมพิวเตอร์ แล้วเลือกปฏิทินของคุณทางซ้าย (ใต้ “การตั้งค่าสำหรับปฏิทินของฉัน”)</li>
      <li>หัวข้อ “แชร์กับบุคคลหรือกลุ่มที่เฉพาะเจาะจง” (Share with specific people) กด “เพิ่มบุคคล” แล้วใส่ <b class="mono">${esc(central || 'บัญชีกลางของระบบ')}</b></li>
      <li>สิทธิ์เลือก <b>“ดูเฉพาะว่าง/ไม่ว่าง (ซ่อนรายละเอียด)”</b> แล้วกดส่ง — ระบบจะเห็นแค่ช่วงที่ไม่ว่าง ไม่เห็นชื่อนัด</li>
      <li>กลับมากด “ตรวจสอบการเชื่อม”</li>
    </ol>
    <p class="sub">ถ้าแชร์จากบัญชีมหาวิทยาลัยไม่ได้ (บางมหาวิทยาลัยปิดการแชร์ออกนอกโดเมน) ให้แชร์จากปฏิทิน Gmail ส่วนตัว แล้วใส่อีเมลนั้นในช่อง “อีเมลปฏิทิน”</p>`;
  }

  async function loadMeet(force) {
    const M = meetState();
    try {
      if (!S.cal || force) S.cal = (await api('calendar.people')).data;
      if (!M.meetings || force) M.meetings = (await api('meeting.list')).data.meetings;
      if (!M.fb || force) {
        M.loading = true;
        const fb = (await api('calendar.freebusy', { from: M.from, days: M.days })).data;
        M.fb = fb;
        if (!M.sel) M.sel = new Set(fb.people.filter(p => p.status === 'OK').map(p => p.personId));
      }
      M.err = '';
    } catch (e) { fail(e); M.err = e.message || 'โหลดไม่สำเร็จ'; }
    M.loading = false;
    if (S.view === 'meet') renderMain();
  }

  /** คำนวณช่องว่างจาก busy ของคนที่เลือก (เฉพาะคนที่เชื่อมปฏิทินแล้ว) */
  function meetCalc() {
    const M = S.meet, fb = M.fb;
    const sel = fb.people.filter(p => M.sel.has(p.personId));
    const known = sel.filter(p => p.status === 'OK');
    const unknown = sel.filter(p => p.status !== 'OK');
    const busy = {};
    known.forEach(p => { busy[p.personId] = p.busy.map(b => [Date.parse(b[0]), Date.parse(b[1])]); });
    const busyAt = (s, e) => known.filter(p => busy[p.personId].some(b => b[0] < e && b[1] > s)).map(p => p.personId);
    const days = [];
    for (let i = 0; i < fb.days; i++) days.push(addDays(fb.from, i));
    const lo = M.startH * 60, hi = M.endH * 60, now = Date.now();
    // ช่อง 30 นาทีสำหรับตาราง
    const cells = days.map(day => {
      const col = [];
      for (let m = lo; m + 30 <= hi; m += 30) {
        const s = bkkMs(day, m), e = s + 30 * 60000;
        col.push({ day, min: m, past: e <= now, busy: busyAt(s, e) });
      }
      return col;
    });
    // เวลาเริ่มที่ใช้ได้ตามความยาวประชุม
    const cands = [];
    days.forEach(day => {
      for (let m = lo; m + M.dur <= hi; m += 30) {
        const s = bkkMs(day, m);
        if (s < now) continue;
        const b = busyAt(s, s + M.dur * 60000);
        cands.push({ day, min: m, busy: b, free: known.length - b.length });
      }
    });
    let best = -1;
    cands.forEach(c => { best = Math.max(best, c.free); });
    const ranges = [];
    cands.filter(c => c.free === best).forEach(c => {
      const last = ranges[ranges.length - 1];
      if (last && last.day === c.day && last.lastMin + 30 === c.min && last.busy.join() === c.busy.join()) last.lastMin = c.min;
      else ranges.push({ day: c.day, min: c.min, lastMin: c.min, busy: c.busy });
    });
    return { sel, known, unknown, days, cells, ranges, best, busyAt };
  }

  function viewMeet() {
    const M = meetState();
    if (!M.fb || !S.cal || !M.meetings) {
      if (!M.loading && !M.err) { M.loading = true; loadMeet(false); }
      return `<div class="page-head"><div><h1>นัดประชุม Board</h1></div>${M.err ? '<button class="btn" data-act="meet-reload">ลองอีกครั้ง</button>' : ''}</div>
        <div class="list"><div class="empty">${M.err ? esc(M.err) : 'กำลังดึงปฏิทิน…'}</div></div>`;
    }
    const d = S.data, fb = M.fb, C = meetCalc();
    const meId = d.me.personId;
    const mine = fb.people.find(p => p.personId === meId);
    const nameOf = id => { const p = (S.cal.people.find(x => x.personId === id) || {}); return p.nickname || p.name || personName(id); };
    const hours = [];
    for (let h = 0; h <= 24; h++) hours.push(h);

    const banner = mine && mine.status !== 'OK' ? `<section class="panel wide calwarn"><h2>ปฏิทินของคุณยังไม่ได้เชื่อม ${calBadge(mine.status, mine.reason)}</h2>
      <p class="sub">คนอื่นจะเห็นว่าคุณ “ไม่ทราบสถานะ” จนกว่าจะแชร์ปฏิทิน (${esc(mine.calendarId || 'ไม่มีอีเมล')})</p>${calSetupHtml(fb.central)}
      <div class="acts"><a class="btn small" href="#/profile">ตั้งค่าอีเมลปฏิทิน / ตรวจสอบการเชื่อม</a></div></section>` : '';

    const chips = fb.people.slice().sort((a, b) => nameOf(a.personId).localeCompare(nameOf(b.personId), 'th')).map(p => {
      const on = M.sel.has(p.personId), st = CAL_STATUS[p.status] || CAL_STATUS.Error;
      return `<button type="button" class="pchip${on ? ' on' : ''}" data-act="meet-toggle" data-id="${esc(p.personId)}" aria-pressed="${on}"
        title="${esc(personFull(p.personId))} · ${esc(p.calendarId)} · ${esc(st.th)}"><i class="dot ${st.cls}"></i>${esc(nameOf(p.personId))}${p.personId === meId ? ' (ฉัน)' : ''}</button>`;
    }).join('');

    const controls = `<div class="meet-controls">
      <label class="field">เริ่มดูวันที่<input type="date" data-meet="from" value="${esc(M.from)}" min="${todayYmd()}"></label>
      <label class="field">ดูกี่วัน<select data-meet="days">${[3, 7, 14].map(n => `<option value="${n}" ${M.days === n ? 'selected' : ''}>${n} วัน</option>`).join('')}</select></label>
      <label class="field span2">ช่วงเวลา
        <span class="row-inline"><select data-meet="startH" aria-label="ตั้งแต่">${hours.slice(0, 24).map(h => `<option value="${h}" ${M.startH === h ? 'selected' : ''}>${hhmm(h * 60)}</option>`).join('')}</select>
        <select data-meet="endH" aria-label="ถึง">${hours.slice(1).map(h => `<option value="${h}" ${M.endH === h ? 'selected' : ''}>${hhmm(h * 60)}</option>`).join('')}</select></span></label>
      <label class="field">ประชุมนาน<select data-meet="dur">${DUR.map(n => `<option value="${n}" ${M.dur === n ? 'selected' : ''}>${n < 60 ? n + ' นาที' : n / 60 + ' ชม.'}</option>`).join('')}</select></label>
      <div class="acts presets"><span class="sub">ด่วน:</span>
        <button class="btn small" data-act="meet-preset" data-s="9" data-e="22">ทั้งวัน 09–22</button>
        <button class="btn small" data-act="meet-preset" data-s="9" data-e="17">กลางวัน 09–17</button>
        <button class="btn small" data-act="meet-preset" data-s="18" data-e="22">ค่ำ 18–22</button></div>
    </div>`;

    let sugg;
    if (!C.known.length) sugg = '<div class="empty">เลือกคนที่เชื่อมปฏิทินแล้วอย่างน้อย 1 คน ระบบจึงจะหาเวลาว่างได้</div>';
    else if (!C.ranges.length) sugg = '<div class="empty">ไม่มีช่วงที่ยาวพอในวันและเวลาที่เลือก ลองขยายช่วงเวลาหรือเพิ่มจำนวนวัน</div>';
    else {
      const all = C.best === C.known.length;
      sugg = `<p class="sub">${all ? `ช่วงที่ทุกคนที่เลือกว่าง (${C.known.length} คน)` : `ไม่มีช่วงที่ทุกคนว่าง — ช่วงที่ว่างมากที่สุด ${C.best}/${C.known.length} คน`}
        ${C.unknown.length ? ` · ไม่ทราบสถานะ ${C.unknown.length} คน (${C.unknown.map(p => esc(nameOf(p.personId))).join(', ')})` : ''}</p>
        <div class="sugg">${C.ranges.slice(0, 10).map(r => `<div class="sg">
          <div><b>${dowOf(r.day)} ${esc(dateTh(r.day))}</b> · ${hhmm(r.min)}–${hhmm(r.lastMin + M.dur)} น.
            ${r.lastMin > r.min ? `<div class="sub">เริ่มได้ระหว่าง ${hhmm(r.min)}–${hhmm(r.lastMin)} น.</div>` : ''}
            ${r.busy.length ? `<div class="sub">ไม่ว่าง: ${r.busy.map(id => esc(nameOf(id))).join(', ')}</div>` : ''}</div>
          <button class="btn small primary" data-act="meet-slot" data-day="${r.day}" data-min="${r.min}">นัดเวลานี้</button></div>`).join('')}
          ${C.ranges.length > 10 ? `<div class="sub">และอีก ${C.ranges.length - 10} ช่วง ดูได้ในตารางด้านล่าง</div>` : ''}</div>`;
    }

    const rows = C.cells.length ? C.cells[0].map((_, i) => {
      const m = C.cells[0][i].min;
      return `<tr><th scope="row" class="tm">${m % 60 === 0 ? hhmm(m) : ''}</th>${C.cells.map(col => {
        const c = col[i];
        const free = C.known.length - c.busy.length;
        const lvl = C.known.length ? Math.round((4 * free) / C.known.length) : -1;
        const tip = c.past ? 'ผ่านไปแล้ว' : C.known.length ? `${hhmm(c.min)} ว่าง ${free}/${C.known.length}${c.busy.length ? ' · ไม่ว่าง: ' + c.busy.map(nameOf).join(', ') : ''}` : '';
        return `<td><button type="button" class="hm${c.past ? ' past' : ' l' + lvl}" ${c.past ? 'disabled' : `data-act="meet-slot" data-day="${c.day}" data-min="${c.min}"`}
          title="${esc(tip)}" aria-label="${esc(dowOf(c.day) + ' ' + dateTh(c.day) + ' ' + tip)}">${!c.past && free > 0 && free < C.known.length ? free : ''}</button></td>`;
      }).join('')}</tr>`;
    }).join('') : '';
    const grid = `<div class="hm-wrap"><table class="hmap"><thead><tr><th></th>${C.days.map(day => `<th scope="col"><span>${dowOf(day)}</span> ${esc(dateTh(day))}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="legend hm-legend"><span><i class="hm l4"></i> ทุกคนว่าง</span><span><i class="hm l2"></i> ว่างบางคน (ตัวเลข = จำนวนคนว่าง)</span><span><i class="hm l0"></i> ไม่มีใครว่าง</span><span class="sub">กดช่องเพื่อนัดเวลานั้น</span></div>`;

    const meetings = M.meetings.map(m => {
      const s = bkkParts(m.start), e = bkkParts(m.end);
      return `<div class="item mt"><div class="when"><b>${dowOf(s.ymd)} ${esc(dateTh(s.ymd))}</b><span>${hhmm(s.min)}–${hhmm(e.min)} น.</span></div>
        <span class="main"><span class="t">${esc(m.title)}</span><span class="meta">${m.location ? `<span>${esc(m.location)}</span>` : ''}
          <span>${m.attendeeIds.length} คน: ${m.attendeeIds.map(id => esc(nameOf(id))).join(', ')}</span><span>นัดโดย ${esc(m.createdByName)}</span></span></span>
        <span class="acts">${m.meetLink ? `<a class="btn small primary" href="${esc(m.meetLink)}" target="_blank" rel="noopener">เข้า Meet</a>` : ''}
          ${m.htmlLink ? `<a class="btn small" href="${esc(m.htmlLink)}" target="_blank" rel="noopener">ปฏิทิน</a>` : ''}
          ${m.canCancel ? `<button class="btn small danger" data-act="meet-cancel" data-id="${esc(m.id)}">ยกเลิกนัด</button>` : ''}</span></div>`;
    }).join('') || '<div class="empty">ยังไม่มีนัดที่สร้างจากระบบ</div>';

    return `<div class="page-head"><div><h1>นัดประชุม Board</h1>
        <p>ดูช่วงว่างของ Board จาก Google Calendar (เห็นแค่ว่าง/ไม่ว่าง ไม่เห็นรายละเอียดนัด) แล้วสร้างนัดพร้อมส่งคำเชิญ</p></div>
        <button class="btn" data-act="meet-reload">ดึงปฏิทินใหม่</button></div>
      <div class="dash">
        ${banner}
        ${M.form ? meetFormHtml(C, nameOf) : ''}
        <section class="panel wide"><h2>ใครเข้าประชุม <span class="sub">${M.sel.size}/${fb.people.length} คน</span></h2>
          <div class="pchips">${chips}</div>
          <div class="acts" style="margin-top:10px"><button class="btn small" data-act="meet-all">เลือกทุกคนที่เชื่อมแล้ว</button>
            <button class="btn small" data-act="meet-none">ล้าง</button>
            <span class="legend"><span><i class="dot ok"></i> เชื่อมปฏิทินแล้ว</span><span><i class="dot wait"></i> ยังไม่แชร์ปฏิทิน (ไม่นับในการหาเวลา)</span></span></div>
          ${controls}
        </section>
        <section class="panel wide"><h2>เวลาที่แนะนำ</h2>${sugg}</section>
        <section class="panel wide"><h2>ตารางว่าง <span class="sub">${esc(dateTh(C.days[0]))} – ${esc(dateTh(C.days[C.days.length - 1]))} · ${hhmm(M.startH * 60)}–${hhmm(M.endH * 60)} น.</span></h2>${grid}</section>
        <section class="panel wide"><h2>นัดที่จะถึง</h2><div class="list">${meetings}</div></section>
      </div>`;
  }

  function meetFormHtml(C, nameOf) {
    const F = S.meet.form, me = S.data.me.personId;
    const others = S.meet.fb.people.filter(p => F.ids.indexOf(p.personId) === -1);
    return `<section class="panel wide meet-form" id="meet-form"><h2>สร้างนัดประชุม</h2>
      <form data-form="meeting" class="fields">
        <label class="field full">หัวข้อประชุม<input type="text" data-mf="title" value="${esc(F.title)}" maxlength="200" required placeholder="เช่น ประชุม Board ครั้งที่ 3"></label>
        <label class="field">วันที่<input type="date" data-mf="day" value="${esc(F.day)}" min="${todayYmd()}" required></label>
        <span class="row-inline">
          <label class="field">เริ่ม<input type="time" data-mf="time" value="${hhmm(F.min)}" step="900" required></label>
          <label class="field">นาน<select data-mf="dur">${DUR.map(n => `<option value="${n}" ${F.dur === n ? 'selected' : ''}>${n < 60 ? n + ' นาที' : n / 60 + ' ชม.'}</option>`).join('')}</select></label>
        </span>
        <label class="field">สถานที่ (ถ้ามี)<input type="text" data-mf="location" value="${esc(F.location)}" maxlength="200"></label>
        <label class="check" style="align-self:end"><input type="checkbox" data-mf="withMeet" ${F.withMeet ? 'checked' : ''}> แนบลิงก์ Google Meet</label>
        <label class="field full">วาระ / รายละเอียด<textarea data-mf="description" maxlength="5000">${esc(F.description)}</textarea></label>
        <div class="field full">ผู้เข้าประชุม (${F.ids.length} คน)
          <div class="tags">${F.ids.map(id => `<span class="tag">${esc(nameOf(id))}${id === me ? ' (ฉัน)' : `<button type="button" data-act="mf-remove" data-id="${esc(id)}" aria-label="เอาออก">×</button>`}</span>`).join('')}
            ${others.length ? `<select data-mf-add aria-label="เพิ่มผู้เข้าประชุม" style="width:auto;padding:3px 8px;font-size:13.5px"><option value="">+ เพิ่มคน</option>
              ${others.map(p => `<option value="${esc(p.personId)}">${esc(nameOf(p.personId))}</option>`).join('')}</select>` : ''}</div></div>
        <div class="full" id="mf-conflict">${meetConflictHtml(nameOf)}</div>
        <div class="full acts"><button class="btn primary" type="submit">สร้างนัดและส่งคำเชิญ</button>
          <button class="btn" type="button" data-act="mf-close">ยกเลิก</button>
          <span class="sub">คำเชิญส่งจากปฏิทินบัญชีกลางไปที่อีเมลปฏิทินของแต่ละคน</span></div>
      </form></section>`;
  }

  function meetConflictHtml(nameOf) {
    const F = S.meet.form, fb = S.meet.fb;
    nameOf = nameOf || (id => personName(id));
    if (!F.day || F.min == null || isNaN(F.min)) return '';
    const s = bkkMs(F.day, F.min), e = s + F.dur * 60000;
    if (s < Date.now()) return '<div class="warnbox">เวลาที่เลือกผ่านไปแล้ว</div>';
    const inRange = F.day >= fb.from && F.day < addDays(fb.from, fb.days);
    const people = fb.people.filter(p => F.ids.indexOf(p.personId) !== -1);
    if (!inRange) return '<p class="sub">วันนี้อยู่นอกช่วงที่ดึงปฏิทินไว้ จึงยังตรวจว่าใครว่างไม่ได้</p>';
    const busy = people.filter(p => p.status === 'OK' && p.busy.some(b => Date.parse(b[0]) < e && Date.parse(b[1]) > s));
    const unknown = people.filter(p => p.status !== 'OK');
    return `${busy.length ? `<div class="warnbox">ไม่ว่างช่วงนี้: ${busy.map(p => esc(nameOf(p.personId))).join(', ')}</div>` : '<div class="okbox">ทุกคนที่เชื่อมปฏิทินว่างช่วงนี้</div>'}
      ${unknown.length ? `<p class="sub">ไม่ทราบสถานะ: ${unknown.map(p => esc(nameOf(p.personId))).join(', ')}</p>` : ''}`;
  }

  function openMeetForm(day, min) {
    const M = S.meet, me = S.data.me.personId;
    const ids = [me].concat(Array.from(M.sel).filter(id => id !== me));
    M.form = Object.assign({ title: '', description: '', location: '', withMeet: true }, M.form || {}, { day, min, dur: M.dur, ids: M.form ? M.form.ids : ids });
    renderMain();
    const f = document.getElementById('meet-form');
    if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); const t = f.querySelector('[data-mf=title]'); if (t) t.focus({ preventScroll: true }); }
  }

  function refreshConflict() {
    const box = document.getElementById('mf-conflict');
    if (box) box.innerHTML = meetConflictHtml();
  }

  async function submitMeeting() {
    const F = S.meet.form, me = S.data.me.personId;
    if (!F.title.trim()) { toast('กรุณาใส่หัวข้อประชุม', 'err'); return; }
    const s = bkkMs(F.day, F.min), e = s + F.dur * 60000;
    const iso = ms => { const d = new Date(ms + 7 * 3600e3).toISOString(); return d.slice(0, 19) + '+07:00'; };
    try {
      const j = await api('meeting.create', { title: F.title, description: F.description, location: F.location, withMeet: F.withMeet,
                                              start: iso(s), end: iso(e), attendeeIds: F.ids.filter(id => id !== me) }, true);
      toast('สร้างนัดแล้ว ส่งคำเชิญ ' + j.data.invited + ' อีเมล');
      if (j.data.warning) toast(j.data.warning, 'warn');
      S.meet.form = null;
      S.meet.fb = null;
      S.meet.meetings = null;
      renderMain();
    } catch (err) { fail(err); }
  }

  // ---------- ส่วนปฏิทินในหน้าโปรไฟล์ ----------
  function profileCalendarHtml() {
    if (!isBoard()) return '';
    if (!S.cal) {
      if (!S.calLoading) {
        S.calLoading = true;
        api('calendar.people').then(j => { S.cal = j.data; }).catch(e => { S.calErr = e.message; })
          .finally(() => { S.calLoading = false; if (S.view === 'profile') renderMain(); });
      }
      return `<section class="panel wide"><h2>ปฏิทิน Google สำหรับนัดประชุม</h2><div class="empty">${S.calErr ? esc(S.calErr) : 'กำลังโหลด…'}</div></section>`;
    }
    const c = S.cal.me;
    return `<section class="panel wide"><h2>ปฏิทิน Google สำหรับนัดประชุม ${calBadge(c.status, c.reason)}</h2>
      <p class="sub">Board เห็นช่วงว่าง/ไม่ว่างของกันและกันในหน้า “นัดประชุม” ${c.lastCheckedAt ? '· ตรวจล่าสุด ' + esc(dateTimeTh(c.lastCheckedAt)) : ''}</p>
      ${c.status === 'OK' ? '' : calSetupHtml(S.cal.central)}
      <form class="row-inline cal-form" data-form="calcheck">
        <label class="field">อีเมลปฏิทิน (เว้นว่าง = ใช้อีเมลหลัก)
          <input type="email" name="calendarId" value="${esc(c.custom ? c.calendarId : '')}" placeholder="${esc(c.calendarId)}" list="my-emails"></label>
        <datalist id="my-emails">${(c.emails || []).map(e => `<option value="${esc(e)}">`).join('')}</datalist>
        <button class="btn primary" type="submit">ตรวจสอบการเชื่อม</button>
      </form></section>`;
  }

  // ============================ ถังขยะ ============================

  function viewTrash() {
    if (!S.trash) {
      api('trash.list').then(j => { S.trash = j.data.tasks; if (S.view === 'trash') renderMain(); }).catch(fail);
      return '<div class="page-head"><div><h1>ถังขยะ</h1></div></div><div class="list"><div class="empty">กำลังโหลด…</div></div>';
    }
    const list = S.trash.filter(t => !t.parentId || !S.trash.some(p => p.id === t.parentId));
    return `<div class="page-head"><div><h1>ถังขยะ</h1><p>งานที่ลบภายใน ${esc(S.data.settings.trashDays || 10)} วันกู้คืนได้ งานย่อยที่ลบพร้อมกันจะกลับมาด้วย</p></div>
      <button class="btn" data-act="trash-reload">โหลดใหม่</button></div>
      <div class="list">${list.map(t => `<div class="item ${ST[t.status].cls}"><span class="capdot"></span>
        <span class="main"><span class="t">${esc(t.title)}</span><span class="meta"><span>${esc(unitName(t.ownerUnitId))}</span>
        <span>ลบเมื่อ ${esc(dateTimeTh(t.deletedAt))} โดย ${esc(personName(t.deletedBy))}</span></span></span>
        <button class="btn small" data-act="restore" data-id="${esc(t.id)}">กู้คืน</button></div>`).join('') || '<div class="empty">ถังขยะว่าง</div>'}</div>`;
  }

  // ============================ จัดการคน (HR / Admin) ============================

  function viewAdmin() {
    if (!S.admin) {
      api('admin.people').then(j => { S.admin = j.data; if (S.view === 'admin') renderMain(); }).catch(fail);
      return '<div class="page-head"><div><h1>จัดการคน</h1></div></div><div class="list"><div class="empty">กำลังโหลด…</div></div>';
    }
    const d = S.data, A = S.admin, me = d.me;
    const posOptions = d.units.filter(u => u.level === 2).sort((a, b) => a.sort - b.sort).map(u =>
      `<optgroup label="${esc(u.name)}">${d.positions.filter(p => p.unitId === u.id).sort((a, b) => a.sort - b.sort)
        .map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.board ? ' (Board)' : ''}</option>`).join('')}</optgroup>`).join('');
    const q = S.adminQ.trim().toLowerCase();
    const people = A.people.filter(p => !q || (p.name + ' ' + p.nickname + ' ' + p.emails.map(e => e.email).join(' ') + ' ' + p.id).toLowerCase().indexOf(q) !== -1)
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    const grantsOf = id => (A.grants || []).filter(g => g.personId === id && g.active);
    return `<div class="page-head"><div><h1>จัดการคน</h1><p>${A.people.filter(p => p.active).length} คนในระบบ · คนที่ถูกผูกกับตำแหน่ง Board ต้องรอ Admin อนุมัติก่อน</p></div>
      <button class="btn" data-act="admin-reload">โหลดใหม่</button></div>
      <div class="admin-grid">
        <div class="org">
          <section class="panel wide"><h2>เพิ่มคนใหม่</h2>
            <form class="form-grid" data-form="add-person">
              <label class="field">ชื่อ-นามสกุล<input type="text" name="displayName" required maxlength="100"></label>
              <label class="field">ชื่อเล่น<input type="text" name="nickname" maxlength="50"></label>
              <label class="field">อีเมลที่ใช้ล็อกอิน<input type="email" name="email" required></label>
              <label class="field">ตำแหน่ง<select name="positionId"><option value="">— ยังไม่ระบุ —</option>${posOptions}</select></label>
              <div><button class="btn primary" type="submit">เพิ่มคน</button></div>
            </form>
          </section>
          ${A.pendingBoard.length ? `<section class="panel wide"><h2>รออนุมัติสิทธิ์ Board <span class="sub">${A.pendingBoard.length}</span></h2>
            ${A.pendingBoard.map(m => `<div class="person"><div class="nm">${esc(m.name)}</div><div class="ps">${esc(m.position)} · ${esc(m.unit)}</div>
              ${me.role === 'Admin' ? `<div class="acts">
                <button class="btn small primary" data-act="board-review" data-id="${esc(m.membershipId)}" data-ok="1">อนุมัติ</button>
                <button class="btn small" data-act="board-review" data-id="${esc(m.membershipId)}" data-ok="0">ไม่อนุมัติ</button></div>` : '<span class="sub">รอ Admin</span>'}
            </div>`).join('')}</section>` : ''}
        </div>
        <section class="panel wide" style="padding:0">
          <div style="padding:12px 14px;border-bottom:1px solid var(--line-soft)"><input type="search" placeholder="ค้นหาชื่อ อีเมล หรือรหัส" value="${esc(S.adminQ)}" data-admin-q aria-label="ค้นหาคน"></div>
          <div id="people-list">${people.map(p => `<div class="person${p.active ? '' : ' off'}">
            <div class="nm">${esc(p.name)}${p.nickname ? ' (' + esc(p.nickname) + ')' : ''} <span class="sub">${esc(p.id)}</span>
              ${p.active ? '' : '<span class="flag arch">ปิดบัญชี</span>'}${p.emailOptOut ? '<span class="flag arch">ปิดอีเมล</span>' : ''}
              ${grantsOf(p.id).map(g => `<span class="role">${esc(g.role === 'UnitAccess' ? 'เห็น ' + unitName(g.unitId) : g.role)}${A.grants ? ` <button class="btn ghost small" data-act="grant-revoke" data-id="${esc(g.id)}" aria-label="ถอนสิทธิ์">×</button>` : ''}</span>`).join('')}</div>
            <div class="em">${p.emails.map(e => `<span class="tag">${esc(e.email)}${e.isPrimary ? ' ★' : ''}
              ${p.emails.length > 1 ? `<button data-act="email-remove" data-p="${esc(p.id)}" data-e="${esc(e.email)}" aria-label="ลบอีเมล">×</button>` : ''}</span>`).join('')}
              <button class="btn ghost small" data-act="email-add" data-p="${esc(p.id)}">+ อีเมล</button></div>
            <div class="ps">${p.memberships.filter(m => m.active).map(m => `<span class="tag">${esc(m.position)} · ${esc(m.unit)}${m.boardStatus === 'Pending' ? ' (รออนุมัติ)' : m.boardStatus === 'Rejected' ? ' (ไม่อนุมัติ Board)' : ''}
              <button data-act="mem-end" data-id="${esc(m.membershipId)}" aria-label="ออกจากตำแหน่ง">×</button></span>`).join('')}
              <select data-mem-add="${esc(p.id)}" aria-label="เพิ่มตำแหน่ง" style="width:auto;padding:3px 8px;font-size:13.5px"><option value="">+ ตำแหน่ง</option>${posOptions}</select></div>
            <div class="acts">
              <button class="btn small" data-act="person-active" data-id="${esc(p.id)}" data-on="${p.active ? 0 : 1}">${p.active ? 'ปิดบัญชี' : 'เปิดบัญชี'}</button>
              ${A.grants ? `<select data-grant-add="${esc(p.id)}" aria-label="ให้สิทธิ์พิเศษ" style="padding:3px 8px;font-size:13.5px"><option value="">+ สิทธิ์พิเศษ</option>
                <option value="Board">Board (เห็นทุกฝ่าย)</option><option value="Admin">Admin</option>
                ${d.units.filter(u => u.level === 2).map(u => `<option value="UnitAccess:${esc(u.id)}">เห็นฝ่าย ${esc(u.name)}</option>`).join('')}</select>` : ''}
            </div></div>`).join('') || '<div class="empty">ไม่พบคนที่ค้นหา</div>'}</div>
        </section>
      </div>`;
  }

  async function adminAction(action, payload, okMsg) {
    try {
      await api(action, payload, true);
      toast(okMsg);
      const j = await api('admin.people');
      S.admin = j.data;
      await refresh();
      renderMain();
    } catch (e) { fail(e); }
  }

  // ============================ ลิ้นชักงาน ============================

  function openTask(id) {
    const t = S.data.taskById[id];
    if (!t) {
      toast('ไม่พบงาน ' + id + ' หรือคุณไม่มีสิทธิ์เข้าถึง', 'err');
      history.replaceState(null, '', '#/' + S.view);
      return;
    }
    if (S.drawer && S.drawer.id === id) return;
    S.drawer = { mode: 'view', id: id, detail: null, form: formFromTask(t), dirty: false, pickerQ: '', unitQ: '' };
    renderDrawer();
    loadDetail(id);
  }

  async function loadDetail(id) {
    try {
      const j = await api('task.get', { taskId: id });
      if (!S.drawer || S.drawer.id !== id) return;
      S.drawer.detail = j.data;
      upsertTask(Object.assign({}, j.data.task, { description: undefined }));
      if (!S.drawer.dirty) S.drawer.form = formFromTask(j.data.task);
      renderDrawer();
    } catch (e) { fail(e); }
  }

  function formFromTask(t) {
    return {
      title: t.title || '', description: t.description || '', status: t.status || 'NotStarted', priority: t.priority || 'Medium',
      startDate: t.startDate || '', dueDate: t.dueDate || '', progress: t.progress || 0,
      allocatedBudget: t.allocatedBudget == null ? '' : t.allocatedBudget, actualSpend: t.actualSpend == null ? '' : t.actualSpend,
      assigneeIds: (t.assigneeIds || []).slice(), collabUnitIds: (t.collabUnitIds || []).slice(), ownerUnitId: t.ownerUnitId || '',
    };
  }

  function newTask(parentId) {
    const d = S.data;
    const parent = parentId ? d.taskById[parentId] : null;
    const units = isBoard() ? d.units.filter(u => u.level === 2) : d.myUnits.map(id => d.unitById[id]);
    if (!parent && !units.length) { toast('คุณยังไม่มีฝ่ายสังกัด จึงสร้างงานไม่ได้ ติดต่อฝ่าย HR', 'err'); return; }
    S.drawer = { mode: 'create', parentId: parentId || '', detail: null, dirty: false, pickerQ: '', unitQ: '',
                 form: formFromTask({ ownerUnitId: parent ? parent.ownerUnitId
                                        : (S.filters.unit && units.some(u => u.id === S.filters.unit) ? S.filters.unit : (d.myUnits[0] || units[0].id)),
                                      assigneeIds: [d.me.personId] }) };
    renderDrawer();
    setTimeout(() => { const el = drawerRoot.querySelector('[data-f=title]'); if (el) el.focus(); }, 30);
  }

  function closeDrawer(force) {
    if (!S.drawer) return true;
    if (!force && S.drawer.dirty && !confirm('มีการแก้ไขที่ยังไม่บันทึก ปิดหน้านี้เลยไหม?')) return false;
    S.drawer = null;
    drawerRoot.innerHTML = '';
    if (/^#\/?task\//.test(location.hash)) history.replaceState(null, '', '#/' + S.view);
    return true;
  }

  function renderDrawer() {
    const D = S.drawer;
    if (!D) { drawerRoot.innerHTML = ''; return; }
    const d = S.data, f = D.form, create = D.mode === 'create';
    const t = create ? null : d.taskById[D.id];
    if (!create && !t) { closeDrawer(true); return; }
    const access = create ? 'owner' : t.access;
    const owner = access === 'owner';
    const det = D.detail;
    const isSub = create ? !!D.parentId : !!t.parentId;
    const hasChildren = !create && t.hasChildren;
    const s = ST[f.status] || ST.NotStarted;
    const dis = owner ? '' : 'disabled';
    const parent = isSub ? d.taskById[create ? D.parentId : t.parentId] : null;

    const ownerUnits = isBoard() ? d.units.filter(u => u.level === 2) : d.myUnits.map(id => d.unitById[id]);
    const pq = D.pickerQ.trim().toLowerCase();
    const pickPeople = d.people.filter(p => !pq || (p.name + ' ' + (p.nickname || '') + ' ' + (d.titleOf[p.id] || '')).toLowerCase().indexOf(pq) !== -1)
      .sort((a, b) => (f.assigneeIds.indexOf(b.id) !== -1) - (f.assigneeIds.indexOf(a.id) !== -1) || a.name.localeCompare(b.name, 'th')).slice(0, 60);
    const uq = D.unitQ.trim().toLowerCase();
    const pickUnits = d.units.filter(u => u.level === 2 && u.id !== f.ownerUnitId && (!uq || u.name.toLowerCase().indexOf(uq) !== -1));

    drawerRoot.innerHTML = `
      <div class="scrim" data-act="close"></div>
      <aside class="drawer ${s.cls}${D.entered ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="${create ? 'งานใหม่' : esc(t.title)}">
        <div class="drawer-head"><span class="capbar" aria-hidden="true"></span>
          <span class="id">${create ? (parent ? 'งานย่อยใหม่ใน ' + esc(parent.title) : 'งานใหม่') : esc(t.id) + (parent ? ' · งานย่อยของ ' + esc(parent.title) : '')}</span>
          ${!create && t.archived ? '<span class="flag arch">Archive</span>' : ''}
          <button class="btn ghost close" data-act="close" aria-label="ปิด">✕</button></div>
        <div class="drawer-body">
          ${!create && access === 'collab' ? '<div class="warnbox">คุณเป็นฝ่ายร่วมของงานนี้ แก้ได้เฉพาะสถานะ ความคืบหน้า คอมเมนต์ และไฟล์แนบ</div>' : ''}
          <input type="text" class="title-input" data-f="title" value="${esc(f.title)}" placeholder="ชื่องาน" maxlength="200" ${dis} aria-label="ชื่องาน">
          <div class="fields">
            <label class="field">สถานะ<select data-f="status">${STATUS.map(x => `<option value="${x.id}" ${f.status === x.id ? 'selected' : ''}>${x.th}</option>`).join('')}</select></label>
            <label class="field">ความสำคัญ<select data-f="priority" ${dis}>${Object.keys(PRIORITY).map(k => `<option value="${k}" ${f.priority === k ? 'selected' : ''}>${PRIORITY[k]}</option>`).join('')}</select></label>
            <label class="field">วันเริ่ม<input type="date" data-f="startDate" value="${esc(f.startDate)}" ${dis}></label>
            <label class="field">วันครบกำหนด<input type="date" data-f="dueDate" value="${esc(f.dueDate)}" ${dis}></label>
            ${create && !isSub ? `<label class="field full">ฝ่ายเจ้าของงาน<select data-f="ownerUnitId">${ownerUnits.map(u => `<option value="${esc(u.id)}" ${f.ownerUnitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>`
              : `<div class="field">ฝ่ายเจ้าของงาน<span class="val">${esc(unitName(f.ownerUnitId))}</span></div>`}
            ${hasChildren ? `<div class="field">ความคืบหน้า<span class="val">${t.progress}% (คำนวณจากงานย่อย ${t.childDone}/${t.childCount})</span></div>`
              : `<label class="field">ความคืบหน้า ${esc(f.progress)}%<input type="range" min="0" max="100" step="10" data-f="progress" value="${esc(f.progress)}"></label>`}
            ${!isSub && owner ? `<label class="field">งบที่ตั้งไว้ (บาท)<input type="number" min="0" step="0.01" data-f="allocatedBudget" value="${esc(f.allocatedBudget)}" ${dis}></label>
              <label class="field">ใช้จริง (บาท)<input type="number" min="0" step="0.01" data-f="actualSpend" value="${esc(f.actualSpend)}" ${dis}></label>` : ''}
            <label class="field full">รายละเอียด<textarea data-f="description" ${dis} placeholder="${owner ? 'สิ่งที่ต้องทำ ข้อกำหนด หรือลิงก์ที่เกี่ยวข้อง' : ''}">${esc(f.description)}</textarea></label>
          </div>

          <div class="section"><h3>ผู้รับผิดชอบ <span class="n">${f.assigneeIds.length}</span></h3>
            <div class="tags">${f.assigneeIds.map(id => `<span class="tag">${esc(personFull(id))}${owner ? `<button data-act="unassign" data-id="${esc(id)}" aria-label="เอาออก">×</button>` : ''}</span>`).join('') || '<span class="sub">ยังไม่มีผู้รับผิดชอบ</span>'}</div>
            ${owner ? `<input type="search" placeholder="ค้นหาชื่อ ชื่อเล่น หรือตำแหน่ง" value="${esc(D.pickerQ)}" data-pick="people" aria-label="ค้นหาผู้รับผิดชอบ">
              <div class="picker">${pickPeople.map(p => `<label class="check"><input type="checkbox" data-assign="${esc(p.id)}" ${f.assigneeIds.indexOf(p.id) !== -1 ? 'checked' : ''}>
                <span>${esc(p.name)}${p.nickname ? ' (' + esc(p.nickname) + ')' : ''} <span class="sub">${esc(d.titleOf[p.id] || '')}</span></span></label>`).join('') || '<div class="empty">ไม่พบชื่อนี้</div>'}</div>` : ''}
          </div>

          <div class="section"><h3>ฝ่ายร่วม <span class="n">${f.collabUnitIds.length}</span></h3>
            <p class="sub" style="margin:0">ฝ่ายร่วมเห็นงานนี้ และอัปเดตสถานะ ความคืบหน้า คอมเมนต์ และไฟล์ได้</p>
            <div class="tags">${f.collabUnitIds.map(id => `<span class="tag">${esc(unitName(id))}${owner ? `<button data-act="uncollab" data-id="${esc(id)}" aria-label="เอาออก">×</button>` : ''}</span>`).join('') || '<span class="sub">ไม่มี</span>'}</div>
            ${owner ? `<details><summary>เพิ่มฝ่ายร่วม</summary>
              <input type="search" placeholder="ค้นหาฝ่าย" value="${esc(D.unitQ)}" data-pick="units" style="margin:8px 0" aria-label="ค้นหาฝ่าย">
              <div class="picker">${pickUnits.map(u => `<label class="check"><input type="checkbox" data-collab="${esc(u.id)}" ${f.collabUnitIds.indexOf(u.id) !== -1 ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</div></details>` : ''}
          </div>

          ${!create && !isSub ? `<div class="section"><h3>งานย่อย <span class="n">${det ? det.children.length : t.childCount}</span></h3>
            ${det ? det.children.map(c => `<div class="subtask${c.status === 'Done' ? ' done' : ''}">
              <input type="checkbox" ${c.status === 'Done' ? 'checked' : ''} ${c.access === 'none' ? 'disabled' : ''} data-subdone="${esc(c.id)}" aria-label="ทำเครื่องหมายว่าเสร็จ">
              <span class="t" data-open="${esc(c.id)}">${esc(c.title)}</span>
              <span class="meta">${dueFlag(c)}${peopleDots(c.assigneeIds, 3)}</span></div>`).join('') || '<span class="sub">ยังไม่มีงานย่อย</span>' : '<span class="sub">กำลังโหลด…</span>'}
            ${owner ? `<div class="row-inline"><input type="text" placeholder="ชื่องานย่อย" data-subnew maxlength="200" aria-label="ชื่องานย่อยใหม่"><button class="btn" data-act="sub-add">เพิ่ม</button></div>` : ''}
          </div>` : ''}

          ${!create ? `<div class="section"><h3>ไฟล์แนบ <span class="n">${det ? det.attachments.length : ''}</span></h3>
            ${det ? det.attachments.map(a => `<div class="att"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
              <span class="sub">${esc(a.addedByName)}</span>
              ${owner || a.addedBy === d.me.personId ? `<button class="btn ghost small" data-act="att-remove" data-id="${esc(a.id)}" aria-label="ลบไฟล์แนบ">×</button>` : ''}</div>`).join('') : ''}
            <div class="row-inline"><input type="url" placeholder="วางลิงก์ (Google Drive, Canva ฯลฯ)" data-attlink aria-label="ลิงก์"><button class="btn" data-act="att-link">แนบลิงก์</button></div>
            <label class="btn small" style="width:fit-content">อัปโหลดไฟล์ (ไม่เกิน 10 MB)<input type="file" data-upload hidden></label>
          </div>

          <div class="section"><h3>คอมเมนต์ <span class="n">${det ? det.comments.length : ''}</span></h3>
            ${det ? det.comments.map(c => `<div class="comment"><div class="by"><strong>${esc(c.name)}</strong><span>${esc(dateTimeTh(c.createdAt))}</span>
              ${c.personId === d.me.personId || isBoard() ? `<button class="btn ghost small" data-act="cm-delete" data-id="${esc(c.id)}" style="margin-left:auto">ลบ</button>` : ''}</div>
              <div class="body">${esc(c.body)}</div></div>`).join('') : '<span class="sub">กำลังโหลด…</span>'}
            <textarea placeholder="เขียนคอมเมนต์" data-cmnew maxlength="5000" aria-label="คอมเมนต์ใหม่" style="min-height:64px"></textarea>
            <div><button class="btn" data-act="cm-add">ส่งคอมเมนต์</button></div>
          </div>

          ${det && det.history.length ? `<div class="section"><details><summary>ประวัติการแก้ไข (${det.history.length})</summary><div class="hist" style="margin-top:8px">
            ${det.history.map(h => `<div>${esc(dateTimeTh(h.changedAt))} · ${esc(h.changedByName)} · ${esc(fieldTh(h.field))}${h.field === '_created' ? '' : ': ' + esc(histVal(h.field, h.oldValue)) + ' → ' + esc(histVal(h.field, h.newValue))}</div>`).join('')}
          </div></details></div>` : ''}

          ${owner ? `<div class="section"><div class="acts">
            ${!isSub ? `<button class="btn small" data-act="sub-new">+ งานย่อยแบบละเอียด</button>` : ''}
            ${t.status === 'Done' || t.archived ? `<button class="btn small" data-act="archive" data-on="${t.archived ? 0 : 1}">${t.archived ? 'เอาออกจาก Archive' : 'ย้ายเข้า Archive'}</button>` : ''}
            <button class="btn small danger" data-act="delete">ลบงาน</button></div></div>` : ''}` : ''}
        </div>
        <div class="drawer-foot">
          <span class="hint">${create ? '' : 'แก้ล่าสุด ' + esc(dateTimeTh(t.updatedAt)) + ' โดย ' + esc(personName(t.updatedBy))}</span>
          <button class="btn" data-act="close">${D.dirty || create ? 'ยกเลิก' : 'ปิด'}</button>
          <button class="btn primary" data-act="save" ${D.dirty || create ? '' : 'disabled'}>${create ? 'สร้างงาน' : 'บันทึก'}</button>
        </div>
      </aside>`;
    D.entered = true;
  }

  function histVal(field, v) {
    if (field === 'Status') return ST[v] ? ST[v].th : v;
    if (field === 'Priority') return PRIORITY[v] || v;
    if (field === 'Assignees') return String(v || '').split(',').filter(Boolean).map(personName).join(', ') || '—';
    if (field === 'CollabUnits') return String(v || '').split(',').filter(Boolean).map(unitName).join(', ') || '—';
    if (field === 'StartDate' || field === 'DueDate') return dateTh(v) || '—';
    return v === '' || v == null ? '—' : v;
  }

  /** อัปเดตเฉพาะส่วนที่เปลี่ยนในลิ้นชัก โดยเก็บตำแหน่งเลื่อนไว้ */
  function rerenderDrawer() {
    const body = drawerRoot.querySelector('.drawer-body');
    const top = body ? body.scrollTop : 0;
    const focused = document.activeElement && document.activeElement.getAttribute('data-pick');
    renderDrawer();
    const nb = drawerRoot.querySelector('.drawer-body');
    if (nb) nb.scrollTop = top;
    if (focused) {
      const el = drawerRoot.querySelector('[data-pick="' + focused + '"]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  function markDirty() {
    if (!S.drawer || S.drawer.dirty) return;
    S.drawer.dirty = true;
    const save = drawerRoot.querySelector('[data-act=save]');
    if (save) save.disabled = false;
    const close = drawerRoot.querySelector('.drawer-foot [data-act=close]');
    if (close) close.textContent = 'ยกเลิก';
  }

  async function saveDrawer() {
    const D = S.drawer;
    if (!D) return;
    const f = D.form;
    if (!f.title.trim()) { toast('กรุณาใส่ชื่องาน', 'err'); return; }
    if (f.startDate && f.dueDate && f.startDate > f.dueDate) { toast('วันเริ่มต้องไม่หลังวันครบกำหนด', 'err'); return; }
    const saveBtn = drawerRoot.querySelector('[data-act=save]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (D.mode === 'create') {
        const p = { title: f.title, description: f.description, status: f.status, priority: f.priority, startDate: f.startDate,
                    dueDate: f.dueDate, progress: Number(f.progress), assigneeIds: f.assigneeIds, collabUnitIds: f.collabUnitIds };
        if (D.parentId) p.parentTaskId = D.parentId;
        else { p.ownerUnitId = f.ownerUnitId; p.allocatedBudget = f.allocatedBudget; p.actualSpend = f.actualSpend; }
        const j = await api('task.create', p, true);
        upsertTask(j.data.task);
        S.version = null;
        toast('สร้างงาน "' + j.data.task.title + '" แล้ว');
        S.drawer = null;
        renderBody();
        location.hash = '#/task/' + encodeURIComponent(j.data.task.id);
        return;
      }
      const t = S.data.taskById[D.id];
      const orig = formFromTask(Object.assign({}, t, D.detail ? { description: D.detail.task.description } : {}));
      const changes = {};
      ['title', 'description', 'status', 'priority', 'startDate', 'dueDate', 'progress', 'allocatedBudget', 'actualSpend'].forEach(k => {
        if (String(f[k]) !== String(orig[k])) changes[k] = k === 'progress' ? Number(f[k]) : f[k];
      });
      if (t.access !== 'owner') ['title', 'description', 'priority', 'startDate', 'dueDate', 'allocatedBudget', 'actualSpend'].forEach(k => delete changes[k]);
      if (t.hasChildren) delete changes.progress;
      const payload = { taskId: t.id, baseRevision: t.revision, changes: changes };
      const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
      if (t.access === 'owner' && !same(f.assigneeIds, orig.assigneeIds)) payload.assigneeIds = f.assigneeIds;
      if (t.access === 'owner' && !same(f.collabUnitIds, orig.collabUnitIds)) payload.collabUnitIds = f.collabUnitIds;
      const j = await api('task.update', payload, true);
      upsertTask(j.data.task);
      S.version = null;
      showConflicts(j.data.conflicts);
      toast(j.data.unchanged ? 'ไม่มีอะไรเปลี่ยน' : 'บันทึกแล้ว');
      D.dirty = false;
      renderBody();
      await loadDetail(t.id);
    } catch (e) {
      fail(e);
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function drawerOp(action, payload, okMsg) {
    const id = S.drawer && S.drawer.id;
    try {
      const j = await api(action, payload, true);
      if (j.data && j.data.task) upsertTask(j.data.task);
      S.version = null;
      if (okMsg) toast(okMsg);
      if (id && S.drawer && S.drawer.id === id) await loadDetail(id);
      await refresh();
      renderBody();
      if (S.drawer) rerenderDrawer();
      return j;
    } catch (e) { fail(e); return null; }
  }

  function uploadFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 10 MB', 'err'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1];
      toast('กำลังอัปโหลด ' + file.name);
      drawerOp('attachment.upload', { taskId: S.drawer.id, fileName: file.name, mimeType: file.type, base64: base64 }, 'อัปโหลด ' + file.name + ' แล้ว');
    };
    reader.readAsDataURL(file);
  }

  // ============================ เหตุการณ์ ============================

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    const act = e.target.closest('[data-act]');
    if (act) { handleAct(act, e); return; }
    if (open && !e.target.closest('input')) {
      if (S.drawer && S.drawer.dirty && !closeDrawer(false)) return;
      S.drawer = null;
      location.hash = '#/task/' + encodeURIComponent(open.dataset.open);
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      if (k === 'people') return;
      S.tableSort = { key: k, dir: S.tableSort.key === k ? -S.tableSort.dir : 1 };
      renderBody();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.drawer) { closeDrawer(false); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[data-open]')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Enter' && e.target.matches('[data-subnew]')) { e.preventDefault(); const b = drawerRoot.querySelector('[data-act=sub-add]'); if (b) b.click(); }
  });

  async function handleAct(el, e) {
    const a = el.dataset.act;
    const D = S.drawer;
    switch (a) {
      case 'dev-login': start(); break;
      case 'new-task': newTask(); break;
      case 'close': closeDrawer(false); break;
      case 'save': saveDrawer(); break;
      case 'signout': signOut(); break;
      case 'unassign': D.form.assigneeIds = D.form.assigneeIds.filter(x => x !== el.dataset.id); markDirty(); rerenderDrawer(); break;
      case 'uncollab': D.form.collabUnitIds = D.form.collabUnitIds.filter(x => x !== el.dataset.id); markDirty(); rerenderDrawer(); break;
      case 'cal': {
        const dd = Number(el.dataset.d);
        if (!dd) S.calMonth = todayYmd().slice(0, 7);
        else {
          const [y, m] = S.calMonth.split('-').map(Number);
          const n = new Date(Date.UTC(y, m - 1 + dd, 1));
          S.calMonth = n.toISOString().slice(0, 7);
        }
        renderBody();
        break;
      }
      case 'sub-add': {
        const inp = drawerRoot.querySelector('[data-subnew]');
        const title = inp && inp.value.trim();
        if (!title) return;
        if (await drawerOp('task.create', { parentTaskId: D.id, title: title }, 'เพิ่มงานย่อยแล้ว')) {
          const again = drawerRoot.querySelector('[data-subnew]'); if (again) again.focus();
        }
        break;
      }
      case 'sub-new': { const pid = D.id; if (closeDrawer(false)) newTask(pid); break; }
      case 'att-link': {
        const inp = drawerRoot.querySelector('[data-attlink]');
        const url = inp && inp.value.trim();
        if (!url) return;
        drawerOp('attachment.addLink', { taskId: D.id, url: url }, 'แนบลิงก์แล้ว');
        break;
      }
      case 'att-remove': if (confirm('ลบไฟล์แนบนี้?')) drawerOp('attachment.remove', { attachmentId: el.dataset.id }, 'ลบไฟล์แนบแล้ว'); break;
      case 'cm-add': {
        const inp = drawerRoot.querySelector('[data-cmnew]');
        const body = inp && inp.value.trim();
        if (!body) return;
        drawerOp('comment.add', { taskId: D.id, body: body }, 'ส่งคอมเมนต์แล้ว');
        break;
      }
      case 'cm-delete': if (confirm('ลบคอมเมนต์นี้?')) drawerOp('comment.delete', { commentId: el.dataset.id }, 'ลบคอมเมนต์แล้ว'); break;
      case 'archive': drawerOp('task.archive', { taskId: D.id, archived: el.dataset.on === '1' }, el.dataset.on === '1' ? 'ย้ายเข้า Archive แล้ว' : 'เอาออกจาก Archive แล้ว'); break;
      case 'delete': {
        const t = S.data.taskById[D.id];
        if (!confirm('ลบ "' + t.title + '"' + (t.childCount ? ' และงานย่อย ' + t.childCount + ' งาน' : '') + '? Board กู้คืนได้ภายใน 10 วัน')) return;
        try {
          await api('task.delete', { taskId: D.id }, true);
          toast('ลบ "' + t.title + '" แล้ว');
          closeDrawer(true);
          S.trash = null;
          await refresh();
          renderMain();
        } catch (err) { fail(err); }
        break;
      }
      case 'restore':
        try {
          await api('task.restore', { taskId: el.dataset.id }, true);
          toast('กู้คืนแล้ว');
          S.trash = null;
          await refresh();
          renderMain();
        } catch (err) { fail(err); }
        break;
      case 'trash-reload': S.trash = null; renderMain(); break;
      case 'admin-reload': S.admin = null; renderMain(); break;
      case 'board-review': adminAction('board.review', { membershipId: el.dataset.id, approve: el.dataset.ok === '1' }, el.dataset.ok === '1' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว'); break;
      case 'grant-revoke': if (confirm('ถอนสิทธิ์นี้?')) adminAction('grant.revoke', { grantId: el.dataset.id }, 'ถอนสิทธิ์แล้ว'); break;
      case 'email-add': {
        const email = prompt('อีเมลเพิ่มเติมที่ใช้ล็อกอิน (เช่น อีเมลมหาวิทยาลัยหรือ Gmail ส่วนตัว)');
        if (email) adminAction('email.add', { personId: el.dataset.p, email: email }, 'เพิ่มอีเมลแล้ว');
        break;
      }
      case 'email-remove': if (confirm('ลบอีเมล ' + el.dataset.e + '?')) adminAction('email.remove', { personId: el.dataset.p, email: el.dataset.e }, 'ลบอีเมลแล้ว'); break;
      case 'mem-end': if (confirm('ให้คนนี้ออกจากตำแหน่งนี้?')) adminAction('membership.end', { membershipId: el.dataset.id }, 'ออกจากตำแหน่งแล้ว'); break;
      case 'meet-toggle': {
        const M = S.meet, id = el.dataset.id;
        if (M.sel.has(id)) M.sel.delete(id); else M.sel.add(id);
        renderMain(); break;
      }
      case 'meet-all': S.meet.sel = new Set(S.meet.fb.people.filter(p => p.status === 'OK').map(p => p.personId)); renderMain(); break;
      case 'meet-none': S.meet.sel = new Set(); renderMain(); break;
      case 'meet-preset': S.meet.startH = Number(el.dataset.s); S.meet.endH = Number(el.dataset.e); renderMain(); break;
      case 'meet-reload': S.meet.fb = null; S.meet.meetings = null; S.cal = null; S.meet.err = ''; renderMain(); break;
      case 'meet-slot': openMeetForm(el.dataset.day, Number(el.dataset.min)); break;
      case 'mf-close': S.meet.form = null; renderMain(); break;
      case 'mf-remove': S.meet.form.ids = S.meet.form.ids.filter(x => x !== el.dataset.id); renderMain(); break;
      case 'meet-cancel': {
        const m = S.meet.meetings.find(x => x.id === el.dataset.id);
        if (!m || !confirm('ยกเลิกนัด “' + m.title + '”? ระบบจะแจ้งผู้ได้รับเชิญทุกคน')) break;
        try {
          await api('meeting.cancel', { meetingId: m.id }, true);
          toast('ยกเลิกนัดแล้ว');
          S.meet.meetings = null; S.meet.fb = null; renderMain();
        } catch (err) { fail(err); }
        break;
      }
      case 'person-active': adminAction('person.save', { personId: el.dataset.id, active: el.dataset.on === '1' }, el.dataset.on === '1' ? 'เปิดบัญชีแล้ว' : 'ปิดบัญชีแล้ว'); break;
      default: break;
    }
  }

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.mf && S.meet && S.meet.form) {
      const F = S.meet.form, k = el.dataset.mf;
      if (k === 'withMeet') F.withMeet = el.checked;
      else if (k === 'time') { const t = /^(\d{2}):(\d{2})/.exec(el.value); if (t) F.min = Number(t[1]) * 60 + Number(t[2]); refreshConflict(); }
      else if (k === 'dur') { F.dur = Number(el.value); refreshConflict(); }
      else if (k === 'day') { F.day = el.value; refreshConflict(); }
      else F[k] = el.value;
      return;
    }
    if (el.dataset.filter === 'q') { S.filters.q = el.value; renderBody(); return; }
    if (el.hasAttribute('data-admin-q')) {
      S.adminQ = el.value;
      clearTimeout(S.adminTimer);
      S.adminTimer = setTimeout(() => { renderMain(); const q = document.querySelector('[data-admin-q]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 200);
      return;
    }
    if (el.dataset.pick && S.drawer) {
      S.drawer[el.dataset.pick === 'people' ? 'pickerQ' : 'unitQ'] = el.value;
      rerenderDrawer();
      if (el.dataset.pick === 'units') { const det = drawerRoot.querySelector('details'); if (det) det.open = true; const i = drawerRoot.querySelector('[data-pick=units]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
      return;
    }
    if (el.dataset.f && S.drawer) {
      S.drawer.form[el.dataset.f] = el.value;
      markDirty();
      if (el.dataset.f === 'progress') { const lab = el.closest('label'); if (lab) lab.firstChild.textContent = 'ความคืบหน้า ' + el.value + '%'; }
    }
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.meet && S.meet) {
      const M = S.meet, k = el.dataset.meet;
      if (k === 'from') { if (!el.value) return; M.from = el.value; M.fb = null; }
      else M[k] = Number(el.value);
      if (k === 'days') M.fb = null;
      if (k === 'startH' && M.endH <= M.startH) M.endH = Math.min(24, M.startH + 1);
      if (k === 'endH' && M.startH >= M.endH) M.startH = Math.max(0, M.endH - 1);
      renderMain(); return;
    }
    if (el.dataset.mf && S.meet && S.meet.form) {
      const F = S.meet.form, k = el.dataset.mf;
      if (k === 'withMeet') F.withMeet = el.checked;
      if (k === 'dur') { F.dur = Number(el.value); refreshConflict(); }
      return;
    }
    if (el.hasAttribute('data-mf-add') && el.value && S.meet && S.meet.form) {
      S.meet.form.ids.push(el.value); renderMain(); return;
    }
    const f = el.dataset.filter;
    if (f === 'unit' || f === 'who') { S.filters[f] = el.value; renderBody(); return; }
    if (f === 'archived') { S.filters.archived = el.checked; renderBody(); return; }
    const D = S.drawer;
    if (el.dataset.assign && D) {
      const id = el.dataset.assign;
      D.form.assigneeIds = el.checked ? D.form.assigneeIds.concat([id]) : D.form.assigneeIds.filter(x => x !== id);
      markDirty(); rerenderDrawer(); return;
    }
    if (el.dataset.collab && D) {
      const id = el.dataset.collab;
      D.form.collabUnitIds = el.checked ? D.form.collabUnitIds.concat([id]) : D.form.collabUnitIds.filter(x => x !== id);
      markDirty(); rerenderDrawer();
      const det = drawerRoot.querySelector('details'); if (det) det.open = true;
      return;
    }
    if (el.dataset.f && D && el.tagName === 'SELECT') {
      D.form[el.dataset.f] = el.value;
      if (el.dataset.f === 'status' && el.value === 'Done' && !(D.mode !== 'create' && S.data.taskById[D.id].hasChildren)) D.form.progress = 100;
      if (el.dataset.f === 'ownerUnitId') D.form.collabUnitIds = D.form.collabUnitIds.filter(x => x !== el.value);
      markDirty(); rerenderDrawer(); return;
    }
    if (el.dataset.subdone !== undefined && el.dataset.subdone) {
      drawerOp('task.update', { taskId: el.dataset.subdone, changes: { status: el.checked ? 'Done' : 'InProgress' } }, el.checked ? 'งานย่อยเสร็จแล้ว' : 'เปิดงานย่อยอีกครั้ง');
      return;
    }
    if (el.hasAttribute('data-upload')) { uploadFile(el.files[0]); el.value = ''; return; }
    if (el.dataset.memAdd && el.value) { adminAction('membership.add', { personId: el.dataset.memAdd, positionId: el.value }, 'เพิ่มตำแหน่งแล้ว'); return; }
    if (el.dataset.grantAdd && el.value) {
      const [role, unitId] = el.value.split(':');
      if (role === 'Admin' && !confirm('ให้สิทธิ์ Admin (ดูแลระบบทั้งหมด)?')) { el.value = ''; return; }
      adminAction('grant.add', { personId: el.dataset.grantAdd, role: role, unitId: unitId || '' }, 'ให้สิทธิ์แล้ว');
    }
  });

  document.addEventListener('submit', async e => {
    const form = e.target;
    if (!form.dataset.form) return;
    e.preventDefault();
    const fd = new FormData(form);
    if (form.dataset.form === 'me') {
      try {
        const j = await api('me.update', { nickname: fd.get('nickname'), phone: fd.get('phone'), lineId: fd.get('lineId'),
                                           emailOptOut: fd.get('emailOptOut') === 'on' }, true);
        S.data.me = Object.assign(S.data.me, j.data);
        toast('บันทึกข้อมูลแล้ว');
        await refresh();
        renderShell();
      } catch (err) { fail(err); }
    }
    if (form.dataset.form === 'meeting') { await submitMeeting(); return; }
    if (form.dataset.form === 'calcheck') {
      try {
        const j = await api('calendar.check', { calendarId: String(fd.get('calendarId') || '').trim() }, true);
        const r = j.data;
        if (r.status === 'OK') toast('เชื่อมปฏิทินแล้ว (' + r.calendarId + ')');
        else if (r.status === 'NoAccess') toast('ระบบยังมองไม่เห็นปฏิทิน ' + r.calendarId + ' — แชร์ให้ ' + r.central + ' แบบดูเฉพาะว่าง/ไม่ว่างก่อน', 'warn');
        else toast('ตรวจปฏิทินไม่ได้: ' + r.reason, 'err');
        S.cal = (await api('calendar.people')).data;
        if (S.meet) S.meet.fb = null;
        renderMain();
      } catch (err) { fail(err); }
      return;
    }
    if (form.dataset.form === 'add-person') {
      try {
        const j = await api('person.save', { displayName: fd.get('displayName'), nickname: fd.get('nickname'), email: fd.get('email') }, true);
        if (fd.get('positionId')) await api('membership.add', { personId: j.data.personId, positionId: fd.get('positionId') }, true);
        toast('เพิ่ม ' + fd.get('displayName') + ' แล้ว');
        form.reset();
        S.admin = (await api('admin.people')).data;
        await refresh();
        renderMain();
      } catch (err) { fail(err); }
    }
  });

  window.addEventListener('hashchange', () => {
    if (!S.data) return;
    if (S.drawer && S.drawer.dirty && !/^#\/?task\//.test(location.hash)) {
      if (!closeDrawer(false)) { history.replaceState(null, '', '#/task/' + encodeURIComponent(S.drawer.id)); return; }
    }
    route();
  });

  window.addEventListener('beforeunload', e => {
    if (S.drawer && S.drawer.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ============================ อัปเดตอัตโนมัติ ============================

  function startPolling() {
    stopPolling();
    const sec = Math.max(10, Number(S.data.settings.pollSeconds) || 20);
    S.pollTimer = setInterval(poll, sec * 1000);
    document.addEventListener('visibilitychange', onVisible);
  }
  function stopPolling() {
    if (S.pollTimer) clearInterval(S.pollTimer);
    S.pollTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
  }
  function onVisible() { if (!document.hidden) poll(); }

  async function poll() {
    if (document.hidden || S.pending || !S.data) return;
    try {
      const j = await api('version');
      if (j.data.version === S.version) return;
      await refresh();
      if (['board', 'table', 'calendar'].indexOf(S.view) !== -1) renderBody();
      else if (['admin', 'profile', 'meet'].indexOf(S.view) === -1) renderMain();
      if (S.drawer && S.drawer.mode === 'view' && !S.drawer.dirty) {
        if (!S.data.taskById[S.drawer.id]) { toast('งานนี้ถูกลบหรือคุณไม่มีสิทธิ์เห็นแล้ว', 'warn'); closeDrawer(true); }
        else loadDetail(S.drawer.id);
      }
    } catch (e) { /* เงียบไว้ รอบหน้าลองใหม่ */ }
  }

  // ============================ เริ่มต้น ============================

  async function start() {
    app.innerHTML = '<div class="boot">กำลังโหลดงาน…</div>';
    try {
      await refresh();
    } catch (e) {
      if (S.token) renderLogin(e.message);
      return;
    }
    route();
    startPolling();
  }

  loadToken();
  if (S.token) start();
  else renderLogin();
})();
