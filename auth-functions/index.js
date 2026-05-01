const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const ALLOWED_ORIGINS = [
  "https://jamallta.com",
  "https://www.jamallta.com",
  "https://jamallta-films-2-27d2b.web.app",
  "https://jamallta-films-2-27d2b.firebaseapp.com",
  "https://jamallta-films.web.app",
  "https://jamallta-films.firebaseapp.com",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
  "http://0.0.0.0:5500",
  "http://0.0.0.0:5501"
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://jamallta.com");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function requireAuth(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new functions.https.HttpsError("unauthenticated", "Login required");
  return admin.auth().verifyIdToken(token);
}

function generateTempPassword() {
  return crypto.randomBytes(16).toString("base64url") + "A1!";
}

async function assertAdmin(decoded) {
  const callerUid = decoded.uid;
  let isAdmin = false;
  const email = (decoded.email || "").toLowerCase();
  try {
    const adminDoc = await db.doc(`users/${callerUid}`).get();
    if (adminDoc.exists) isAdmin = true;
    if (!isAdmin && email) {
      const adminQ = await db.collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
      if (!adminQ.empty) isAdmin = true;
    }
  } catch (_) {
    // ignore
  }
  if (!isAdmin) throw new functions.https.HttpsError("permission-denied", "Admin only");
}

async function updateAuthUser(data, decoded) {
  await assertAdmin(decoded);

  const oldEmail = (data?.oldEmail || "").trim();
  const newEmail = (data?.newEmail || "").trim();
  const phone = (data?.phone || "").trim();
  const displayName = (data?.displayName || "").trim();

  if (!oldEmail && !newEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Email required to match user");
  }

  let userRecord = null;
  let created = false;
  try {
    userRecord = oldEmail
      ? await auth.getUserByEmail(oldEmail)
      : await auth.getUserByEmail(newEmail);
  } catch (err) {
    if (err?.code === "auth/user-not-found" && newEmail) {
      userRecord = await auth.createUser({
        email: newEmail,
        password: generateTempPassword(),
        displayName: displayName || ""
      });
      created = true;
    } else {
      throw err;
    }
  }

  const updatePayload = {};
  if (newEmail && newEmail !== userRecord.email) updatePayload.email = newEmail;
  if (phone) updatePayload.phoneNumber = phone;
  if (displayName) updatePayload.displayName = displayName;

  if (Object.keys(updatePayload).length === 0) {
    return { success: true, skipped: true };
  }

  await auth.updateUser(userRecord.uid, updatePayload);
  return { success: true, created };
}

exports.updateAuthUserHttp = functions.https.onRequest((req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  (async () => {
    try {
      const decoded = await requireAuth(req);
      const result = await updateAuthUser(req.body || {}, decoded);
      res.json(result);
    } catch (error) {
      console.error("updateAuthUserHttp error:", error);
      const status = error?.code === "unauthenticated"
        ? 401
        : error?.code === "permission-denied"
        ? 403
        : error?.code === "invalid-argument"
        ? 400
        : 500;
      res.status(status).json({
        success: false,
        error: error?.message || "Auth update failed"
      });
    }
  })();
});
