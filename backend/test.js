const axios = require('axios');
const cheerio = require('cheerio');

async function testFetch() {
  const { data } = await axios.get('https://anlikaltinfiyatlari.com/banka');
  const $ = cheerio.load(data);
  
  // Find tables or lists that might contain the bank data
  // The user clicked "https://anlikaltinfiyatlari.com/banka/kuveyt-turk" earlier from chunk. Let's see all links containing /banka/
  const banks = [];
  $('a[href*="/banka/"]').each((i, el) => {
    banks.push({
      name: $(el).text().trim(),
      href: $(el).attr('href')
    });
  });
  console.log("Banks found:", banks);
  
  // We need to fetch individual bank pages or find the table on the main page. Let's dump a piece of the layout:
  console.log("Body snippet:", $('body').html().substring(0, 1500));
}

testFetch();
