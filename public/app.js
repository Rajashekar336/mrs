// ================= Helpers =================
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const num = (n, d = 2) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d });
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const signed = (n) => `<span class="${n >= 0 ? 'pos' : 'neg'}">${inr(n)}</span>`;
const IST = 'Asia/Kolkata';
const istDay = (d) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(d)) : '');
const prettyDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' }) : '');
const monthName = (s) => new Date(`${s}T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: IST });

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (error ? ' error' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = ''), 2800);
}

function table(cols, rows, { total, empty = 'No records yet.' } = {}) {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  const th = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('');
  const tr = (r, cls = '') => `<tr class="${cls}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`;
  return `<table><thead><tr>${th}</tr></thead><tbody>${rows.map((r) => tr(r)).join('')}${total ? tr(total, 'total') : ''}</tbody></table>`;
}

// ================= State =================
const S = { vehicles: [], drivers: [], quarries: [], customers: [], materials: [], categories: [], today: '' };
async function loadMasters() {
  [S.vehicles, S.drivers, S.quarries, S.customers, S.materials, S.categories] = await Promise.all(
    ['vehicles', 'drivers', 'quarries', 'customers', 'materials', 'expense-categories'].map((r) => api(`/api/${r}`)),
  );
}
const byId = (list, id) => list.find((x) => x._id === (id?._id || id));
const opt = (list, labelKey = 'name', { blank, activeOnly, keep } = {}) => [
  ...(blank !== undefined ? [{ value: '', label: blank }] : []),
  ...list.filter((x) => !activeOnly || x.active || x._id === keep).map((x) => ({ value: x._id, label: x[labelKey] + (x.active === false ? ' (inactive)' : '') })),
];

// ================= Dates =================
function addDays(s, n) { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function rangeOf(key) {
  const t = S.today;
  if (key === 'today') return [t, t];
  if (key === 'week') { const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; const s = addDays(t, -dow); return [s, addDays(s, 6)]; }
  const [y, m] = t.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${t.slice(0, 7)}-01`, `${t.slice(0, 7)}-${String(last).padStart(2, '0')}`];
}

// ================= Modal form =================
let modalSubmit = null;
let modalChange = null;
function openForm({ title, fields, values = {}, onSubmit, onChange, saveLabel = 'Save' }) {
  $('#modal-title').textContent = title;
  $('#modal-save').textContent = saveLabel;
  $('#modal-body').innerHTML = fields.map((f) => {
    if (f.type === 'section') return `<div class="section">${esc(f.label)}</div>`;
    const v = values[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}" ${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v?._id ?? v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" rows="2">${esc(v)}</textarea>`;
    } else if (f.type === 'checkbox') {
      return `<label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    } else {
      const step = f.type === 'number' ? `step="${f.step || 'any'}" min="0"` : '';
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.type === 'date' ? istDay(v) : v)}" ${step} ${req} placeholder="${esc(f.placeholder || '')}">`;
    }
    return `<label class="${f.wide ? 'wide' : ''}">${esc(f.label)}${f.required ? ' *' : ''}${input}</label>`;
  }).join('');
  modalSubmit = async () => {
    const data = {};
    for (const f of fields) {
      if (!f.name) continue;
      const el = $(`#modal-body [name="${f.name}"]`);
      data[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? Number(el.value || 0) : el.value;
    }
    await onSubmit(data);
  };
  modalChange = onChange || null;
  $('#modal-preview').innerHTML = '';
  if (modalChange) modalChange(null);
  $('#modal').showModal();
}
const formVal = (name) => $(`#modal-body [name="${name}"]`);
$('#modal-cancel').onclick = () => $('#modal').close();
$('#modal-body').addEventListener('input', (e) => modalChange && modalChange(e.target.name));
$('#modal-body').addEventListener('change', (e) => modalChange && modalChange(e.target.name));
$('#modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await modalSubmit();
    $('#modal').close();
  } catch (err) { toast(err.message, true); }
});

async function remove(route, id, label) {
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  try { await api(`/api/${route}/${id}`, { method: 'DELETE' }); toast('Deleted'); await refresh(); } catch (e) { toast(e.message, true); }
}

