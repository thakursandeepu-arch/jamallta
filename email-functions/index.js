const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
const GOOGLE_REVIEW_URL = "https://share.google/RCf4cfOT3erqcA0tk";

function normEmail(v) {
  return (v || "").toString().trim().toLowerCase();
}

function pickEmail(...values) {
  for (const value of values) {
    const email = normEmail(value);
    if (email && email.includes("@")) return email;
  }
  return "";
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
    throw new Error("Gmail SMTP is not configured");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
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

function escapeHtml(value) {
  return (value == null ? "" : String(value)).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function buildUpiUrl(amount, note = "Jamallta Films Payment") {
  const safeAmount = Number(amount || 0);
  const params = new URLSearchParams({
    pa: "thakursandeepm@oksbi",
    pn: "Jamallta Films",
    cu: "INR",
    tn: note
  });
  if (safeAmount > 0) params.set("am", safeAmount.toFixed(2));
  return `upi://pay?${params.toString()}`;
}

function buildPaymentPageUrl(amount, note = "Jamallta Films Payment", type = "payment") {
  const params = new URLSearchParams({
    amount: Number(amount || 0).toFixed(2),
    note,
    type
  });
  return `https://us-central1-jamallta-films-2-27d2b.cloudfunctions.net/paymentPage?${params.toString()}`;
}

function buildReviewTextLines() {
  return [
    "Share your experience with Jamallta Films:",
    GOOGLE_REVIEW_URL
  ];
}

function buildReviewHtmlSection() {
  return `
    <div style="background:#fffdf8;border:1px solid #eadfce;border-radius:12px;padding:16px;margin:22px 0">
      <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Share Your Experience</div>
      <p style="margin:8px 0 14px;line-height:1.6;color:#51473d">If you were happy with our work, we would truly appreciate a short Google review. Your feedback helps other clients choose Jamallta Films with confidence.</p>
      <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block;background:#b88a3d;color:#17120d;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Leave a Google Review</a>
    </div>
  `;
}

function getItemQtyDisplay(item = {}) {
  const qtyMode = (item.qtyMode || item.rateType || "").toString().toLowerCase();
  if (qtyMode === "time" || qtyMode === "hourly") {
    return item.qtyInput || item.displayValue || item.inputValue || item.qtyDisplay || String(item.qtyValue || "");
  }
  return item.qtyInput || item.displayValue || item.inputValue || item.qtyDisplay || String(item.qtyValue || item.quantity || 1);
}

function getItemRowTotal(item = {}) {
  if (item.rowTotal != null) return Number(item.rowTotal || 0);
  if (item.totalPrice != null) return Number(item.totalPrice || 0);
  const price = Number(item.price || item.itemPrice || item.unitPrice || 0);
  const qty = Number(item.qtyValue || item.quantity || 1);
  return price * qty;
}

function getJobTotals(job = {}) {
  const items = Array.isArray(job.itemsAdded) ? job.itemsAdded : [];
  const itemsTotal = items.reduce((sum, item) => sum + getItemRowTotal(item), 0);
  const total = Number(job.totalAmount || 0) || itemsTotal;
  const paid = Number(job.paidAmount || 0);
  const pending = job.pendingAmount != null
    ? Number(job.pendingAmount || 0)
    : Math.max(total - paid, 0);
  return { total, paid, pending };
}

async function getStudioTotalsForJob(job = {}) {
  const jobs = new Map();
  const payments = new Map();
  let customerBalance = null;
  let customerAdvance = 0;
  const addSnapshotJobs = (snap) => {
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!data.deleteData) jobs.set(docSnap.id, data);
    });
  };
  const addSnapshotPayments = (snap) => {
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!data.deleteData) payments.set(docSnap.id, data);
    });
  };

  if (job.customerId) {
    const customerSnap = await db.doc(`customers/${job.customerId}`).get();
    if (customerSnap.exists) {
      const customerData = customerSnap.data() || {};
      if (customerData.balance != null) customerBalance = Number(customerData.balance || 0);
      customerAdvance = Number(customerData.advanceAmount || 0);
    }

    const byCustomer = await db.collection("jobs")
      .where("customerId", "==", job.customerId)
      .get();
    addSnapshotJobs(byCustomer);

    const paymentsByCustomer = await db.collection("payments")
      .where("customerId", "==", job.customerId)
      .get();
    addSnapshotPayments(paymentsByCustomer);
  }

  const names = [job.studioName, job.customerName]
    .map(v => (v || "").toString().trim())
    .filter(Boolean);

  if (!jobs.size) {
    for (const name of names) {
      const byStudio = await db.collection("jobs")
        .where("studioName", "==", name)
        .get();
      addSnapshotJobs(byStudio);
    }
  }

  for (const name of names) {
    const paymentsByStudio = await db.collection("payments")
      .where("studioName", "==", name)
      .get();
    addSnapshotPayments(paymentsByStudio);
  }

  if (customerBalance == null) {
    for (const name of names) {
      const customerByStudio = await db.collection("customers")
        .where("studioName", "==", name)
        .limit(1)
        .get();
      if (!customerByStudio.empty) {
        const customerData = customerByStudio.docs[0].data() || {};
        if (customerData.balance != null) customerBalance = Number(customerData.balance || 0);
        customerAdvance = Number(customerData.advanceAmount || 0);
        break;
      }

      const customerByName = await db.collection("customers")
        .where("customerName", "==", name)
        .limit(1)
        .get();
      if (!customerByName.empty) {
        const customerData = customerByName.docs[0].data() || {};
        if (customerData.balance != null) customerBalance = Number(customerData.balance || 0);
        customerAdvance = Number(customerData.advanceAmount || 0);
        break;
      }
    }
  }

  const list = jobs.size ? Array.from(jobs.values()) : [job];
  const totals = list.reduce((sum, item) => {
    const totals = getJobTotals(item);
    sum.total += totals.total;
    sum.paid += totals.paid;
    sum.pending += totals.pending;
    if (totals.pending > 0) sum.pendingJobsCount += 1;
    return sum;
  }, { total: 0, paid: 0, pending: 0, pendingJobsCount: 0 });

  const paymentsTotal = Array.from(payments.values()).reduce((sum, payment) => {
    return sum + Number(payment.amount || 0);
  }, 0);
  const ledgerBalance = Math.max(totals.total - paymentsTotal, 0);
  const currentBalance = customerBalance != null
    ? Math.max(customerBalance, 0)
    : (payments.size || jobs.size ? ledgerBalance : Math.max(totals.pending || 0, 0));
  return {
    total: currentBalance,
    paid: payments.size ? Math.min(paymentsTotal, totals.total) : totals.paid,
    pending: currentBalance,
    workTotal: totals.total,
    jobsPending: totals.pending,
    pendingJobsCount: totals.pendingJobsCount,
    advance: customerAdvance
  };
}

