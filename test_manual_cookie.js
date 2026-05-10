const axios = require('axios');

async function run() {
  console.log("--- TEST 1: Basic GET with desktop headers ---");
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://cs.rin.ru/'
  };
  
  try {
    const resp = await axios.get('https://cs.rin.ru/forum/index.php', {
      headers, validateStatus: () => true, timeout: 10000
    });
    console.log("Response status:", resp.status);
    const body = resp.data;
    
    const tMatch = body.match(/securitytoken=(.*?);/);
    const expMatch = body.match(/securitytoken_expiration=(.*?);/);
    
    if (tMatch && expMatch) {
       console.log("Token found. Simulating bypass redirect step...");
       const cookieStr = `securitytoken=${tMatch[1]}; securitytoken_expiration=${expMatch[1]}`;
       console.log("Using Cookie:", cookieStr);
       
       const redirResp = await axios.get('https://cs.rin.ru/securitycheck/forum/index.php', {
         headers: { ...headers, 'Cookie': cookieStr },
         validateStatus: () => true,
         timeout: 10000
       });
       
       console.log("Redirect Step Status:", redirResp.status);
       
       const finalResp = await axios.get('https://cs.rin.ru/forum/index.php', {
         headers: { ...headers, 'Cookie': cookieStr },
         validateStatus: () => true,
         timeout: 10000
       });
       console.log("Final Step Status:", finalResp.status);
       console.log("Success?", finalResp.data.includes("Board index"));
    } else {
       console.log("No token challenge found. Body starts with:", body.substring(0, 100));
    }
  } catch(e) {
    console.error("Request Failed:", e.message);
  }
}
run();