// ================= Load form =================
function purchaseRateFor(materialId, quarryId) {
  const m = byId(S.materials, materialId);
  return m?.purchaseRates.find((p) => p.quarry === quarryId)?.rate ?? 0;
}
function openLoadForm(load) {
  const isNew = !load;
  const defaultCustomer = S.customers.find((c) => c.active) || S.customers[0];
  const firstVehicle = S.vehicles.find((v) => v.active);
  const values = load ? { ...load } : {
    date: S.today,
    vehicle: firstVehicle?._id,
    driver: firstVehicle?.driver?._id,
    quarry: S.quarries.find((q) => q.active)?._id,
    material: S.materials.find((m) => m.active)?._id,
    customer: defaultCustomer?._id,
  };
  if (isNew) {
    values.purchaseRate = purchaseRateFor(values.material, values.quarry);
    values.saleRate = byId(S.materials, values.material)?.saleRate ?? 0;
  }
  const keep = (k) => values[k]?._id || values[k];
  openForm({
    title: isNew ? 'Add Load' : 'Edit Load',
    values,
    fields: [
      { type: 'section', label: 'Trip' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'vehicle', label: 'Vehicle', type: 'select', required: true, options: opt(S.vehicles, 'number', { activeOnly: true, keep: keep('vehicle') }) },
      { name: 'driver', label: 'Driver', type: 'select', required: true, options: opt(S.drivers, 'name', { activeOnly: true, keep: keep('driver') }) },
      { name: 'quarry', label: 'Quarry (loading from)', type: 'select', required: true, options: opt(S.quarries, 'name', { activeOnly: true, keep: keep('quarry') }) },
      { name: 'material', label: 'Material', type: 'select', required: true, options: opt(S.materials, 'name', { activeOnly: true, keep: keep('material') }) },
      { name: 'customer', label: 'Supplied to', type: 'select', required: true, options: opt(S.customers, 'name', { activeOnly: true, keep: keep('customer') }) },
      { name: 'quarryBillNo', label: 'Quarry bill / token no.' },
      { name: 'dcNo', label: 'DC / Invoice no.' },
      { type: 'section', label: 'Quantity & rates' },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'purchaseRate', label: 'Purchase rate (₹ / unit)', type: 'number' },
      { name: 'saleRate', label: 'Sale rate (₹ / unit)', type: 'number' },
      { type: 'section', label: 'Trip expenses' },
      { name: 'dieselCost', label: 'Diesel (₹)', type: 'number' },
      { name: 'driverBata', label: 'Driver bata (₹)', type: 'number' },
      { name: 'tollCost', label: 'Toll (₹)', type: 'number' },
      { name: 'otherCost', label: 'Other (₹)', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    onChange: (changed) => {
      if (changed === 'vehicle') {
        const v = byId(S.vehicles, formVal('vehicle').value);
        if (v?.driver) formVal('driver').value = v.driver._id;
      }
      if (changed === 'material' || changed === 'quarry') {
        formVal('purchaseRate').value = purchaseRateFor(formVal('material').value, formVal('quarry').value);
        if (changed === 'material') formVal('saleRate').value = byId(S.materials, formVal('material').value)?.saleRate ?? 0;
      }
      const n = (k) => Number(formVal(k).value || 0);
      const q = n('quantity');
      const sale = q * n('saleRate'), buy = q * n('purchaseRate');
      const trip = n('dieselCost') + n('driverBata') + n('tollCost') + n('otherCost');
      const profit = sale - buy - trip;
      const unit = byId(S.materials, formVal('material').value)?.unit || '';
      $('#modal-preview').innerHTML = `<div class="preview">
        <div>Sale amount<b>${inr(sale)}</b></div><div>Quarry cost<b>${inr(buy)}</b></div>
        <div>Trip expenses<b>${inr(trip)}</b></div><div>Profit (${num(q)} ${esc(unit)})<b class="${profit >= 0 ? 'pos' : 'neg'}">${inr(profit)}</b></div></div>`;
    },
    onSubmit: async (data) => {
      if (isNew) await api('/api/loads', { method: 'POST', body: data });
      else await api(`/api/loads/${load._id}`, { method: 'PUT', body: data });
      toast(isNew ? 'Load added' : 'Load updated');
      await refresh();
    },
  });
}

// ================= Pages =================
const charts = {};
function chart(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}
const COLORS = ['#f59e0b', '#2563eb', '#15803d', '#9333ea', '#dc2626', '#0891b2'];

function kpi(label, s, hl) {
  return `<div class="kpi ${hl ? 'hl' : ''}"><div class="label">${label}</div>
    <div class="value">${s.loads} <small style="font-size:14px;color:var(--muted)">loads</small></div>
    <div class="sub">Qty ${num(s.quantity)} · Revenue ${inr(s.revenue)}<br>
    Net profit ${signed(s.netProfit)} · Margin <b>${pct(s.margin)}</b></div></div>`;
}

function loadCols({ actions = true } = {}) {
  return [
    { label: 'Date', render: (l) => prettyDay(l.date) },
    { label: 'Vehicle', render: (l) => esc(l.vehicle?.number || '—') },
    { label: 'Driver', render: (l) => esc(l.driver?.name || '—') },
    { label: 'Quarry', render: (l) => esc(l.quarry?.name || '—') },
    { label: 'Material', render: (l) => esc(l.material?.name || '—') },
    { label: 'Qty', num: true, render: (l) => `${num(l.quantity)} ${esc(l.material?.unit || '')}` },
    { label: 'Sale', num: true, render: (l) => inr(l.saleAmount) },
    { label: 'Quarry cost', num: true, render: (l) => inr(l.purchaseAmount) },
    { label: 'Trip exp.', num: true, render: (l) => inr(l.tripExpenses) },
    { label: 'Profit', num: true, render: (l) => signed(l.profit) },
    ...(actions ? [{ label: '', render: (l) => (l._id ? `<button class="icon-btn" data-edit-load="${l._id}" title="Edit">✏️</button><button class="icon-btn" data-del-load="${l._id}" title="Delete">🗑️</button>` : '') }] : []),
  ];
}

const pages = {
  async dashboard() {
    const d = await api('/api/dashboard');
    $('#kpis').innerHTML = kpi(`Today · ${prettyDay(S.today + 'T00:00:00+05:30')}`, d.today, true)
      + kpi(`This week · ${d.weekRange[0].slice(5)} → ${d.weekRange[1].slice(5)}`, d.week)
      + kpi(`This month · ${monthName(d.monthLabel + '-01')}`, d.month);
    chart('ch-weeks', {
      type: 'bar',
      data: {
        labels: d.last8Weeks.map((w) => `Wk ${w.start.slice(5)}`),
        datasets: S.materials.map((m, i) => ({ label: m.name, backgroundColor: COLORS[i % COLORS.length], data: d.last8Weeks.map((w) => w.materials[m._id]?.loads || 0) })),
      },
      options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
    });
    chart('ch-months', {
      type: 'bar',
      data: {
        labels: d.last6Months.map((m) => monthName(m.start)),
        datasets: [
          { label: 'Revenue', backgroundColor: '#cbd5e1', data: d.last6Months.map((m) => m.revenue) },
          { label: 'Net profit', backgroundColor: '#f59e0b', data: d.last6Months.map((m) => m.netProfit) },
        ],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } },
    });
    const bd = (rows, list, key) => table([
      { label: key === 'number' ? 'Vehicle' : 'Material', render: (r) => esc(byId(list, r._id)?.[key] || '—') },
      { label: 'Loads', num: true, key: 'loads' },
      { label: 'Qty', num: true, render: (r) => num(r.quantity) },
      { label: 'Revenue', num: true, render: (r) => inr(r.revenue) },
      { label: 'Profit', num: true, render: (r) => signed(r.grossProfit) },
    ], rows, { empty: 'No loads this month yet.' });
    $('#dash-material').innerHTML = bd(d.monthByMaterial, S.materials, 'name');
    $('#dash-vehicle').innerHTML = bd(d.monthByVehicle, S.vehicles, 'number');
    $('#dash-recent').innerHTML = table(loadCols(), d.recent, { empty: 'No loads yet. Click “+ Add Load” to enter your first trip.' });
  },

  async loads() {
    const q = new URLSearchParams({ from: $('#lf-from').value, to: $('#lf-to').value });
    for (const k of ['vehicle', 'driver', 'material']) if ($(`#lf-${k}`).value) q.set(k, $(`#lf-${k}`).value);
    const rows = await api(`/api/loads?${q}`);
    const t = rows.reduce((a, l) => {
      for (const k of ['quantity', 'saleAmount', 'purchaseAmount', 'tripExpenses', 'profit']) a[k] += l[k] || 0;
      return a;
    }, { quantity: 0, saleAmount: 0, purchaseAmount: 0, tripExpenses: 0, profit: 0 });
    $('#loads-totals').innerHTML = `
      <div class="kpi hl"><div class="label">Loads</div><div class="value">${rows.length}</div><div class="sub">Qty ${num(t.quantity)}</div></div>
      <div class="kpi"><div class="label">Sale amount</div><div class="value">${inr(t.saleAmount)}</div></div>
      <div class="kpi"><div class="label">Quarry + trip cost</div><div class="value">${inr(t.purchaseAmount + t.tripExpenses)}</div></div>
      <div class="kpi"><div class="label">Trip profit</div><div class="value">${signed(t.profit)}</div><div class="sub">Margin ${pct(t.saleAmount ? (t.profit / t.saleAmount) * 100 : 0)}</div></div>`;
    $('#loads-table').innerHTML = table(loadCols(), rows, {
      total: rows.length ? { date: null, vehicle: { number: 'TOTAL' }, quantity: t.quantity, saleAmount: t.saleAmount, purchaseAmount: t.purchaseAmount, tripExpenses: t.tripExpenses, profit: t.profit } : null,
      empty: 'No loads in this period.',
    });
    $('#lf-csv').onclick = () => (location.href = `/api/loads.csv?${q}`);
  },

  async weekly() {
    const d = await api(`/api/reports/weekly?from=${$('#wf-from').value}&to=${$('#wf-to').value}`);
    $('#weekly-totals').innerHTML = kpi('Selected period', d.total, true)
      + `<div class="kpi"><div class="label">Avg loads / week</div><div class="value">${num(d.weeks.length ? d.total.loads / d.weeks.length : 0, 1)}</div><div class="sub">${d.weeks.length} week(s) with activity</div></div>`;
    const matCols = S.materials.map((m) => ({ label: m.name, num: true, render: (w) => (w.materials?.[m._id] ? `${w.materials[m._id].loads} <small>(${num(w.materials[m._id].quantity)})</small>` : '0') }));
    const total = { ...d.total, start: 'TOTAL', materials: {} };
    for (const w of d.weeks) for (const [k, v] of Object.entries(w.materials)) {
      total.materials[k] ??= { loads: 0, quantity: 0 };
      total.materials[k].loads += v.loads; total.materials[k].quantity += v.quantity;
    }
    $('#weekly-table').innerHTML = table([
      { label: 'Week (Mon–Sun)', render: (w) => (w.start === 'TOTAL' ? 'TOTAL' : `${prettyDay(w.start + 'T00:00:00+05:30')} → ${prettyDay(addDays(w.start, 6) + 'T00:00:00+05:30')}`) },
      { label: 'Loads', num: true, key: 'loads' },
      ...matCols,
      { label: 'Revenue', num: true, render: (w) => inr(w.revenue) },
      { label: 'Quarry cost', num: true, render: (w) => inr(w.purchase) },
      { label: 'Trip exp.', num: true, render: (w) => inr(w.tripExpenses) },
      { label: 'Other exp.', num: true, render: (w) => inr(w.otherExpenses) },
      { label: 'Net profit', num: true, render: (w) => signed(w.netProfit) },
      { label: 'Margin', num: true, render: (w) => pct(w.margin) },
    ], d.weeks, { total: d.weeks.length ? total : null, empty: 'No loads in this period.' });
    chart('ch-days', {
      type: 'bar',
      data: { labels: d.days.map((x) => x.start.slice(5)), datasets: [{ label: 'Loads', backgroundColor: '#f59e0b', data: d.days.map((x) => x.loads) }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  },

  async monthly() {
    const year = $('#mf-year').value;
    const d = await api(`/api/reports/monthly?year=${year}`);
    const months = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}-01`;
      return d.months.find((m) => m.start === key) || { start: key, loads: 0, quantity: 0, revenue: 0, purchase: 0, tripExpenses: 0, otherExpenses: 0, netProfit: 0, margin: 0 };
    });
    $('#monthly-totals').innerHTML = kpi(`Year ${year}`, d.total, true)
      + `<div class="kpi"><div class="label">Total expenses</div><div class="value">${inr(d.total.purchase + d.total.tripExpenses + d.total.otherExpenses)}</div>
         <div class="sub">Quarry ${inr(d.total.purchase)} · Trip ${inr(d.total.tripExpenses)} · Other ${inr(d.total.otherExpenses)}</div></div>`;
    chart('ch-ratio', {
      type: 'bar',
      data: {
        labels: months.map((m) => monthName(m.start).split(' ')[0].slice(0, 3)),
        datasets: [
          { type: 'line', label: 'Profit ratio %', yAxisID: 'y1', borderColor: '#2563eb', backgroundColor: '#2563eb', data: months.map((m) => +m.margin.toFixed(1)) },
          { label: 'Revenue', backgroundColor: '#cbd5e1', data: months.map((m) => m.revenue) },
          { label: 'Net profit', backgroundColor: '#f59e0b', data: months.map((m) => m.netProfit) },
        ],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + '%' } } } },
    });
    $('#monthly-table').innerHTML = table([
      { label: 'Month', render: (m) => (m.start === 'TOTAL' ? 'TOTAL' : monthName(m.start)) },
      { label: 'Loads', num: true, key: 'loads' },
      { label: 'Qty', num: true, render: (m) => num(m.quantity) },
      { label: 'Revenue', num: true, render: (m) => inr(m.revenue) },
      { label: 'Quarry cost', num: true, render: (m) => inr(m.purchase) },
      { label: 'Trip exp.', num: true, render: (m) => inr(m.tripExpenses) },
      { label: 'Other exp.', num: true, render: (m) => inr(m.otherExpenses) },
      { label: 'Net profit', num: true, render: (m) => signed(m.netProfit) },
      { label: 'Profit ratio', num: true, render: (m) => `<b>${pct(m.margin)}</b>` },
    ], months, { total: { ...d.total, start: 'TOTAL' } });
    await pages.breakdown();
  },

  async breakdown() {
    const mv = $('#bf-month').value;
    const [y, m] = mv.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = await api(`/api/reports/breakdown?from=${mv}-01&to=${mv}-${last}`);
    const maxRev = (rows) => Math.max(1, ...rows.map((r) => r.revenue));
    const bd = (rows, list, key) => table([
      { label: 'Name', render: (r) => esc(byId(list, r._id)?.[key] || '—') },
      { label: 'Loads', num: true, key: 'loads' },
      { label: 'Qty', num: true, render: (r) => num(r.quantity) },
      { label: 'Revenue', num: true, render: (r) => inr(r.revenue) },
      { label: 'Trip profit', num: true, render: (r) => signed(r.grossProfit) },
      { label: 'Share', render: (r) => `<div class="bar"><span style="width:${(r.revenue / maxRev(rows)) * 100}%"></span></div>` },
    ], rows, { empty: 'No loads in this month.' });
    $('#bd-vehicle').innerHTML = bd(d.vehicle, S.vehicles, 'number');
    $('#bd-driver').innerHTML = bd(d.driver, S.drivers, 'name');
    $('#bd-material').innerHTML = bd(d.material, S.materials, 'name');
    $('#bd-quarry').innerHTML = bd(d.quarry, S.quarries, 'name');
  },

  async expenses() {
    const rows = await api(`/api/expenses-range?from=${$('#ef-from').value}&to=${$('#ef-to').value}`);
    const total = rows.reduce((a, r) => a + r.amount, 0);
    $('#expenses-table').innerHTML = table([
      { label: 'Date', render: (r) => (r._id ? prettyDay(r.date) : 'TOTAL') },
      { label: 'Category', key: 'category' },
      { label: 'Vehicle', render: (r) => esc(r.vehicle?.number || '') },
      { label: 'Driver', render: (r) => esc(r.driver?.name || '') },
      { label: 'Amount', num: true, render: (r) => inr(r.amount) },
      { label: 'Notes', key: 'notes' },
      { label: '', render: (r) => (r._id ? `<button class="icon-btn" data-edit-exp="${r._id}">✏️</button><button class="icon-btn" data-del-exp="${r._id}">🗑️</button>` : '') },
    ], rows, { total: rows.length ? { amount: total } : null, empty: 'No expenses in this period.' });
    pages._expenseRows = rows;
  },

  async vehicles() {
    const soon = (d) => d && (new Date(d) - Date.now()) / 86400000 < 30;
    $('#vehicles-list').innerHTML = S.vehicles.map((v) => `
      <div class="entity ${v.active ? '' : 'inactive'}">
        <div class="actions"><button class="btn sm" data-edit-vehicle="${v._id}">✏️ Edit</button><button class="icon-btn" data-del-vehicle="${v._id}" title="Delete">🗑️</button></div>
        <div class="plate">${esc(v.number)}</div>
        <dl>
          <dt>Driver</dt><dd>${esc(v.driver?.name || '— not assigned —')}</dd>
          <dt>Type</dt><dd>${esc(v.type)}</dd>
          <dt>Capacity</dt><dd>${esc(v.capacity || '—')}</dd>
          <dt>Insurance</dt><dd>${v.insuranceExpiry ? prettyDay(v.insuranceExpiry) : '—'} ${soon(v.insuranceExpiry) ? '<span class="badge warn">renew soon</span>' : ''}</dd>
          <dt>FC</dt><dd>${v.fcExpiry ? prettyDay(v.fcExpiry) : '—'} ${soon(v.fcExpiry) ? '<span class="badge warn">renew soon</span>' : ''}</dd>
          <dt>Status</dt><dd><span class="badge">${v.active ? 'Active' : 'Inactive'}</span></dd>
          ${v.notes ? `<dt>Notes</dt><dd>${esc(v.notes)}</dd>` : ''}
        </dl>
      </div>`).join('') || '<div class="empty">No vehicles yet.</div>';
  },

  async drivers() {
    $('#drivers-list').innerHTML = S.drivers.map((d) => {
      const veh = S.vehicles.filter((v) => v.driver?._id === d._id).map((v) => v.number).join(', ');
      return `<div class="entity ${d.active ? '' : 'inactive'}">
        <div class="actions"><button class="btn sm" data-edit-driver="${d._id}">✏️ Edit</button><button class="icon-btn" data-del-driver="${d._id}" title="Delete">🗑️</button></div>
        <div class="title">👷 ${esc(d.name)}</div>
        <dl>
          <dt>Phone</dt><dd>${d.phone ? `<a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>` : '—'}</dd>
          <dt>Licence no.</dt><dd>${esc(d.licenseNo || '—')}</dd>
          <dt>Vehicle</dt><dd>${esc(veh || '—')}</dd>
          <dt>Monthly salary</dt><dd>${d.monthlySalary ? inr(d.monthlySalary) : '—'}</dd>
          <dt>Address</dt><dd>${esc(d.address || '—')}</dd>
          <dt>Status</dt><dd><span class="badge">${d.active ? 'Active' : 'Inactive'}</span></dd>
        </dl>
      </div>`;
    }).join('') || '<div class="empty">No drivers yet.</div>';
  },

  async settings() {
    $('#materials-table').innerHTML = table([
      { label: 'Material', render: (m) => `<b>${esc(m.name)}</b>${m.active ? '' : ' <span class="badge">inactive</span>'}` },
      { label: 'Unit', key: 'unit' },
      ...S.quarries.map((q) => ({ label: `Buy @ ${q.name}`, num: true, render: (m) => inr(m.purchaseRates.find((p) => p.quarry === q._id)?.rate || 0) })),
      { label: 'Sale rate', num: true, render: (m) => inr(m.saleRate) },
      { label: '', render: (m) => `<button class="icon-btn" data-edit-material="${m._id}">✏️</button><button class="icon-btn" data-del-material="${m._id}">🗑️</button>` },
    ], S.materials);
    const party = (rows, kind) => table([
      { label: 'Name', render: (p) => `<b>${esc(p.name)}</b>${p.active ? '' : ' <span class="badge">inactive</span>'}` },
      { label: 'Location', key: 'location' },
      { label: 'Phone', key: 'phone' },
      { label: '', render: (p) => `<button class="icon-btn" data-edit-${kind}="${p._id}">✏️</button><button class="icon-btn" data-del-${kind}="${p._id}">🗑️</button>` },
    ], rows);
    $('#quarries-table').innerHTML = party(S.quarries, 'quarry');
    $('#customers-table').innerHTML = party(S.customers, 'customer');
  },
};

// ================= Editors for master data =================
const save = (route, item) => async (data) => {
  if (item) await api(`/api/${route}/${item._id}`, { method: 'PUT', body: data });
  else await api(`/api/${route}`, { method: 'POST', body: data });
  toast(item ? 'Saved' : 'Added');
  await refresh();
};

function editVehicle(v) {
  openForm({
    title: v ? `Edit Vehicle ${v.number}` : 'Add Vehicle',
    values: v ? { ...v, driver: v.driver?._id || '' } : { active: true, type: 'Tipper Lorry' },
    fields: [
      { name: 'number', label: 'Vehicle number', required: true, placeholder: 'TN 23 AB 1234' },
      { name: 'driver', label: 'Assigned driver', type: 'select', options: opt(S.drivers, 'name', { blank: '— none —' }) },
      { name: 'type', label: 'Type' },
      { name: 'capacity', label: 'Capacity', placeholder: 'e.g. 16 Ton / 6 Unit' },
      { name: 'insuranceExpiry', label: 'Insurance expiry', type: 'date' },
      { name: 'fcExpiry', label: 'FC expiry', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      { name: 'active', label: 'Active (show in new loads)', type: 'checkbox' },
    ],
    onSubmit: save('vehicles', v),
  });
}
function editDriver(d) {
  openForm({
    title: d ? `Edit Driver ${d.name}` : 'Add Driver',
    values: d || { active: true },
    fields: [
      { name: 'name', label: 'Driver name', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'licenseNo', label: 'Licence number' },
      { name: 'monthlySalary', label: 'Monthly salary (₹)', type: 'number' },
      { name: 'address', label: 'Address', type: 'textarea', wide: true },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      { name: 'active', label: 'Active', type: 'checkbox' },
    ],
    onSubmit: save('drivers', d),
  });
}
function editParty(route, label, p) {
  openForm({
    title: p ? `Edit ${label}` : `Add ${label}`,
    values: p || { active: true },
    fields: [
      { name: 'name', label: 'Name', required: true, wide: true },
      { name: 'location', label: 'Location' },
      { name: 'phone', label: 'Phone' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'active', label: 'Active', type: 'checkbox' },
    ],
    onSubmit: save(route, p),
  });
}
function editMaterial(m) {
  const values = m ? { ...m } : { active: true, unit: 'Ton' };
  for (const q of S.quarries) values[`rate_${q._id}`] = m?.purchaseRates.find((p) => p.quarry === q._id)?.rate ?? 0;
  openForm({
    title: m ? `Edit ${m.name}` : 'Add Material',
    values,
    fields: [
      { name: 'name', label: 'Material name', required: true },
      { name: 'unit', label: 'Unit', placeholder: 'Ton / Unit / CFT' },
      { name: 'saleRate', label: 'Sale rate to customer (₹ / unit)', type: 'number' },
      { type: 'section', label: 'Purchase rate at each quarry (₹ / unit)' },
      ...S.quarries.map((q) => ({ name: `rate_${q._id}`, label: q.name, type: 'number' })),
      { name: 'active', label: 'Active', type: 'checkbox' },
    ],
    onSubmit: (data) => {
      const body = { name: data.name, unit: data.unit, saleRate: data.saleRate, active: data.active, purchaseRates: S.quarries.map((q) => ({ quarry: q._id, rate: data[`rate_${q._id}`] })) };
      return save('materials', m)(body);
    },
  });
}
function editExpense(e) {
  openForm({
    title: e ? 'Edit Expense' : 'Add Expense',
    values: e ? { ...e, vehicle: e.vehicle?._id || '', driver: e.driver?._id || '' } : { date: S.today, category: S.categories[0] },
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'category', label: 'Category', type: 'select', required: true, options: S.categories.map((c) => ({ value: c, label: c })) },
      { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { name: 'vehicle', label: 'Vehicle (optional)', type: 'select', options: opt(S.vehicles, 'number', { blank: '— general —' }) },
      { name: 'driver', label: 'Driver (optional)', type: 'select', options: opt(S.drivers, 'name', { blank: '— none —' }) },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    onSubmit: save('expenses', e),
  });
}

// ================= Events =================
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const ds = b.dataset;
  try {
    if (ds.editLoad) openLoadForm(await api(`/api/loads/${ds.editLoad}`));
    else if (ds.delLoad) await remove('loads', ds.delLoad, 'this load');
    else if (ds.editVehicle) editVehicle(byId(S.vehicles, ds.editVehicle));
    else if (ds.delVehicle) await remove('vehicles', ds.delVehicle, `vehicle ${byId(S.vehicles, ds.delVehicle).number}`);
    else if (ds.editDriver) editDriver(byId(S.drivers, ds.editDriver));
    else if (ds.delDriver) await remove('drivers', ds.delDriver, `driver ${byId(S.drivers, ds.delDriver).name}`);
    else if (ds.editQuarry) editParty('quarries', 'Quarry', byId(S.quarries, ds.editQuarry));
    else if (ds.delQuarry) await remove('quarries', ds.delQuarry, byId(S.quarries, ds.delQuarry).name);
    else if (ds.editCustomer) editParty('customers', 'Customer', byId(S.customers, ds.editCustomer));
    else if (ds.delCustomer) await remove('customers', ds.delCustomer, byId(S.customers, ds.delCustomer).name);
    else if (ds.editMaterial) editMaterial(byId(S.materials, ds.editMaterial));
    else if (ds.delMaterial) await remove('materials', ds.delMaterial, byId(S.materials, ds.delMaterial).name);
    else if (ds.editExp) editExpense(pages._expenseRows.find((x) => x._id === ds.editExp));
    else if (ds.delExp) await remove('expenses', ds.delExp, 'this expense');
    else if (ds.range) { const [f, t] = rangeOf(ds.range); $('#lf-from').value = f; $('#lf-to').value = t; await pages.loads(); }
  } catch (e) { toast(e.message, true); }
});

$('#quick-add').onclick = () => openLoadForm();
$('#add-vehicle').onclick = () => editVehicle();
$('#add-driver').onclick = () => editDriver();
$('#add-quarry').onclick = () => editParty('quarries', 'Quarry');
$('#add-customer').onclick = () => editParty('customers', 'Customer');
$('#add-material').onclick = () => editMaterial();
$('#add-expense').onclick = () => editExpense();
for (const id of ['#lf-from', '#lf-to', '#lf-vehicle', '#lf-driver', '#lf-material']) $(id).addEventListener('change', () => pages.loads().catch((e) => toast(e.message, true)));
for (const id of ['#ef-from', '#ef-to']) $(id).addEventListener('change', () => pages.expenses());
$('#wf-go').onclick = () => pages.weekly();
$('#mf-year').onchange = () => pages.monthly();
$('#bf-month').onchange = () => pages.breakdown();

let current = 'dashboard';
async function show(page) {
  current = page;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('hidden', p.id !== `page-${page}`));
  $('#page-title').textContent = $(`#nav a[data-page="${page}"]`).textContent.replace(/^\S+\s/, '');
  location.hash = page;
  try { await pages[page](); } catch (e) { toast(e.message, true); }
}
$('#nav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) show(a.dataset.page); });

function fillFilterSelects() {
  const set = (id, list, key, blank) => {
    const el = $(id), cur = el.value;
    el.innerHTML = opt(list, key, { blank }).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
    el.value = cur;
  };
  set('#lf-vehicle', S.vehicles, 'number', 'All vehicles');
  set('#lf-driver', S.drivers, 'name', 'All drivers');
  set('#lf-material', S.materials, 'name', 'All materials');
}

async function refresh() {
  await loadMasters();
  fillFilterSelects();
  await pages[current]();
}

(async function init() {
  S.today = (await api('/api/meta')).today;
  const [ws, we] = rangeOf('week');
  $('#lf-from').value = ws; $('#lf-to').value = we;
  const [ms, me] = rangeOf('month');
  $('#ef-from').value = ms; $('#ef-to').value = me;
  $('#wf-from').value = addDays(ws, -7 * 7); $('#wf-to').value = we;
  const y = Number(S.today.slice(0, 4));
  $('#mf-year').innerHTML = [y + 1, y, y - 1, y - 2].map((v) => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('');
  $('#bf-month').value = S.today.slice(0, 7);
  await loadMasters();
  fillFilterSelects();
  const start = location.hash.slice(1);
  await show(pages[start] && !start.startsWith('_') ? start : 'dashboard');
})();
