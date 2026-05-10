const axios = require('axios');
const iconv = require('iconv-lite');
const fs = require('fs');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
  'Referer': 'https://online-fix.me/',
};

async function run() {
  const url = 'https://online-fix.me/games/survival/17320-dayz-dayzavr-po-seti.html';
  console.log(`Fetching ${url}...`);
  try {
    const response = await axios.get(url, { headers: HEADERS, timeout: 15000, responseType: 'arraybuffer' });
    const html = iconv.decode(Buffer.from(response.data), 'win1251');
    fs.writeFileSync('/home/sankar/github/314rate/scratch_detail.html', html);
    console.log('Saved to scratch_detail.html, size: ' + html.length);
  } catch (e) {
    console.error(e);
  }
}
run();
