const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://cs.rin.ru/forum';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function run() {
  const searchUrl = `${BASE_URL}/search.php?keywords=Factorio&terms=all&fid%5B%5D=10&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search`;
  console.log(`Fetching ${searchUrl}...`);
  try {
    const response = await axios.get(searchUrl, { 
       headers: HEADERS, 
       timeout: 15000, 
       maxRedirects: 5,
       validateStatus: null // allow any status
    });
    console.log('Status: ' + response.status);
    fs.writeFileSync('/home/sankar/github/314rate/scratch_csrin.html', response.data);
    console.log('Saved, length: ' + response.data.length);
  } catch (e) {
    console.error('Error: ' + e.message);
  }
}
run();