async function findCustomerForJob(job = {}) {
  const jobEmail = pickEmail(job.customerEmail, job.email, job.gmail, job.customerGmail, job.contactEmail);
  if (jobEmail) {
    return {
      email: jobEmail,
      studioName: job.studioName || job.customerName || ""
    };
  }

  if (job.customerId) {
    const snap = await db.doc(`customers/${job.customerId}`).get();
    if (snap.exists) {
      const c = snap.data() || {};
      const customerEmail = pickEmail(c.email, c.gmail, c.customerEmail, c.customerGmail, c.contactEmail);
      if (customerEmail) {
        return {
          email: customerEmail,
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
      const customerEmail = pickEmail(c.email, c.gmail, c.customerEmail, c.customerGmail, c.contactEmail);
      if (customerEmail) {
        return {
          email: customerEmail,
          studioName: c.studioName || c.customerName || name
        };
      }
    }
  }

  return null;
}

async function findCustomerForPayment(payment = {}) {
  const paymentEmail = pickEmail(payment.customerEmail, payment.email, payment.gmail, payment.customerGmail, payment.contactEmail);
  if (paymentEmail) {
    return {
      email: paymentEmail,
      studioName: payment.studioName || payment.customerName || ""
    };
  }

  if (payment.customerId) {
    const snap = await db.doc(`customers/${payment.customerId}`).get();
    if (snap.exists) {
      const c = snap.data() || {};
      const customerEmail = pickEmail(c.email, c.gmail, c.customerEmail, c.customerGmail, c.contactEmail);
      if (customerEmail) {
        return {
          email: customerEmail,
          studioName: c.studioName || c.customerName || payment.studioName || payment.customerName || ""
        };
      }
    }
  }

  const names = [payment.studioName, payment.customerName]
    .map(v => (v || "").toString().trim())
    .filter(Boolean);
  for (const name of names) {
    const snap = await db.collection("customers")
      .where("studioName", "==", name)
      .limit(1)
      .get();
    if (!snap.empty) {
      const c = snap.docs[0].data() || {};
      const customerEmail = pickEmail(c.email, c.gmail, c.customerEmail, c.customerGmail, c.contactEmail);
      if (customerEmail) {
        return {
          email: customerEmail,
          studioName: c.studioName || c.customerName || name
        };
      }
    }
  }

  return null;
}

async function getCurrentBalanceForPayment(payment = {}) {
  const jobs = new Map();
  const payments = new Map();

  const addJobs = (snap) => {
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!data.deleteData) jobs.set(docSnap.id, data);
    });
  };

  const addPayments = (snap) => {
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!data.deleteData) payments.set(docSnap.id, data);
    });
  };

  if (payment.customerId) {
    const customerSnap = await db.doc(`customers/${payment.customerId}`).get();
    if (customerSnap.exists) return Math.max(Number(customerSnap.data()?.balance || 0), 0);

    addJobs(await db.collection("jobs").where("customerId", "==", payment.customerId).get());
    addPayments(await db.collection("payments").where("customerId", "==", payment.customerId).get());
  }

  const names = [payment.studioName, payment.customerName]
    .map(v => (v || "").toString().trim())
    .filter(Boolean);

  for (const name of names) {
    const customerByStudio = await db.collection("customers")
      .where("studioName", "==", name)
      .limit(1)
      .get();
    if (!customerByStudio.empty) return Math.max(Number(customerByStudio.docs[0].data()?.balance || 0), 0);

    const customerByName = await db.collection("customers")
      .where("customerName", "==", name)
      .limit(1)
      .get();
    if (!customerByName.empty) return Math.max(Number(customerByName.docs[0].data()?.balance || 0), 0);

    addJobs(await db.collection("jobs").where("studioName", "==", name).get());
    addJobs(await db.collection("jobs").where("customerName", "==", name).get());
    addPayments(await db.collection("payments").where("studioName", "==", name).get());
    addPayments(await db.collection("payments").where("customerName", "==", name).get());
  }

  const totalJobsAmount = Array.from(jobs.values()).reduce((sum, job) => {
    return sum + getJobTotals(job).total;
  }, 0);
  const totalPayments = Array.from(payments.values()).reduce((sum, item) => {
    return sum + Number(item.amount || 0);
  }, 0);

  if (jobs.size) return Math.max(totalJobsAmount - totalPayments, 0);
  if (payments.size) return Math.max(totalJobsAmount - totalPayments, 0);
  return null;
}

