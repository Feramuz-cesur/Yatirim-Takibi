import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://anlikaltinfiyatlari.com/banka/kuveyt-turk').then(r => {
  const $ = cheerio.load(r.data);
  $('tr').each((i, row) => {
    const cols = $(row).find('td');
    if (cols.length >= 3) {
      const title = $(cols[0]).text().toLowerCase().replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      if (title.startsWith('gram altın') || title.startsWith('gram altin')) {
        let rawBuy = $(cols[1]).text();
        let rawSell = $(cols[2]).text();
        if (cols.length >= 5 && $(cols[3]).text().trim() !== '') {
            rawBuy = $(cols[3]).text();
            rawSell = $(cols[4]).text();
        }
        console.log(`[${title}] BUY: ${rawBuy.trim()} SELL: ${rawSell.trim()}`);
      }
    }
  });
});
