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
        let title = $(columns[0]).text().toLowerCase();
        title = title.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        
        // Exact match for 'gram altın'
        if (title.startsWith('gram altın') || title.startsWith('gram altin')) {
          let rawBuy = '';
          let rawSell = '';
          
          if (columns.length >= 5 && $(columns[3]).text().trim() !== '') {
            rawBuy = $(columns[3]).text();
            rawSell = $(columns[4]).text();
          } else {
            rawBuy = $(columns[1]).text();
            rawSell = $(columns[2]).text();
          }

          const extractPrice = (str) => {
              let val = str.trim().split(/[\s\n]+/)[0];
              if (!val) return 0;
              // If it uses comma as decimal separator e.g 3.000,50 -> 3000.50
              if (val.includes(',')) {
                  val = val.replace(/\./g, '').replace(',', '.');
              }
              return parseFloat(val) || 0;
          };

          const parsedBuy = extractPrice(rawBuy);
          const parsedSell = extractPrice(rawSell);

          if (parsedBuy > 0) buyPrice = parsedBuy;
          if (parsedSell > 0) sellPrice = parsedSell;
          
          return false; // Break out
        }
      }
    });

    res.status(200).json({ bank: slug, buyPrice, sellPrice });
  } catch (error) {
    res.status(500).json({ error: 'Kur çekilemedi.', bank: slug, buyPrice: 0, sellPrice: 0 });
  }
}
