const axios = require('axios');

async function run() {
  const extUrl = 'https://online-fix.me/ext/D-TjHnhA1vJt7DgS3PDUCFstkrCGRxt8sZSOhR5ne6dQyp1YCrFvfO6eJKlEIJ97nQ5kDkJS8C9fT7HYhD5LKg==';
  console.log('Testing redirect for: ' + extUrl);
  try {
    const resp = await axios.get(extUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://online-fix.me/games/survival/17320-dayz-dayzavr-po-seti.html'
      },
      maxRedirects: 0, // We want to see where it points
      validateStatus: (status) => status >= 200 && status < 400
    });
    console.log('Status:', resp.status);
    console.log('Location Header:', resp.headers.location);
    console.log('Body sample:', resp.data.substring(0, 300));
  } catch (e) {
    console.log('Error:', e.message);
    if (e.response) {
      console.log('Response Status:', e.response.status);
      console.log('Response Headers:', JSON.stringify(e.response.headers));
      console.log('Response Body:', e.response.data.substring(0, 500));
    }
  }
}
run();
