import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://anlikaltinfiyatlari.com/banka').then(r => {
  const $ = cheerio.load(r.data);
  const banks = [];
  $('a[href*="/banka/"]').each((i, el) => {
    const slug = $(el).attr('href');
    if(slug) banks.push(slug);
  });
  console.log(banks.slice(0, 10));
});
