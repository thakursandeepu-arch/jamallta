const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload, privateKey) {
  const header = { alg: "RS256", typ: "JWT" };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(data).sign(privateKey, "base64");
  const encSig = signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${encSig}`;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const jwt = signJwt(payload, sa.private_key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }).toString();

  const res = await httpsRequest(
    {
      method: "POST",
      hostname: "oauth2.googleapis.com",
      path: "/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  return res.access_token;
}

async function main() {
  const keyPath = process.argv[2];
  const uid = process.argv[3];
  if (!keyPath || !uid) {
    console.error("Usage: node scripts/get-doc.js <serviceAccount.json> <uid>");
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const token = await getAccessToken(sa);
  const projectId = sa.project_id;
  const path = `/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const res = await httpsRequest({
    method: "GET",
    hostname: "firestore.googleapis.com",
    path,
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(JSON.stringify(res.fields, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
