const { scrapeCsRin } = require('./server/scrapers/csrin');

async function run() {
   console.log("Starting local scraper direct test...");
   const res = await scrapeCsRin('Factorio');
   console.log("RESULT SIZE:", res.threads.length);
}
run();