async function sendMail({ to, subject, text, html, log = {} }) {
  const email = normEmail(to);
  if (!email) throw new Error("Customer email is required");

  const { user } = getGmailConfig();
  const info = await getMailTransporter().sendMail({
    from: `"Jamallta Films" <${user}>`,
    to: email,
    subject,
    text,
    html
  });

  await db.collection("emailLogs").add({
    to: email,
    ...log,
    messageId: info.messageId || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return info;
}

async function sendCustomerUpdateMail({ to, studioName = "", balance = 0, reason = "manual_admin" }) {
  const pending = Number(balance || 0);
  const subject = `Jamallta Films | Account Update${studioName ? ` | ${studioName}` : ""}`;
  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    "Thank you for working with Jamallta Films. This is a quick account update from our studio.",
    pending > 0 ? `Pending balance: Rs ${pending.toFixed(2)}` : "",
    "",
    "For delivery, payment, or project queries, you can reply to this email or contact us on WhatsApp.",
    "",
    ...buildReviewTextLines(),
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;color:#1f2937">
      <div style="max-width:640px;margin:0 auto;padding:28px 16px">
        <div style="background:#17120d;color:#fffaf2;padding:24px;border-radius:14px 14px 0 0">
          <div style="font-size:24px;font-weight:700;letter-spacing:.3px">Jamallta Films</div>
          <div style="margin-top:6px;color:#e7dac7;font-size:14px">Photography, Films and Professional Editing</div>
        </div>
        <div style="background:#ffffff;padding:26px;border:1px solid #eadfce;border-top:0;border-radius:0 0 14px 14px">
          <p style="margin:0 0 14px;font-size:16px">Hello ${studioName || "Client"},</p>
          <p style="margin:0 0 18px;line-height:1.65">Thank you for working with <b>Jamallta Films</b>. This is a quick account update from our studio.</p>
          ${pending > 0 ? `
            <div style="background:#fff8ed;border:1px solid #eadfce;border-radius:12px;padding:16px;margin:18px 0">
              <div style="font-size:13px;color:#7c6b57;text-transform:uppercase;font-weight:700">Pending Balance</div>
              <div style="font-size:24px;font-weight:700;color:#17120d;margin-top:4px">Rs ${pending.toFixed(2)}</div>
            </div>
          ` : ""}
          <p style="margin:18px 0;line-height:1.65">For delivery, payment, or project queries, you can reply to this email or contact us on WhatsApp.</p>
          <a href="https://wa.me/918091181135" style="display:inline-block;background:#17120d;color:#fffaf2;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Contact on WhatsApp</a>
          ${buildReviewHtmlSection()}
          <p style="margin:24px 0 0;line-height:1.6;color:#51473d">Regards,<br><b>Jamallta Films</b><br>Phone/WhatsApp: +91 8091181135</p>
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to,
    subject,
    text,
    html,
    log: { studioName, balance: pending, reason }
  });
}

