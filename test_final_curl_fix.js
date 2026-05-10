const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const cookieFile = path.join(__dirname, 'test_jar.txt');
if (fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile);

function curlReq(url) {
  const cmd = `curl -s -L -H "User-Agent: Mozilla/5.0" -H "Accept-Language: en-US,en;q=0.9" -b "${cookieFile}" -c "${cookieFile}" --max-time 15 "${url}"`;
  console.log(`> Executing CURL: ${url}`);
  return execSync(cmd).toString('utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest() {
  try {
    console.log("=== Phase 1: Initial Hit and Token Extraction ===");
    const initial = curlReq("https://cs.rin.ru/forum/index.php");
    
    const tMatch = initial.match(/securitytoken=([^;"]+)/);
    const eMatch = initial.match(/securitytoken_expiration=([^;"]+)/);
    
    if (!tMatch) {
       console.log("No token seen. Exiting.");
       return;
    }
    
    const t = tMatch[1];
    const e = eMatch[1];
    console.log("Setting manual token to jar:", t);
    
    // Write token manually to Netscape Cookie Jar format format in our temp file
    // Format: domain \t include_sub \t path \t secure \t expiry \t name \t value
    fs.appendFileSync(cookieFile, `cs.rin.ru\tTRUE\t/\tTRUE\t${e}\tsecuritytoken\t${t}\n`);
    fs.appendFileSync(cookieFile, `cs.rin.ru\tTRUE\t/\tTRUE\t${e}\tsecuritytoken_expiration\t${e}\n`);

    console.log("=== Phase 2: Hit Security Check ===");
    curlReq("https://cs.rin.ru/securitycheck/forum/index.php");
    
    console.log("Waiting 2 seconds for stabilization...");
    await sleep(2500);
    
    console.log("=== Phase 3: Re-Verify Forum Access ===");
    const verified = curlReq("https://cs.rin.ru/forum/index.php");
    
    if (verified.includes("Board index")) {
       console.log("SUCCESS: Access granted permanently to cookie jar!");
       
       console.log("=== Phase 4: Search Execution ===");
       const searchUrl = "https://cs.rin.ru/forum/search.php?keywords=Factorio&terms=all&author=&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search";
       const results = curlReq(searchUrl);
       
       if (results.includes("Search found")) {
         console.log("FINAL VERDICT: FULL SYSTEM VICTORY!!! Logic acts as valid verified agent.");
       } else {
         console.log("Partial Success, could not perform search.");
       }
    } else {
       console.log("STILL BLOCKED! Dumping response summary:");
       console.log(verified.substring(0, 500));
    }
  } catch (err) {
     console.error("Script Crashed:", err);
  }
}

runTest();
