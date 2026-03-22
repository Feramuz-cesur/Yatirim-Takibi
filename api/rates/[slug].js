import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://anlikaltinfiyatlari.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { slug } = req.query;

  try {
    const url = `${BASE_URL}/banka/${slug}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    let buyPrice = 0;
    let sellPrice = 0;

    $('tr').each((i, row) => {
      const columns = $(row).find('td');
      if (columns.length >= 3) {
        const title = $(columns[0]).text().trim().toLowerCase();
        
        // Exact match for 'gram altın'
        if (title === 'gram altın' || title === 'gram altin') {
          // Generally columns are: [0] Name, [1] Current, [2] Change, [3] Alış, [4] Satış
          // But fallback to [1] and [2] if it's a 3 column table.
          
          let rawBuy = '';
          let rawSell = '';
          
          if (columns.length >= 5) {
            rawBuy = $(columns[3]).text();
            rawSell = $(columns[4]).text();
          } else {
            rawBuy = $(columns[1]).text();
            rawSell = $(columns[2]).text();
          }

          const parsedBuy = parseFloat(rawBuy.replace(/[^0-9,]/g, '').replace(',', '.'));
          const parsedSell = parseFloat(rawSell.replace(/[^0-9,]/g, '').replace(',', '.'));

          if (parsedBuy > 0) buyPrice = parsedBuy;
          if (parsedSell > 0) sellPrice = parsedSell;
          
          return false; // Break out of loop since we found it
        }
      }
    });

    res.status(200).json({ bank: slug, buyPrice, sellPrice });
  } catch (error) {
    res.status(500).json({ error: 'Kur çekilemedi.', bank: slug, buyPrice: 0, sellPrice: 0 });
  }
}