async function sendPaymentReceivedMail({ to, studioName = "", amount = 0, method = "", note = "", paymentId = "", currentBalance = null }) {
  const paid = Number(amount || 0);
  const balance = currentBalance == null ? null : Math.max(Number(currentBalance || 0), 0);
  const methodText = method ? method.toString().trim() : "";
  const safeStudio = escapeHtml(studioName || "Client");
  const safeMethod = escapeHtml(methodText);
  const safePaymentId = escapeHtml(paymentId || "");
  const safeNote = escapeHtml(note || "");
  const balancePayUrl = balance > 0
    ? buildPaymentPageUrl(balance, `Remaining balance payment ${studioName || "Client"}`, "pending")
    : "";
  const subject = `Payment Received | Jamallta Films`;
  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    `We have received your payment of ${formatMoney(paid)}.`,
    methodText ? `Payment method: ${methodText}` : "",
    paymentId ? `Payment ID: ${paymentId}` : "",
    note ? `Note: ${note}` : "",
    balance != null ? `Current balance: ${formatMoney(balance)}` : "",
    balancePayUrl ? `Pay remaining balance: ${balancePayUrl}` : "",
    "",
    "Thank you for your payment.",
    "",
    ...buildReviewTextLines(),
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;color:#1f2937">
      <div style="max-width:640px;margin:0 auto;padding:28px 16px">
        <div style="background:#17120d;color:#fffaf2;padding:24px;border-radius:14px 14px 0 0">
          <div style="font-size:24px;font-weight:700;letter-spacing:.3px">Jamallta Films</div>
          <div style="margin-top:6px;color:#e7dac7;font-size:14px">Payment confirmation</div>
        </div>
        <div style="background:#ffffff;padding:26px;border:1px solid #eadfce;border-top:0;border-radius:0 0 14px 14px">
          <p style="margin:0 0 14px;font-size:16px">Hello ${safeStudio},</p>
          <p style="margin:0 0 18px;line-height:1.65">We have received your payment at <b>Jamallta Films</b>.</p>
          <div style="background:#f2fbf5;border:1px solid #cfead8;border-radius:12px;padding:16px;margin:18px 0">
            <div style="font-size:13px;color:#35754c;text-transform:uppercase;font-weight:700">Payment Received</div>
            <div style="font-size:28px;font-weight:700;color:#17613a;margin-top:4px">${formatMoney(paid)}</div>
          </div>
          ${balance != null ? `
          <div style="background:#fff8ed;border:1px solid #eadfce;border-radius:12px;padding:16px;margin:18px 0">
            <div style="font-size:13px;color:#7c6b57;text-transform:uppercase;font-weight:700">Current Balance</div>
            <div style="font-size:24px;font-weight:700;color:#17120d;margin-top:4px">${formatMoney(balance)}</div>
            ${balancePayUrl ? `<a href="${balancePayUrl}" style="display:inline-block;background:#17120d;color:#fffaf2;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;margin-top:14px">Pay Current Balance</a>` : ""}
          </div>
          ` : ""}
          ${safeMethod ? `<p style="margin:0 0 10px"><b>Payment method:</b> ${safeMethod}</p>` : ""}
          ${safePaymentId ? `<p style="margin:0 0 10px"><b>Payment ID:</b> ${safePaymentId}</p>` : ""}
          ${safeNote ? `<p style="margin:0 0 10px"><b>Note:</b> ${safeNote}</p>` : ""}
          <p style="margin:18px 0;line-height:1.65">Thank you for your payment.</p>
          <a href="https://wa.me/918091181135" style="display:inline-block;background:#17120d;color:#fffaf2;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Contact on WhatsApp</a>
          ${buildReviewHtmlSection()}
          <p style="margin:24px 0 0;line-height:1.6;color:#51473d">Regards,<br><b>Jamallta Films</b><br>Phone/WhatsApp: +91 8091181135</p>
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to,
    subject,
    text,
    html,
    log: {
      studioName,
      amount: paid,
      currentBalance: balance,
      method: methodText,
      reason: "payment_received"
    }
  });
}

