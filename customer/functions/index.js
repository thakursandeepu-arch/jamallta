const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];

function normEmail(v) {
  return (v || "").toString().trim().toLowerCase();
}

function normPhone(v) {
  return (v || "").toString().replace(/\D/g, "");
}

function normStudio(v) {
  return (v || "").toString().trim().toLowerCase();
}

// Initialize Razorpay with YOUR KEYS
const razorpay = new Razorpay({
  key_id: "rzp_test_SARXrQc1TLj6jr",
  key_secret: "e8PPlZz9JYPsFhXNz7H5WCwn"
});

const ALLOWED_ORIGINS = [
  "https://jamallta.com",
  "https://www.jamallta.com",
  "http://localhost:5500",
  "http://192.168.29.24:5500",
  "http://localhost:5000"
];

function setCors(req, res) {
  const origin = req.headers.origin;
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
  if (!token) throw new Error("unauthenticated");
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded;
}

// ✅ OPTION 1: CALLABLE FUNCTION (RECOMMENDED - No CORS)
exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  try {
    // Get data from request
    const { amount, jobId, studioName, customerEmail } = data;
    
    // Validate
    if (!amount || amount <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Valid amount is required"
      );
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `receipt_${Date.now()}_${studioName || ""}`,
      notes: {
        jobId: jobId || "",
        studioName: studioName || "",
        customerEmail: customerEmail || ""
      },
      payment_capture: 1
    });

    // Return data to client
    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: "rzp_test_SARXrQc1TLj6jr"
    };

  } catch (error) {
    console.error("Razorpay order error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to create order"
    );
  }
});

// ✅ OPTION 2: HTTP FUNCTION with CORS FIXED
exports.createRazorpayOrderHttp = functions.https.onRequest((req, res) => {
  setCors(req, res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Main request
  (async () => {
    try {
      const authUser = await requireAuth(req);
      const { amount, jobId, studioName } = req.body || {};
      
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: "Valid amount required"
        });
      }

      const order = await razorpay.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
        notes: {
          jobId: jobId || "",
          studioName: studioName || "",
          customerId: authUser?.uid || "",
          customerEmail: authUser?.email || ""
        }
      });

      res.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: "rzp_test_SARXrQc1TLj6jr"
      });

    } catch (error) {
      console.error("Error:", error);
      const msg = error?.message === "unauthenticated" ? "Login required" : (error?.message || "Server error");
      res.status(500).json({
        success: false,
        error: msg
      });
    }
  })();
});

exports.verifyRazorpayPaymentHttp = functions.https.onRequest((req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  (async () => {
    try {
      const authUser = await requireAuth(req);
      const { orderId, paymentId, signature, amount, jobId, studioName } = req.body || {};
      if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ success: false, error: "Missing payment fields" });
      }

      const body = `${orderId}|${paymentId}`;
      const expected = crypto
        .createHmac("sha256", "e8PPlZz9JYPsFhXNz7H5WCwn")
        .update(body)
        .digest("hex");

      if (expected !== signature) {
        return res.status(400).json({ success: false, error: "Invalid signature" });
      }

      await db.collection("payments").add({
        amount: Number(amount || 0),
        jobId: jobId || "",
        studioName: studioName || "",
        customerId: authUser?.uid || "",
        customerEmail: authUser?.email || "",
        paymentId,
        orderId,
        note: jobId ? "Job Payment" : "Payment received",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true });
    } catch (error) {
      console.error("verifyRazorpayPaymentHttp error:", error);
      const msg = error?.message === "unauthenticated" ? "Login required" : (error?.message || "Server error");
      res.status(500).json({ success: false, error: msg });
    }
  })();
});

// ✅ Keep your existing function
exports.onPaymentCreate = functions.firestore
  .document("payments/{id}")
  .onCreate(async (snap) => {
    const p = snap.data();
    if (!p.customerId || !p.amount) return;
    
    let remaining = Number(p.amount);
    const custRef = db.doc(`customers/${p.customerId}`);
    const custSnap = await custRef.get();
    
    await custRef.update({
      balance: (custSnap.data().balance || 0) + remaining
    });

    const jobsSnap = await db.collection("jobs")
      .where("customerId", "==", p.customerId)
      .where("status", "in", ["Delivered", "Ready"])
      .orderBy("date")
      .get();

    for (const doc of jobsSnap.docs) {
      if (remaining <= 0) break;
      const job = doc.data();
      const jobRef = doc.ref;
      const total = Number(job.totalAmount || 0);
      const paid = Number(job.paidAmount || 0);
      const due = total - paid;
      if (due <= 0) continue;
      const adjust = Math.min(due, remaining);
      await jobRef.update({ paidAmount: paid + adjust });
      remaining -= adjust;
    }
  });

