const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://anlikaltinfiyatlari.com';

async function getSupportedBanks() {
  try {
    const { data } = await axios.get(`${BASE_URL}/banka`);
    const $ = cheerio.load(data);
    const banks = [];
    
    // Select links that go to bank specific pages
    $('a[href*="/banka/"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const slug = href.split('/').pop();
      
      // Avoid duplicates
      if (name && slug && !banks.find(b => b.slug === slug)) {
        banks.push({ name, slug });
      }
    });
    
    return banks;
  } catch (error) {
    console.error("Error fetching banks:", error.message);
    return [];
  }
}

async function scrapeBankRates(bankSlug) {
  try {
    const url = `${BASE_URL}/banka/${bankSlug}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    let buyPrice = 0;
    let sellPrice = 0;
    
    // We need to find the Gram Altin row in the table
    // The html usually contains tables for 'Ziraat Bankası Altın Fiyatları' etc.
    // Let's look for a td or div containing 'Gram Altın' or 'Altın (Gram)'
    
    // Let's do a generic search in td elements:
    $('tr').each((i, row) => {
      const text = $(row).text().toLowerCase();
      if (text.includes('gram') && text.includes('altın')) {
        const columns = $(row).find('td');
        if (columns.length >= 3) {
           // Typically: Name | Alış | Satış
           // we need to clean the text to numbers
           const col1 = $(columns[1]).text().replace(/[^0-9,.]/g, '').replace(',', '.');
           const col2 = $(columns[2]).text().replace(/[^0-9,.]/g, '').replace(',', '.');
           
           if(parseFloat(col1) > 0) buyPrice = parseFloat(col1);
           if(parseFloat(col2) > 0) sellPrice = parseFloat(col2);
        }
      }
    });

    // If it's structured differently (e.g. divs instead of table)
    if (buyPrice === 0) {
      // Look for specific classes if table approach fails
      // We will test this and refine.
    }

    return {
      bank: bankSlug,
      buyPrice: buyPrice, // Bank's buying price (our selling price)
      sellPrice: sellPrice // Bank's selling price (our buying price)
    };
  } catch (error) {
    console.error(`Error scraping rates for ${bankSlug}:`, error.message);
    return { bank: bankSlug, buyPrice: 0, sellPrice: 0 };
  }
}

module.exports = { getSupportedBanks, scrapeBankRates };
