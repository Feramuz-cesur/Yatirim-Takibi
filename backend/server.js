const express = require('express');
const cors = require('cors');
const { scrapeBankRates, getSupportedBanks } = require('./scraper');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Endpoint to get list of supported banks
app.get('/api/banks', async (req, res) => {
  try {
    const banks = await getSupportedBanks();
    res.json(banks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// Endpoint to get rates for a specific bank
app.get('/api/rates/:bankSlug', async (req, res) => {
  try {
    const { bankSlug } = req.params;
    const rates = await scrapeBankRates(bankSlug);
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
