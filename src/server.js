require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { connect, disconnect } = require('./db');
const seed = require('./seed');
const M = require('./models');
const D = require('./dates');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw bad('Invalid id'); return id; };

// ---------- Generic CRUD for master data ----------
function crud(route, Model, { populate, sort = { name: 1 }, inUse, prepare = (b) => b } = {}) {
  app.get(`/api/${route}`, async (req, res) => {
    const q = Model.find().sort(sort);
    res.json(await (populate ? q.populate(populate) : q));
  });
  app.post(`/api/${route}`, async (req, res) => {
    const doc = await Model.create(prepare(req.body));
    res.status(201).json(populate ? await doc.populate(populate) : doc);
  });
  app.put(`/api/${route}/:id`, async (req, res) => {
    const doc = await Model.findById(oid(req.params.id));
    if (!doc) throw bad('Not found', 404);
    const body = prepare(req.body);
    delete body._id;
    doc.set(body);
    await doc.save();
    res.json(populate ? await doc.populate(populate) : doc);
  });
  app.delete(`/api/${route}/:id`, async (req, res) => {
    const id = oid(req.params.id);
    if (inUse) {
      const n = await inUse(id);
      if (n) throw bad(`Cannot delete: used in ${n} record(s). Mark it inactive instead.`, 409);
    }
    await Model.findByIdAndDelete(id);
    res.json({ ok: true });
  });
}
const nullIfEmpty = (b, ...keys) => { for (const k of keys) if (b[k] === '') b[k] = null; return b; };
const dateField = (b, ...keys) => { for (const k of keys) if (typeof b[k] === 'string' && b[k]) b[k] = D.parseDay(b[k].slice(0, 10)); return b; };

crud('drivers', M.Driver, {
  inUse: async (id) => (await M.Load.countDocuments({ driver: id })) + (await M.Vehicle.countDocuments({ driver: id })),
});
crud('vehicles', M.Vehicle, {
  sort: { number: 1 },
  populate: 'driver',
  prepare: (b) => dateField(nullIfEmpty(b, 'driver', 'insuranceExpiry', 'fcExpiry'), 'insuranceExpiry', 'fcExpiry'),
  inUse: (id) => M.Load.countDocuments({ vehicle: id }),
});
crud('quarries', M.Quarry, { inUse: (id) => M.Load.countDocuments({ quarry: id }) });
crud('customers', M.Customer, { inUse: (id) => M.Load.countDocuments({ customer: id }) });
crud('materials', M.Material, { inUse: (id) => M.Load.countDocuments({ material: id }) });

// ---------- Expenses ----------
app.get('/api/expense-categories', (req, res) => res.json(M.EXPENSE_CATEGORIES));
crud('expenses', M.Expense, {
  sort: { date: -1 },
  populate: 'vehicle driver',
  prepare: (b) => dateField(nullIfEmpty(b, 'vehicle', 'driver'), 'date'),
});
app.get('/api/expenses-range', async (req, res) => {
  const [from, to] = D.rangeFromQuery(req.query);
  res.json(await M.Expense.find({ date: { $gte: from, $lt: to } }).sort({ date: -1 }).populate('vehicle driver'));
});

