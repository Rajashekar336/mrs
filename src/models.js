const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const opts = { timestamps: true };

const Driver = model('Driver', new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  licenseNo: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  monthlySalary: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, opts));

const Vehicle = model('Vehicle', new Schema({
  number: { type: String, required: true, trim: true, uppercase: true, unique: true },
  type: { type: String, trim: true, default: 'Tipper Lorry' },
  capacity: { type: String, trim: true, default: '' },
  driver: { type: Schema.Types.ObjectId, ref: 'Driver', default: null },
  insuranceExpiry: { type: Date, default: null },
  fcExpiry: { type: Date, default: null },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, opts));

const partyFields = {
  name: { type: String, required: true, trim: true, unique: true },
  location: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  gstin: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
};
const Quarry = model('Quarry', new Schema(partyFields, opts));
const Customer = model('Customer', new Schema(partyFields, opts));

const Material = model('Material', new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  unit: { type: String, trim: true, default: 'Ton' },
  saleRate: { type: Number, default: 0, min: 0 }, // default rate charged to customer per unit
  purchaseRates: [{ // rate paid to each quarry per unit
    _id: false,
    quarry: { type: Schema.Types.ObjectId, ref: 'Quarry' },
    rate: { type: Number, default: 0, min: 0 },
  }],
  active: { type: Boolean, default: true },
}, opts));

const loadSchema = new Schema({
  date: { type: Date, required: true, index: true },
  vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  driver: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  quarry: { type: Schema.Types.ObjectId, ref: 'Quarry', required: true },
  material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  quarryBillNo: { type: String, trim: true, default: '' },
  dcNo: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  purchaseRate: { type: Number, default: 0, min: 0 },
  saleRate: { type: Number, default: 0, min: 0 },
  dieselCost: { type: Number, default: 0, min: 0 },
  driverBata: { type: Number, default: 0, min: 0 },
  tollCost: { type: Number, default: 0, min: 0 },
  otherCost: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
  // computed on save
  purchaseAmount: Number,
  saleAmount: Number,
  tripExpenses: Number,
  profit: Number,
}, opts);

const r2 = (n) => Math.round(n * 100) / 100;
loadSchema.pre('save', function () {
  this.purchaseAmount = r2(this.quantity * this.purchaseRate);
  this.saleAmount = r2(this.quantity * this.saleRate);
  this.tripExpenses = r2(this.dieselCost + this.driverBata + this.tollCost + this.otherCost);
  this.profit = r2(this.saleAmount - this.purchaseAmount - this.tripExpenses);
});
const Load = model('Load', loadSchema);

const EXPENSE_CATEGORIES = ['Diesel', 'Driver Salary', 'Maintenance / Repair', 'Tyre', 'EMI / Loan', 'Insurance', 'FC / Permit / Tax', 'Office', 'Other'];
const Expense = model('Expense', new Schema({
  date: { type: Date, required: true, index: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  driver: { type: Schema.Types.ObjectId, ref: 'Driver', default: null },
  amount: { type: Number, required: true, min: 0 },
  notes: { type: String, default: '' },
}, opts));

module.exports = { Driver, Vehicle, Quarry, Customer, Material, Load, Expense, EXPENSE_CATEGORIES };