function generateTempPassword() {
  return crypto.randomBytes(16).toString("base64url") + "A1!";
}

// ✅ Admin-only: Update Firebase Auth user when client email/phone/studio changes
exports.updateAuthUser = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    const callerUid = context.auth.uid;
    let isAdmin = false;
    try {
      const adminDoc = await db.doc(`users/${callerUid}`).get();
      if (adminDoc.exists) isAdmin = true;
      if (!isAdmin && context.auth.token?.email) {
        const adminQ = await db.collection("users")
          .where("email", "==", context.auth.token.email)
          .limit(1)
          .get();
        if (!adminQ.empty) isAdmin = true;
      }
    } catch (_) {
      // ignore
    }

    if (!isAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }

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
        const tempPassword = generateTempPassword();
        userRecord = await auth.createUser({
          email: newEmail,
          password: tempPassword,
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
  } catch (error) {
    console.error("updateAuthUser error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error?.message || "Auth update failed"
    );
  }
});

// Enforce user role based on admin whitelist + employees/customers collections.
exports.enforceUserRole = functions.firestore
  .document("users/{uid}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;

    const data = change.after.data() || {};
    const uid = context.params.uid;

    const email = normEmail(data.email);
    const phone = normPhone(data.phone);
    const phoneE164 = normPhone(data.phoneE164);
    const studioName = normStudio(data.studioName);
    const currentRole = normEmail(data.role);

    let desiredRole = "customer";

    if (ADMIN_EMAILS.includes(email)) {
      desiredRole = "admin";
    } else {
      let isEmployee = false;
      let isCustomer = false;

      const [empById, custById] = await Promise.all([
        db.doc(`employees/${uid}`).get(),
        db.doc(`customers/${uid}`).get(),
      ]);

      if (empById.exists) isEmployee = true;
      if (custById.exists) isCustomer = true;

      if (!isEmployee && email) {
        const empEmail = await db.collection("employees").where("email", "==", email).limit(1).get();
        if (!empEmail.empty) isEmployee = true;
      }
      if (!isCustomer && email) {
        const custEmail = await db.collection("customers").where("email", "==", email).limit(1).get();
        if (!custEmail.empty) isCustomer = true;
      }

      if (!isEmployee && phone) {
        const empPhone = await db.collection("employees").where("phone", "==", phone).limit(1).get();
        if (!empPhone.empty) isEmployee = true;
      }
      if (!isEmployee && phoneE164) {
        const empPhoneE = await db.collection("employees").where("phoneE164", "==", phoneE164).limit(1).get();
        if (!empPhoneE.empty) isEmployee = true;
      }

      if (!isCustomer && phone) {
        const custPhone = await db.collection("customers").where("phone", "==", phone).limit(1).get();
        if (!custPhone.empty) isCustomer = true;
      }
      if (!isCustomer && phoneE164) {
        const custPhoneE = await db.collection("customers").where("phoneE164", "==", phoneE164).limit(1).get();
        if (!custPhoneE.empty) isCustomer = true;
      }

      if (!isEmployee && !isCustomer && studioName) {
        const empStudio = await db.collection("employees").where("studioName", "==", studioName).limit(1).get();
        if (!empStudio.empty) isEmployee = true;
      }
      if (!isCustomer && studioName) {
        const custStudio = await db.collection("customers").where("studioName", "==", studioName).limit(1).get();
        if (!custStudio.empty) isCustomer = true;
      }

      if (isEmployee) desiredRole = "employee";
      else if (isCustomer) desiredRole = "customer";
      else desiredRole = "customer";
    }

    if (currentRole === desiredRole) return null;
    await change.after.ref.update({ role: desiredRole });
    return null;
  });
