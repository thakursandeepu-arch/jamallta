const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

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
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
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

function getFieldValue(fields, key) {
  const f = fields?.[key];
  if (!f) return "";
  if (typeof f.stringValue === "string") return f.stringValue;
  if (typeof f.integerValue === "string") return f.integerValue;
  if (typeof f.doubleValue === "number" || typeof f.doubleValue === "string") return String(f.doubleValue);
  if (typeof f.booleanValue === "boolean") return String(f.booleanValue);
  return "";
}

function normEmail(v) {
  return (v || "").toString().trim().toLowerCase();
}

function normPhone(v) {
  const digits = (v || "").toString().replace(/\D/g, "");
  return digits;
}

function normStudio(v) {
  return (v || "").toString().trim().toLowerCase();
}

async function listCollection({ token, projectId, collection }) {
  const docs = [];
  let pageToken = "";
  while (true) {
    const path = `/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await httpsRequest({
      method: "GET",
      hostname: "firestore.googleapis.com",
      path,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.documents) docs.push(...res.documents);
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return docs;
}

async function commitRoleUpdate({ token, projectId, docName, role }) {
  const body = JSON.stringify({
    writes: [
      {
        update: {
          name: docName,
          fields: { role: { stringValue: role } },
        },
        updateMask: { fieldPaths: ["role"] },
      },
    ],
  });
  const path = `/v1/projects/${projectId}/databases/(default)/documents:commit`;
  return httpsRequest({
    method: "POST",
    hostname: "firestore.googleapis.com",
    path,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);
}

async function main() {
  const args = process.argv.slice(2);
  const keyIdx = args.indexOf("--key");
  if (keyIdx === -1 || !args[keyIdx + 1]) {
    console.error("Usage: node scripts/fix-roles.js --key <path> [--admin email] [--dry]");
    process.exit(1);
  }
  const keyPath = args[keyIdx + 1];
  const adminIdx = args.indexOf("--admin");
  const adminEmail = (adminIdx !== -1 && args[adminIdx + 1]) ? args[adminIdx + 1] : "thakursandeepu@gmail.com";
  const dryRun = args.includes("--dry");

  const sa = readJson(keyPath);
  const token = await getAccessToken(sa);
  const projectId = sa.project_id;

  console.log("Fetching collections...");
  const [users, employees, customers] = await Promise.all([
    listCollection({ token, projectId, collection: "users" }),
    listCollection({ token, projectId, collection: "employees" }),
    listCollection({ token, projectId, collection: "customers" }),
  ]);

  const employeeEmails = new Set();
  const employeePhones = new Set();
  const employeeStudios = new Set();
  const employeeIds = new Set();

  for (const d of employees) {
    const fields = d.fields || {};
    employeeIds.add(d.name.split("/").pop());
    const email = normEmail(getFieldValue(fields, "email"));
    const phone = normPhone(getFieldValue(fields, "phone"));
    const phoneE164 = normPhone(getFieldValue(fields, "phoneE164"));
    const studioName = normStudio(getFieldValue(fields, "studioName"));
    if (email) employeeEmails.add(email);
    if (phone) employeePhones.add(phone);
    if (phoneE164) employeePhones.add(phoneE164);
    if (studioName) employeeStudios.add(studioName);
  }

  const customerEmails = new Set();
  const customerPhones = new Set();
  const customerStudios = new Set();
  const customerIds = new Set();

  for (const d of customers) {
    const fields = d.fields || {};
    customerIds.add(d.name.split("/").pop());
    const email = normEmail(getFieldValue(fields, "email"));
    const phone = normPhone(getFieldValue(fields, "phone"));
    const phoneE164 = normPhone(getFieldValue(fields, "phoneE164"));
    const studioName = normStudio(getFieldValue(fields, "studioName"));
    if (email) customerEmails.add(email);
    if (phone) customerPhones.add(phone);
    if (phoneE164) customerPhones.add(phoneE164);
    if (studioName) customerStudios.add(studioName);
  }

  let total = 0;
  let updates = 0;
  let skipped = 0;

  for (const d of users) {
    total++;
    const fields = d.fields || {};
    const uid = d.name.split("/").pop();
    const email = normEmail(getFieldValue(fields, "email"));
    const phone = normPhone(getFieldValue(fields, "phone"));
    const phoneE164 = normPhone(getFieldValue(fields, "phoneE164"));
    const studioName = normStudio(getFieldValue(fields, "studioName"));
    const currentRole = normEmail(getFieldValue(fields, "role"));

    let newRole = "customer";

    if (email && email === normEmail(adminEmail)) {
      newRole = "admin";
    } else {
      const isEmployee = employeeIds.has(uid) || employeeEmails.has(email) || employeePhones.has(phone) || employeePhones.has(phoneE164) || employeeStudios.has(studioName);
      const isCustomer = customerIds.has(uid) || customerEmails.has(email) || customerPhones.has(phone) || customerPhones.has(phoneE164) || customerStudios.has(studioName) || !!studioName;

      if (isEmployee) newRole = "employee";
      else if (isCustomer) newRole = "customer";
      else newRole = "customer";
    }

    if (currentRole === newRole) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await commitRoleUpdate({
        token,
        projectId,
        docName: d.name,
        role: newRole,
      });
    }
    updates++;
    console.log(`${uid}: ${currentRole || "(none)"} -> ${newRole}`);
  }

  console.log(`Done. Users checked: ${total}, updated: ${updates}, unchanged: ${skipped}${dryRun ? " (dry run)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
