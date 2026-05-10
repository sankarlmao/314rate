const axios = require('axios');
const iconv = require('iconv-lite');
const BASE_URL = 'https://online-fix.me';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
};

async function resolveExtLink(url) {
  console.log("Testing:", url);
  try {
    const resp = await axios.get(url, {
      headers: { ...HEADERS, 'Referer': BASE_URL },
      timeout: 8000,
      responseType: 'arraybuffer'
    });
    const html = iconv.decode(Buffer.from(resp.data), 'win1251');
    const jsMatch = html.match(/location\.href\s*=\s*['"](.*?)['"]/i);
    console.log("Match found?", !!jsMatch);
    if (jsMatch) console.log("URL found:", jsMatch[1]);
    return jsMatch ? jsMatch[1] : url;
  } catch (e) {
    console.log("Error:", e.message);
  }
}
resolveExtLink('https://online-fix.me/ext/D-TjHnhA1vJt7DgS3PDUCC2E-r7hAM42H2pytQa9arRqCRi7Je_1CL4vq77GoeBu-ctFEqCG5hAjHT8F4ezZF7jBwIniKCuM9tYQizk681Q=');
