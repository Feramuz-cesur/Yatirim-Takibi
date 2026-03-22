import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://anlikaltinfiyatlari.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { data } = await axios.get(`${BASE_URL}/banka`);
    const $ = cheerio.load(data);
    const banks = [];

    $('a[href*="/banka/"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const slug = href.split('/').pop();
      if (name && slug && !banks.find(b => b.slug === slug)) {
        banks.push({ name, slug });
      }
    });

    res.status(200).json(banks);
  } catch (error) {
    res.status(500).json({ error: 'Bankalar çekilemedi.' });
  }
}
