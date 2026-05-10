const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

async function run() {
  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true }));
  const headers = {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  };

  try {
    console.log("First attempt to load CS.RIN...");
    const response = await client.get('https://cs.rin.ru/forum/index.php', {
      headers,
      validateStatus: () => true 
    });
    
    console.log("Initial Response Status:", response.status);
    
    // Look for security token in body
    const tokenMatch = response.data.match(/securitytoken=(.*?);/);
    const expirationMatch = response.data.match(/securitytoken_expiration=(.*?);/);
    
    if (tokenMatch && expirationMatch) {
       const token = tokenMatch[1];
       const exp = expirationMatch[1];
       console.log("Found security token:", token);
       
       // Manually inject cookie into jar
       await jar.setCookie(`securitytoken=${token}; Path=/; Secure`, 'https://cs.rin.ru');
       await jar.setCookie(`securitytoken_expiration=${exp}; Path=/; Secure`, 'https://cs.rin.ru');
       
       console.log("Step 2: Following redirect to /securitycheck/forum/index.php...");
       const checkResponse = await client.get('https://cs.rin.ru/securitycheck/forum/index.php', {
          headers,
          validateStatus: () => true
       });
       console.log("Redirect Status:", checkResponse.status);
       
       // Now visit actual index again!
       console.log("Step 3: Attempting real access...");
       const finalResponse = await client.get('https://cs.rin.ru/forum/index.php', {
          headers,
          validateStatus: () => true
       });
       console.log("Final Status:", finalResponse.status);
       console.log("Page Contains Board Index:", finalResponse.data.includes("Board index"));
    } else {
       console.log("No token found in body.");
    }
  } catch(e) {
    console.error("ERROR:", e);
  }
}

run();