async function sendProjectReadyMail({ to, studioName = "", projectName = "", jobNo = "", readyDate = "", items = [], total = 0, paid = 0, pending = 0, jobTotal = 0, jobPaid = 0, jobPending = 0, currentBalance = 0, emailType = "ready" }) {
  const project = projectName || jobNo || "your project";
  const isDeliveredMail = emailType === "delivered";
  const badgeText = isDeliveredMail ? "Project Delivered" : "Project Ready";
  const headline = isDeliveredMail ? "Your project has been delivered" : "Your project is ready";
  const summaryText = isDeliveredMail
    ? "Good news. Your project has been delivered by Jamallta Films."
    : "Good news. Your project is ready for delivery by Jamallta Films.";
  const dateLabel = isDeliveredMail ? "Delivery Date" : "Ready Date";
  const subject = `${isDeliveredMail ? "Project Delivered" : "Your Project Is Ready"} | ${project}${jobNo ? ` | ${jobNo}` : ""}`;
  const upiId = "thakursandeepm@oksbi";
  const safeItems = Array.isArray(items) ? items : [];
  const itemsTotal = safeItems.reduce((sum, item) => sum + getItemRowTotal(item), 0);
  const jobTotalAmount = Math.max(Number(jobTotal || total || itemsTotal || 0), 0);
  const jobPaidAmount = Math.min(Math.max(Number(jobPaid || paid || 0), 0), jobTotalAmount);
  const currentPayAmount = Math.min(
    Math.max(Number(jobPending || pending || (jobTotalAmount - jobPaidAmount) || 0), 0),
    jobTotalAmount
  );
  const fullCurrentBalance = Math.max(Number(currentBalance || currentPayAmount || 0), currentPayAmount);
  const showFullBalanceOption = fullCurrentBalance > currentPayAmount + 0.009;
  const jobPayUrl = buildPaymentPageUrl(currentPayAmount, `Job payment ${jobNo || project}`, "job");
  const fullPayUrl = buildPaymentPageUrl(fullCurrentBalance, `Full current balance payment ${studioName || "Client"}`, "full");
  const safeStudioName = escapeHtml(studioName || "Client");
  const safeProject = escapeHtml(project);
  const safeJobNo = escapeHtml(jobNo || "");
  const safeReadyDate = escapeHtml(readyDate || "");

  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    `${summaryText.replace("Your project", `Your project "${project}"`)}`,
    readyDate ? `${dateLabel}: ${readyDate}` : "",
    jobNo ? `Job No: ${jobNo}` : "",
    "",
    safeItems.length ? "Project items:" : "",
    ...safeItems.map(item => {
      const name = item.name || item.itemName || "Item";
      const qty = getItemQtyDisplay(item);
      const price = Number(item.price || item.itemPrice || item.unitPrice || 0);
      const rowTotal = getItemRowTotal(item);
      return `- ${name}: ${qty || "-"} x ${formatMoney(price)} = ${formatMoney(rowTotal)}`;
    }),
    "",
    `This Job Total: ${formatMoney(jobTotalAmount)}`,
    `Paid for This Job: ${formatMoney(jobPaidAmount)}`,
    `This Job Balance: ${formatMoney(currentPayAmount)}`,
    showFullBalanceOption ? `Full Current Balance: ${formatMoney(fullCurrentBalance)}` : "",
    showFullBalanceOption ? `Pay full current balance: ${fullPayUrl}` : "",
    currentPayAmount > 0 ? `Pay this job: ${jobPayUrl}` : "This job is fully paid. No payment is pending for this job.",
    "",
    "Please reply to this email or contact us on WhatsApp to confirm delivery and any pending details.",
    "",
    ...buildReviewTextLines(),
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;color:#1f2937">
      <div style="display:none;max-height:0;overflow:hidden;color:#f4f1eb">${headline}. Review items, balance, and payment status.</div>
      <div style="max-width:680px;margin:0 auto;padding:18px 10px">
        <div style="background:#17120d;color:#fffaf2;padding:24px 22px;border-radius:14px 14px 0 0">
          <div style="font-size:25px;font-weight:700;letter-spacing:.2px;line-height:1.2">Jamallta Films</div>
          <div style="margin-top:7px;color:#e7dac7;font-size:13px;line-height:1.45">Wedding Films, Photography and Editing Studio</div>
        </div>
        <div style="background:#ffffff;border:1px solid #eadfce;border-top:0;border-radius:0 0 14px 14px;padding:22px">
          <div style="display:inline-block;background:#e8f7ee;color:#17613a;border:1px solid #bfe8cf;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;margin-bottom:18px">${badgeText}</div>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#17120d">${headline}</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.65">Hello ${safeStudioName},<br>${summaryText.replace("Jamallta Films", "<b>Jamallta Films</b>")}</p>

          <div style="border:1px solid #eadfce;border-radius:12px;overflow:hidden;margin:22px 0;background:#fffdf8">
            <div style="padding:14px 16px;border-bottom:1px solid #eadfce">
              <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Project Name</div>
              <div style="font-size:18px;font-weight:700;color:#17120d;margin-top:4px">${safeProject}</div>
            </div>
            ${jobNo ? `
              <div style="padding:14px 16px;border-bottom:1px solid #eadfce">
                <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Job No</div>
                <div style="font-size:16px;color:#1f2937;margin-top:4px">${safeJobNo}</div>
              </div>
            ` : ""}
            ${readyDate ? `
              <div style="padding:14px 16px">
                <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">${dateLabel}</div>
                <div style="font-size:16px;color:#1f2937;margin-top:4px">${safeReadyDate}</div>
              </div>
            ` : ""}
          </div>

          ${safeItems.length ? `
            <h2 style="margin:22px 0 10px;font-size:18px;color:#17120d">Project Items</h2>
            <div style="border:1px solid #eadfce;border-radius:12px;overflow:hidden;margin:0 0 22px;background:#fffdf8">
              ${safeItems.map((item, index) => {
                const name = escapeHtml(item.name || item.itemName || "Item");
                const qty = escapeHtml(getItemQtyDisplay(item) || "-");
                const price = Number(item.price || item.itemPrice || item.unitPrice || 0);
                const rowTotal = getItemRowTotal(item);
                return `
                  <div style="padding:13px 14px;border-top:${index ? "1px solid #eadfce" : "0"};background:${index % 2 ? "#ffffff" : "#fffdf8"}">
                    <div style="font-size:15px;font-weight:700;color:#17120d;line-height:1.35">${name}</div>
                    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px">
                      <tr>
                        <td style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Qty / Time</td>
                        <td style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700;text-align:right">Price</td>
                        <td style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700;text-align:right">Total</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#1f2937;padding-top:5px">${qty}</td>
                        <td style="font-size:14px;color:#1f2937;text-align:right;padding-top:5px">${formatMoney(price)}</td>
                        <td style="font-size:14px;color:#17120d;text-align:right;font-weight:700;padding-top:5px">${formatMoney(rowTotal)}</td>
                      </tr>
                    </table>
                  </div>
                `;
              }).join("")}
            </div>
          ` : ""}

          <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0 10px;margin:14px 0 18px">
            <tr>
              <td style="background:#fffdf8;border:1px solid #eadfce;border-radius:12px;padding:14px;width:33.33%">
                <div style="font-size:11px;color:#7c6b57;text-transform:uppercase;font-weight:700">This Job Total</div>
                <div style="font-size:18px;font-weight:700;color:#17120d;margin-top:5px">${formatMoney(jobTotalAmount)}</div>
              </td>
              <td style="width:10px"></td>
              <td style="background:#f2fbf5;border:1px solid #cfead8;border-radius:12px;padding:14px;width:33.33%">
                <div style="font-size:11px;color:#35754c;text-transform:uppercase;font-weight:700">Paid for This Job</div>
                <div style="font-size:18px;font-weight:700;color:#17613a;margin-top:5px">${formatMoney(jobPaidAmount)}</div>
              </td>
              <td style="width:10px"></td>
              <td style="background:#fff8ed;border:1px solid #eadfce;border-radius:12px;padding:14px;width:33.33%">
                <div style="font-size:11px;color:#7c4d17;text-transform:uppercase;font-weight:700">This Job Balance</div>
                <div style="font-size:18px;font-weight:700;color:#8a4b08;margin-top:5px">${formatMoney(currentPayAmount)}</div>
              </td>
            </tr>
          </table>

          ${currentPayAmount <= 0 ? `
            <div style="background:#e8f7ee;border:1px solid #bfe8cf;border-radius:12px;padding:16px;margin:22px 0;color:#17613a;font-size:15px;line-height:1.55">
              <b>Payment Complete</b><br>
              Thank you. No payment is pending for this job.
            </div>
          ` : ""}

          ${currentPayAmount > 0 ? `
            <div style="background:#17120d;color:#fffaf2;border-radius:12px;padding:18px;margin:22px 0">
              <div style="font-size:19px;font-weight:700;margin-bottom:8px">Payment Options</div>
              <div style="background:#fffaf2;color:#17120d;border-radius:8px;padding:12px;margin:14px 0 0;font-weight:700">UPI ID: ${upiId}</div>
              ${showFullBalanceOption ? `
              <div style="background:#fffaf2;color:#17120d;border-radius:12px;padding:14px;margin-top:16px">
                <div style="color:#7c6b57;font-size:12px;text-transform:uppercase;font-weight:700">Full Current Balance</div>
                <div style="font-size:22px;font-weight:700;margin:5px 0 12px">${formatMoney(fullCurrentBalance)}</div>
                <a href="${fullPayUrl}" style="display:block;background:#17120d;color:#fffaf2;text-decoration:none;text-align:center;padding:13px 14px;border-radius:8px;font-weight:700">Pay Full Current Balance</a>
              </div>
              ` : ""}
              <div style="background:#241b14;border:1px solid #3c3026;border-radius:12px;padding:14px;margin-top:16px">
                <div style="color:#e7dac7;font-size:12px;text-transform:uppercase;font-weight:700">${showFullBalanceOption ? "This Job Balance" : "Current Balance Due"}</div>
                <div style="font-size:22px;font-weight:700;margin:5px 0 12px">${formatMoney(currentPayAmount)}</div>
                <a href="${jobPayUrl}" style="display:block;background:#b88a3d;color:#17120d;text-decoration:none;text-align:center;padding:13px 14px;border-radius:8px;font-weight:700">${showFullBalanceOption ? "Pay This Job" : "Pay Current Balance"}</a>
              </div>
            </div>
          ` : ""}

          <p style="margin:0 0 20px;line-height:1.65">Please reply to this email or contact us on WhatsApp to confirm delivery and any pending details.</p>
          <a href="https://wa.me/918091181135" style="display:inline-block;background:#17120d;color:#fffaf2;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:700">Contact on WhatsApp</a>
          ${buildReviewHtmlSection()}
          <div style="height:1px;background:#eadfce;margin:26px 0"></div>
          <p style="margin:0;line-height:1.6;color:#51473d">Regards,<br><b>Jamallta Films</b><br>Phone/WhatsApp: +91 8091181135<br>Solan, Himachal Pradesh</p>
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to,
    subject,
    text,
    html,
    log: { studioName, projectName, jobNo, reason: "project_ready" }
  });
}

