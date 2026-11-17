const { Driver, Vehicle, Quarry, Customer, Material } = require('./models');

/** First-run defaults. Everything here can be edited from the app. */
async function seed() {
  if (await Quarry.countDocuments() === 0) {
    await Quarry.create([{ name: 'SRI BLUE METALS' }, { name: 'SVS MINES' }]);
  }
  if (await Customer.countDocuments() === 0) {
    await Customer.create({ name: 'Lanxin Infratech Private Limited' });
  }
  if (await Material.countDocuments() === 0) {
    const quarries = await Quarry.find();
    const purchaseRates = quarries.map((q) => ({ quarry: q._id, rate: 0 }));
    await Material.create([
      { name: 'M Sand', unit: 'Ton', purchaseRates },
      { name: '12 mm Aggregate', unit: 'Ton', purchaseRates },
      { name: '20 mm Aggregate', unit: 'Ton', purchaseRates },
    ]);
  }
  if (await Driver.countDocuments() === 0 && await Vehicle.countDocuments() === 0) {
    const drivers = await Driver.create([{ name: 'Driver 1' }, { name: 'Driver 2' }, { name: 'Driver 3' }]);
    await Vehicle.create(drivers.map((d, i) => ({ number: `TN 00 AA 000${i + 1}`, driver: d._id })));
  }
}

module.exports = seed;
