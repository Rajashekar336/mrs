# 🚚 Lorry Business Manager

Track daily loads (Quarry → Lanxin Infratech), weekly load counts and monthly profit ratio.

## Run
```bash
cd ~/Desktop/web/lorry-business
npm start
```
Then open **http://localhost:4000** in your browser. Press `Ctrl+C` in the terminal to stop.

Your data is stored in MongoDB inside `data/db` (kept between restarts — back up this folder).
To view the raw database with MongoDB Compass / mongosh while the app runs: `mongodb://127.0.0.1:27018/lorry_business`.

To use your own MongoDB (local install or Atlas), set `MONGODB_URI` in `.env`.

## First steps
1. **Vehicles** → ✏️ Edit each lorry: set the real vehicle number and assigned driver.
2. **Drivers** → ✏️ Edit each driver: name, phone, licence, salary.
3. **Quarries, Materials & Rates** → set purchase rate at SRI BLUE METALS / SVS MINES and the sale rate to Lanxin for M Sand, 12 mm, 20 mm.
4. **+ Add Load** for every trip. Rates auto-fill; add diesel, bata, toll.
5. **Expenses** for salary, EMI, repairs, tyres etc. (deducted from monthly profit).

## How profit is calculated
- Per load: `Sale (qty × sale rate) − Quarry cost (qty × purchase rate) − Trip expenses (diesel + bata + toll + other)`
- Monthly net profit: `sum of load profits − other expenses`
- Profit ratio: `net profit ÷ revenue × 100`
