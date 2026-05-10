const testStr = `      document.getElementById("res").innerHTML = '<center><button style="width:555px;" onclick="location.href=\\\'https://mega.nz/folder/r8YR2RAY#2n-lKvttyMR0TuIR72MGzA/file/vo4mxDZD\\\'" class="btn">...';`;
const regex = /location\.href\s*=\s*\\*['"](.*?)\\*['"]/i;
const m = testStr.match(regex);
console.log("Matched URL:", m ? m[1] : "FAILED");