// ---------- Loads (daily trips) ----------
const LOAD_POP = 'vehicle driver quarry material customer';
function loadFilter(q) {
  const [from, to] = D.rangeFromQuery(q, 'week');
  const f = { date: { $gte: from, $lt: to } };
  for (const k of ['vehicle', 'driver', 'quarry', 'material', 'customer']) if (q[k]) f[k] = oid(q[k]);
  return f;
}
app.get('/api/loads', async (req, res) => {
  res.json(await M.Load.find(loadFilter(req.query)).sort({ date: -1, createdAt: -1 }).populate(LOAD_POP));
});
app.get('/api/loads/:id', async (req, res) => {
  const doc = await M.Load.findById(oid(req.params.id)).populate(LOAD_POP);
  if (!doc) throw bad('Not found', 404);
  res.json(doc);
});
app.post('/api/loads', async (req, res) => {
  const doc = new M.Load(dateField({ ...req.body }, 'date'));
  await doc.save();
  res.status(201).json(await doc.populate(LOAD_POP));
});
app.put('/api/loads/:id', async (req, res) => {
  const doc = await M.Load.findById(oid(req.params.id));
  if (!doc) throw bad('Not found', 404);
  const body = dateField({ ...req.body }, 'date');
  delete body._id;
  doc.set(body);
  await doc.save();
  res.json(await doc.populate(LOAD_POP));
});
app.delete('/api/loads/:id', async (req, res) => {
  await M.Load.findByIdAndDelete(oid(req.params.id));
  res.json({ ok: true });
});
app.get('/api/loads.csv', async (req, res) => {
  const rows = await M.Load.find(loadFilter(req.query)).sort({ date: 1 }).populate(LOAD_POP);
  const head = ['Date', 'Vehicle', 'Driver', 'Quarry', 'Material', 'Customer', 'Quarry Bill', 'DC No', 'Qty', 'Unit',
    'Purchase Rate', 'Sale Rate', 'Purchase Amt', 'Sale Amt', 'Diesel', 'Bata', 'Toll', 'Other', 'Trip Exp', 'Profit', 'Notes'];
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((l) => [D.dayStr(l.date), l.vehicle?.number, l.driver?.name, l.quarry?.name, l.material?.name,
    l.customer?.name, l.quarryBillNo, l.dcNo, l.quantity, l.material?.unit, l.purchaseRate, l.saleRate, l.purchaseAmount,
    l.saleAmount, l.dieselCost, l.driverBata, l.tollCost, l.otherCost, l.tripExpenses, l.profit, l.notes].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="loads_${req.query.from || ''}_${req.query.to || ''}.csv"`);
  res.send([head.join(','), ...lines].join('\n'));
});

// ---------- Reports ----------
const loadTotals = {
  loads: { $sum: 1 }, quantity: { $sum: '$quantity' }, revenue: { $sum: '$saleAmount' },
  purchase: { $sum: '$purchaseAmount' }, tripExpenses: { $sum: '$tripExpenses' }, grossProfit: { $sum: '$profit' },
};
async function summary(from, to) {
  const [l] = await M.Load.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: null, ...loadTotals } }]);
  const [e] = await M.Expense.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  const s = { loads: 0, quantity: 0, revenue: 0, purchase: 0, tripExpenses: 0, grossProfit: 0, ...(l || {}) };
  delete s._id;
  s.otherExpenses = e?.total || 0;
  s.netProfit = s.grossProfit - s.otherExpenses;
  s.margin = s.revenue ? (s.netProfit / s.revenue) * 100 : 0;
  return s;
}

/** Groups loads + expenses into buckets of `unit` ('day' | 'week' | 'month'). */
async function series(from, to, unit) {
  const trunc = { $dateTrunc: { date: '$date', unit, timezone: D.TZ, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } };
  const loads = await M.Load.aggregate([
    { $match: { date: { $gte: from, $lt: to } } },
    { $group: { _id: trunc, ...loadTotals } }, { $sort: { _id: 1 } },
  ]);
  const exps = await M.Expense.aggregate([
    { $match: { date: { $gte: from, $lt: to } } },
    { $group: { _id: trunc, total: { $sum: '$amount' } } },
  ]);
  const byMat = await M.Load.aggregate([
    { $match: { date: { $gte: from, $lt: to } } },
    { $group: { _id: { b: trunc, m: '$material' }, loads: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
  ]);
  const map = new Map();
  const get = (d) => {
    const k = D.dayStr(d);
    if (!map.has(k)) map.set(k, { start: k, loads: 0, quantity: 0, revenue: 0, purchase: 0, tripExpenses: 0, grossProfit: 0, otherExpenses: 0, materials: {} });
    return map.get(k);
  };
  if (unit !== 'month') { // show empty days/weeks too, so charts have no gaps
    const step = unit === 'week' ? 7 : 1;
    let cur = from;
    if (unit === 'week') cur = D.addDays(from, -((new Date(`${D.dayStr(from)}T12:00:00Z`).getUTCDay() + 6) % 7));
    for (; cur < to; cur = D.addDays(cur, step)) get(cur);
  }
  for (const r of loads) { const { _id, ...rest } = r; Object.assign(get(_id), rest); }
  for (const r of exps) get(r._id).otherExpenses = r.total;
  for (const r of byMat) get(r._id.b).materials[r._id.m] = { loads: r.loads, quantity: r.quantity };
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start)).map((b) => {
    b.netProfit = b.grossProfit - b.otherExpenses;
    b.margin = b.revenue ? (b.netProfit / b.revenue) * 100 : 0;
    return b;
  });
}

async function breakdown(from, to, field) {
  return M.Load.aggregate([
    { $match: { date: { $gte: from, $lt: to } } },
    { $group: { _id: `$${field}`, ...loadTotals } },
    { $sort: { revenue: -1 } },
  ]);
}

app.get('/api/dashboard', async (req, res) => {
  const r = D.ranges();
  const sixMonthsAgo = D.parseDay(`${D.dayStr(D.addDays(r.month[0], -150)).slice(0, 7)}-01`);
  res.json({
    today: await summary(...r.today),
    week: await summary(...r.week),
    month: await summary(...r.month),
    weekRange: [D.dayStr(r.week[0]), D.dayStr(D.addDays(r.week[1], -1))],
    monthLabel: D.dayStr(r.month[0]).slice(0, 7),
    last8Weeks: await series(D.addDays(r.week[0], -49), r.week[1], 'week'),
    last6Months: await series(sixMonthsAgo, r.month[1], 'month'),
    monthByMaterial: await breakdown(...r.month, 'material'),
    monthByVehicle: await breakdown(...r.month, 'vehicle'),
    recent: await M.Load.find().sort({ date: -1, createdAt: -1 }).limit(8).populate(LOAD_POP),
  });
});

app.get('/api/reports/weekly', async (req, res) => {
  const [from, to] = D.rangeFromQuery(req.query);
  res.json({ weeks: await series(from, to, 'week'), days: await series(from, to, 'day'), total: await summary(from, to) });
});

app.get('/api/reports/monthly', async (req, res) => {
  const year = Number(req.query.year) || Number(D.todayStr().slice(0, 4));
  const from = D.parseDay(`${year}-01-01`), to = D.parseDay(`${year + 1}-01-01`);
  res.json({ year, months: await series(from, to, 'month'), total: await summary(from, to) });
});

app.get('/api/reports/breakdown', async (req, res) => {
  const [from, to] = D.rangeFromQuery(req.query);
  const out = {};
  for (const f of ['vehicle', 'driver', 'material', 'quarry', 'customer']) out[f] = await breakdown(from, to, f);
  const exp = await M.Expense.aggregate([
    { $match: { date: { $gte: from, $lt: to } } },
    { $group: { _id: { category: '$category', vehicle: '$vehicle' }, total: { $sum: '$amount' } } },
  ]);
  out.expenses = exp;
  out.total = await summary(from, to);
  res.json(out);
});

app.get('/api/meta', (req, res) => res.json({ today: D.todayStr() }));

// ---------- Errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let msg = err.message;
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (err.code === 11000) { status = 409; msg = `Already exists: ${JSON.stringify(err.keyValue)}`; }
  if (status === 500) console.error(err);
  res.status(status).json({ error: msg });
});

(async () => {
  const PORT = Number(process.env.PORT || 4000);
  console.log('Starting MongoDB…');
  const uri = await connect();
  await seed();
  const server = app.listen(PORT, (err) => {
    if (err) {
      console.error(`\n  Port ${PORT} is busy. Set a different PORT in .env and run again.\n`);
      return disconnect().then(() => process.exit(1));
    }
    console.log(`\n  🚚  Lorry Business Manager is running`);
    console.log(`  ➜  Open:     http://localhost:${PORT}`);
    console.log(`  ➜  MongoDB:  ${uri.replace(/\/?$/, '/')}${process.env.DB_NAME || 'lorry_business'}`);
    console.log(`  Press Ctrl+C to stop.\n`);
  });
  const stop = async () => { console.log('\nStopping…'); server.close(); await disconnect(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error('Failed to start:', e); process.exit(1); });