exports.paymentPage = functions.https.onRequest((req, res) => {
  const amount = Math.max(Number(req.query.amount || 0), 0);
  const note = (req.query.note || "Jamallta Films payment").toString();
  const type = (req.query.type || "payment").toString();
  const upiId = "thakursandeepm@oksbi";
  const upiUrl = buildUpiUrl(amount, note);
  const title = type === "full" ? "Full Payment" : type === "pending" ? "Pending Payment" : "Payment";

  res.set("Cache-Control", "public, max-age=300");
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jamallta Films Payment</title>
  <style>
    :root{--ink:#17120d;--muted:#6f6254;--line:#eadfce;--paper:#fffaf2;--bg:#f4f1eb;--gold:#b88a3d;--green:#17613a}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;padding:18px}
    .shell{width:min(100%,440px);background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 18px 42px rgba(23,18,13,.12)}
    .brand{background:var(--ink);color:var(--paper);padding:24px 22px}
    .brand h1{margin:0;font-size:25px;line-height:1.15;letter-spacing:0}
    .brand p{margin:8px 0 0;color:#e7dac7;font-size:13px;line-height:1.45}
    .content{padding:22px}.label{font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:700}
    .amount{margin-top:6px;font-size:clamp(32px,10vw,44px);line-height:1;font-weight:800}
    .note{margin:12px 0 0;color:#2f3743;line-height:1.5;overflow-wrap:anywhere}
    .pay-btn{width:100%;border:0;border-radius:10px;background:var(--gold);color:var(--ink);min-height:50px;padding:14px 18px;margin-top:20px;font-size:16px;font-weight:800;cursor:pointer}
    .upi{margin-top:12px;padding:12px;border-radius:10px;background:var(--paper);border:1px solid var(--line);font-weight:700;overflow-wrap:anywhere}
    .qr-wrap{display:none;margin-top:18px;padding:16px;border-radius:14px;background:var(--paper);border:1px solid var(--line);text-align:center}
    .qr-wrap.active{display:block}.qr-wrap img{width:min(100%,260px);height:auto;border-radius:10px;border:1px solid var(--line);background:#fff}
    .qr-wrap p{margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.45}
    .status{margin-top:14px;color:var(--green);font-size:13px;line-height:1.45}
    .footer{border-top:1px solid var(--line);padding:14px 22px 18px;color:var(--muted);font-size:13px;line-height:1.45}
    @media (max-width:420px){body{align-items:flex-start;padding:10px}.shell{border-radius:14px}.brand,.content{padding:20px 16px}.footer{padding:14px 16px 16px}}
  </style>
</head>
<body>
  <main class="shell">
    <section class="brand"><h1>Jamallta Films</h1><p>Wedding Films, Photography and Editing Studio</p></section>
    <section class="content">
      <div class="label">${escapeHtml(title)}</div>
      <div class="amount">${formatMoney(amount)}</div>
      <p class="note">${escapeHtml(note)}</p>
      <button class="pay-btn" id="payButton" type="button">Pay Now</button>
      <div class="upi">UPI ID: ${upiId}</div>
      <div class="qr-wrap" id="qrWrap"><img id="qrImage" alt="UPI payment QR code"></div>
      <div class="status" id="status"></div>
    </section>
    <footer class="footer">After completing the payment, please share the payment confirmation with Jamallta Films. For assistance, contact us on WhatsApp at +91 8091181135.</footer>
  </main>
  <script>
    const upiUrl = ${JSON.stringify(upiUrl)};
    const qrUrl = "https://quickchart.io/qr?size=320&margin=2&text=" + encodeURIComponent(upiUrl);
    function isMobileDevice(){
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
    }
    function openPayment(){
      if(isMobileDevice()){
        window.location.href = upiUrl;
        return;
      }
      document.getElementById("qrImage").src = qrUrl;
      document.getElementById("qrWrap").classList.add("active");
    }
    document.getElementById("payButton").addEventListener("click", openPayment);
    if(isMobileDevice()) setTimeout(openPayment, 450);
  </script>
</body>
</html>`);
});

exports.sendCustomerEmail = functions.https.onCall(async (data, context) => {
  try {
    if (!(await isAdminCaller(context))) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }

    const email = (data?.email || "").toString().trim();
    if (!email) {
      throw new functions.https.HttpsError("invalid-argument", "Customer email is required");
    }

    await sendCustomerUpdateMail({
      to: email,
      studioName: (data?.studioName || "").toString().trim(),
      balance: Number(data?.balance || 0),
      reason: "manual_admin"
    });

    return { success: true };
  } catch (error) {
    console.error("sendCustomerEmail error:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error?.message || "Email send failed");
  }
});

exports.autoSendProjectReadyEmail = functions.firestore
  .document("jobs/{jobId}")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;

    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.data() || {};
    const jobId = change.after.id;
    if (after.deleteData) {
      console.log("ready email skipped: deleted job", { jobId });
      return null;
    }
    if (after.readyEmailSentAt) {
      console.log("ready email skipped: already sent", { jobId });
      return null;
    }
    if (after.readyEmailSkippedAt && change.before.exists && isJobReadyForEmail(before)) {
      console.log("ready email skipped: previous attempt already skipped", {
        jobId,
        reason: after.readyEmailSkipReason || ""
      });
      return null;
    }
    if (after.readyEmailAttemptInProgress) {
      console.log("ready email skipped: attempt in progress", { jobId });
      return null;
    }

    const wasReady = change.before.exists && isJobReadyForEmail(before);
    const isReadyNow = isJobReadyForEmail(after);
    if (!isReadyNow) {
      console.log("ready email skipped: job not ready", {
        jobId,
        status: after.status || "",
        dataReadyDate: after.dataReadyDate || "",
        dataDeliverDate: after.dataDeliverDate || ""
      });
      return null;
    }

    await change.after.ref.update({
      readyEmailAttemptInProgress: true,
      readyEmailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const customer = await findCustomerForJob(after);
    if (!customer?.email) {
      console.log("ready email skipped: customer email missing", {
        jobId,
        customerId: after.customerId || "",
        studioName: after.studioName || after.customerName || "",
        wasReady
      });
      await change.after.ref.update({
        readyEmailAttemptInProgress: admin.firestore.FieldValue.delete(),
        readyEmailSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
        readyEmailSkipReason: "customer_email_missing"
      });
      return null;
    }

    const currentJobTotals = getJobTotals(after);
    const studioTotals = await getStudioTotalsForJob(after);

    try {
      console.log("ready email sending", {
        jobId,
        to: normEmail(customer.email),
        studioName: customer.studioName || after.studioName || after.customerName || "",
        status: after.status || "",
        dataReadyDate: after.dataReadyDate || "",
        dataDeliverDate: after.dataDeliverDate || ""
      });
      await sendProjectReadyMail({
        to: customer.email,
        studioName: customer.studioName || after.studioName || after.customerName || "",
        projectName: after.projectName || "",
        jobNo: after.jobNo || "",
        readyDate: formatJobDate(after.dataReadyDate || after.dataDeliverDate || new Date()),
        items: after.itemsAdded || [],
        jobTotal: currentJobTotals.total,
        jobPaid: currentJobTotals.paid,
        jobPending: currentJobTotals.pending,
        currentBalance: studioTotals.pending,
        emailType: after.dataDeliverDate || ["delivered", "completed"].includes(normEmail(after.status)) ? "delivered" : "ready"
      });

      await change.after.ref.update({
        readyEmailAttemptInProgress: admin.firestore.FieldValue.delete(),
        readyEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        readyEmailTo: normEmail(customer.email),
        readyEmailSkippedAt: admin.firestore.FieldValue.delete(),
        readyEmailSkipReason: admin.firestore.FieldValue.delete()
      });
      console.log("ready email sent", { jobId, to: normEmail(customer.email) });
    } catch (error) {
      console.error("ready email failed", {
        jobId,
        to: normEmail(customer.email),
        error: error?.message || String(error)
      });
      await change.after.ref.update({
        readyEmailAttemptInProgress: admin.firestore.FieldValue.delete(),
        readyEmailSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
        readyEmailSkipReason: error?.message || "ready_email_failed"
      });
    }

    return null;
  });

exports.autoSendPaymentReceivedEmail = functions.firestore
  .document("payments/{paymentId}")
  .onCreate(async (snap) => {
    const payment = snap.data() || {};
    const amount = Number(payment.amount || 0);
    if (!amount) return null;

    try {
      const customer = await findCustomerForPayment(payment);
      if (!customer?.email) {
        await snap.ref.update({
          paymentEmailSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentEmailSkipReason: "customer_email_missing"
        });
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, 2500));
      const currentBalance = await getCurrentBalanceForPayment(payment);
      console.log("payment received email balance", {
        paymentId: snap.id,
        amount,
        currentBalance,
        studioName: payment.studioName || payment.customerName || "",
        customerId: payment.customerId || ""
      });

      await sendPaymentReceivedMail({
        to: customer.email,
        studioName: customer.studioName || payment.studioName || payment.customerName || "",
        amount,
        method: payment.method || "",
        note: payment.note || "",
        paymentId: payment.paymentId || "",
        currentBalance
      });

      await snap.ref.update({
        paymentEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentEmailTo: normEmail(customer.email),
        paymentEmailSkippedAt: admin.firestore.FieldValue.delete(),
        paymentEmailSkipReason: admin.firestore.FieldValue.delete()
      });
    } catch (error) {
      console.error("autoSendPaymentReceivedEmail error:", error);
      await snap.ref.update({
        paymentEmailSkippedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentEmailSkipReason: error?.message || "payment_email_failed"
      });
    }

    return null;
  });
