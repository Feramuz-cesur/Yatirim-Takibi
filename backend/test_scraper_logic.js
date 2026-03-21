const { scrapeBankRates, getSupportedBanks } = require('./scraper');

async function test() {
  console.log("Fetching supported banks...");
  const banks = await getSupportedBanks();
  console.log("Banks:", banks);

  if (banks.length > 0) {
    const target = banks.find(b => b.slug.includes('kuveyt'))?.slug || banks[0].slug;
    console.log(`\nFetching rates for ${target}...`);
    const rates = await scrapeBankRates(target);
    console.log("\nResults:", rates);
  } else {
      console.log("Fetching kuveyt-turk directly:");
      const rates = await scrapeBankRates('kuveyt-turk');
      console.log("\nResults:", rates);
  }
}

test();
