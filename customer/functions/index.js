const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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

function getGmailConfig() {
  const cfg = functions.config()?.gmail || {};
  const user = process.env.GMAIL_USER || cfg.user || "";
  const pass = process.env.GMAIL_APP_PASSWORD || cfg.pass || "";
  return { user, pass };
}

function getMailTransporter() {
  const { user, pass } = getGmailConfig();
  if (!user || !pass) {
    throw new Error("Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
}

async function sendCustomerMail({ to, studioName = "", balance = 0, reason = "manual" }) {
  const email = normEmail(to);
  if (!email) throw new Error("Customer email is required");

  const { user } = getGmailConfig();
  const pending = Number(balance || 0);
  const subject = `Jamallta Films update${studioName ? ` - ${studioName}` : ""}`;
  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    "Sharing an update from Jamallta Films.",
    pending > 0 ? `Pending balance: Rs ${pending.toFixed(2)}` : "",
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
      <p>Hello ${studioName || "Client"},</p>
      <p>Sharing an update from <b>Jamallta Films</b>.</p>
      ${pending > 0 ? `<p><b>Pending balance:</b> Rs ${pending.toFixed(2)}</p>` : ""}
      <p>Regards,<br/>Jamallta Films<br/>Phone/WhatsApp: +91 8091181135</p>
    </div>
  `;

  const info = await getMailTransporter().sendMail({
    from: `"Jamallta Films" <${user}>`,
    to: email,
    subject,
    text,
    html
  });

  await db.collection("emailLogs").add({
    to: email,
    studioName,
    balance: pending,
    reason,
    messageId: info.messageId || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return info;
}

function isJobReadyForEmail(job = {}) {
  const status = normEmail(job.status);
  return status === "ready" || status === "delivered" || status === "completed" || !!job.dataReadyDate || !!job.dataDeliverDate;
}

function formatJobDate(value) {
  if (!value) return "";
  if (value.toDate) return value.toDate().toLocaleDateString("en-IN");
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString("en-IN");
  const d = new Date(value);
  if (!isNaN(d)) return d.toLocaleDateString("en-IN");
  return String(value);
}

async function findCustomerForJob(job = {}) {
  if (job.customerEmail) {
    return {
      email: job.customerEmail,
      studioName: job.studioName || job.customerName || ""
    };
  }

  if (job.customerId) {
    const snap = await db.doc(`customers/${job.customerId}`).get();
    if (snap.exists) {
      const c = snap.data() || {};
      if (c.email) {
        return {
          email: c.email,
          studioName: c.studioName || c.customerName || job.studioName || job.customerName || ""
        };
      }
    }
  }

  const names = [job.studioName, job.customerName]
    .map(v => (v || "").toString().trim())
    .filter(Boolean);
  for (const name of names) {
    const snap = await db.collection("customers")
      .where("studioName", "==", name)
      .limit(1)
      .get();
    if (!snap.empty) {
      const c = snap.docs[0].data() || {};
      if (c.email) {
        return {
          email: c.email,
          studioName: c.studioName || c.customerName || name
        };
      }
    }
  }

  return null;
}

async function sendProjectReadyMail({ to, studioName = "", projectName = "", jobNo = "", readyDate = "" }) {
  const email = normEmail(to);
  if (!email) throw new Error("Customer email is required");

  const { user } = getGmailConfig();
  const project = projectName || jobNo || "your project";
  const subject = `Your project is ready - ${project}`;
  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    `Good news. Your project "${project}" is ready for delivery.`,
    readyDate ? `Ready date: ${readyDate}` : "",
    jobNo ? `Job No: ${jobNo}` : "",
    "",
    "Please contact Jamallta Films on WhatsApp/call for delivery or pending details.",
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
      <p>Hello ${studioName || "Client"},</p>
      <p>Good news. Your project <b>${project}</b> is ready for delivery.</p>
      ${readyDate ? `<p><b>Ready date:</b> ${readyDate}</p>` : ""}
      ${jobNo ? `<p><b>Job No:</b> ${jobNo}</p>` : ""}
      <p>Please contact Jamallta Films on WhatsApp/call for delivery or pending details.</p>
      <p>Regards,<br/>Jamallta Films<br/>Phone/WhatsApp: +91 8091181135</p>
    </div>
  `;

  const info = await getMailTransporter().sendMail({
    from: `"Jamallta Films" <${user}>`,
    to: email,
    subject,
    text,
    html
  });

  await db.collection("emailLogs").add({
    to: email,
    studioName,
    projectName,
    jobNo,
    reason: "project_ready",
    messageId: info.messageId || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return info;
}

async function isAdminCaller(context) {
  if (!context.auth) return false;
  if (ADMIN_EMAILS.includes(normEmail(context.auth.token?.email))) return true;
  const uid = context.auth.uid;
  const userDoc = await db.doc(`users/${uid}`).get();
  if (userDoc.exists && normEmail(userDoc.data()?.role).includes("admin")) return true;
  const byEmail = await db.collection("users")
    .where("email", "==", context.auth.token?.email || "")
    .limit(1)
    .get();
  return !byEmail.empty && byEmail.docs.some(d => normEmail(d.data()?.role).includes("admin"));
}

function getRazorpayConfig() {
  const cfg = functions.config()?.razorpay || {};
  const keyId = process.env.RAZORPAY_KEY_ID || cfg.key_id || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || cfg.key_secret || "";
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return { keyId, keySecret };
}

// Initialize Razorpay from environment/runtime config.
const razorpayConfig = getRazorpayConfig();
const razorpay = new Razorpay({
  key_id: razorpayConfig.keyId,
  key_secret: razorpayConfig.keySecret
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
      key: razorpayConfig.keyId
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
        key: razorpayConfig.keyId
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
        .createHmac("sha256", razorpayConfig.keySecret)
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
exports.sendCustomerEmail = functions.https.onCall(async (data, context) => {
  try {
    if (!(await isAdminCaller(context))) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }

    const email = (data?.email || "").toString().trim();
    const studioName = (data?.studioName || "").toString().trim();
    const balance = Number(data?.balance || 0);
    if (!email) {
      throw new functions.https.HttpsError("invalid-argument", "Customer email is required");
    }

    await sendCustomerMail({
      to: email,
      studioName,
      balance,
      reason: "manual_admin"
    });

    return { success: true };
  } catch (error) {
    console.error("sendCustomerEmail error:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error?.message || "Email send failed");
  }
});

exports.autoSendCustomerWelcomeEmail = functions.firestore
  .document("customers/{customerId}")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;

    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.data() || {};
    if (after.deleteData || after.welcomeEmailSentAt) return null;

    const email = (after.email || "").toString().trim();
    if (!email) return null;

    const oldEmail = (before.email || "").toString().trim();
    const isNewCustomer = !change.before.exists;
    const emailJustAdded = change.before.exists && !oldEmail && email;
    if (!isNewCustomer && !emailJustAdded) return null;

    await sendCustomerMail({
      to: email,
      studioName: after.studioName || after.customerName || "",
      balance: Number(after.balance || 0),
      reason: isNewCustomer ? "customer_created" : "customer_email_added"
    });

    await change.after.ref.update({
      welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return null;
  });

exports.autoSendProjectReadyEmail = functions.firestore
  .document("jobs/{jobId}")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;

    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.data() || {};
    if (after.deleteData || after.readyEmailSentAt) return null;

    const wasReady = change.before.exists && isJobReadyForEmail(before);
    const isReadyNow = isJobReadyForEmail(after);
    if (!isReadyNow || wasReady) return null;

    const customer = await findCustomerForJob(after);
    if (!customer?.email) {
      await change.after.ref.update({
        readyEmailSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
        readyEmailSkipReason: "customer_email_missing"
      });
      return null;
    }

    await sendProjectReadyMail({
      to: customer.email,
      studioName: customer.studioName || after.studioName || after.customerName || "",
      projectName: after.projectName || "",
      jobNo: after.jobNo || "",
      readyDate: formatJobDate(after.dataReadyDate || after.dataDeliverDate || new Date())
    });

    await change.after.ref.update({
      readyEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      readyEmailTo: normEmail(customer.email),
      readyEmailSkippedAt: admin.firestore.FieldValue.delete(),
      readyEmailSkipReason: admin.firestore.FieldValue.delete()
    });

    return null;
  });

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

    try {
      await db.collection("notifications").add({
        audience: "admin",
        title: "Payment Added",
        message: `Payment received from ${p.studioName || p.customerEmail || "Client"}: ₹${Number(p.amount || 0)}`,
        studioName: p.studioName || "",
        jobNo: p.jobNo || p.jobId || "",
        source: "payment_add",
        createdBy: p.customerEmail || "",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Admin notification (payment) failed:", e);
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
