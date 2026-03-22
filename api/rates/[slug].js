const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://anlikaltinfiyatlari.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { slug } = req.query;

  try {
    const url = `${BASE_URL}/banka/${slug}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    let buyPrice = 0;
    let sellPrice = 0;

    $('tr').each((i, row) => {
      const text = $(row).text().toLowerCase();
      if (text.includes('gram') && text.includes('altın')) {
        const columns = $(row).find('td');
        if (columns.length >= 3) {
          const col1 = parseFloat($(columns[1]).text().replace(/[^0-9,]/g, '').replace(',', '.'));
          const col2 = parseFloat($(columns[2]).text().replace(/[^0-9,]/g, '').replace(',', '.'));
          if (col1 > 0) buyPrice = col1;
          if (col2 > 0) sellPrice = col2;
        }
      }
    });

    res.status(200).json({ bank: slug, buyPrice, sellPrice });
  } catch (error) {
    res.status(500).json({ error: 'Kur çekilemedi.', bank: slug, buyPrice: 0, sellPrice: 0 });
  }
};
