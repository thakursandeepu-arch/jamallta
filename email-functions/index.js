const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];

function normEmail(v) {
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
  let customerBalance = null;
  let customerAdvance = 0;
  const addSnapshotJobs = (snap) => {
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!data.deleteData) jobs.set(docSnap.id, data);
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
    }
  }

  const list = jobs.size ? Array.from(jobs.values()) : [job];
  const totals = list.reduce((sum, item) => {
    const totals = getJobTotals(item);
    sum.total += totals.total;
    sum.paid += totals.paid;
    sum.pending += totals.pending;
    return sum;
  }, { total: 0, paid: 0, pending: 0 });

  const currentBalance = customerBalance != null ? Math.max(customerBalance, 0) : Math.max(totals.pending, 0);
  return {
    total: currentBalance,
    paid: totals.paid,
    pending: currentBalance,
    workTotal: totals.total,
    jobsPending: totals.pending,
    advance: customerAdvance
  };
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

async function sendProjectReadyMail({ to, studioName = "", projectName = "", jobNo = "", readyDate = "", items = [], total = 0, paid = 0, pending = 0, workTotal = 0, jobsPending = 0, advance = 0 }) {
  const project = projectName || jobNo || "your project";
  const subject = `Project Ready for Delivery | ${project}${jobNo ? ` | ${jobNo}` : ""}`;
  const upiId = "thakursandeepm@oksbi";
  const accountName = studioName || project;
  const pendingUpiUrl = buildUpiUrl(pending, `Studio pending payment ${accountName}`);
  const fullUpiUrl = buildUpiUrl(total, `Studio full payment ${accountName}`);
  const pendingPayUrl = buildPaymentPageUrl(pending, `Studio pending payment ${accountName}`, "pending");
  const fullPayUrl = buildPaymentPageUrl(total, `Studio full payment ${accountName}`, "full");
  const safeItems = Array.isArray(items) ? items : [];
  const text = [
    `Hello ${studioName || "Client"},`,
    "",
    `Good news. Your project "${project}" is ready for delivery from Jamallta Films.`,
    readyDate ? `Ready date: ${readyDate}` : "",
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
    `Total Work Amount: ${formatMoney(workTotal || total)}`,
    `Paid Amount: ${formatMoney(paid)}`,
    `Current Balance: ${formatMoney(pending)}`,
    pending > 0 ? `UPI ID: ${upiId}` : "",
    pending > 0 ? `Pay pending amount: ${pendingUpiUrl}` : "",
    total > 0 ? `Full payment: ${fullUpiUrl}` : "",
    "",
    "Please reply to this email or contact us on WhatsApp to confirm delivery and any pending details.",
    "",
    "Regards,",
    "Jamallta Films",
    "Phone/WhatsApp: +91 8091181135"
  ].filter(line => line !== "").join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;color:#1f2937">
      <div style="display:none;max-height:0;overflow:hidden;color:#f4f1eb">Your project is ready. Review items, pending amount, and pay securely by UPI.</div>
      <div style="max-width:680px;margin:0 auto;padding:18px 10px">
        <div style="background:#17120d;color:#fffaf2;padding:24px 22px;border-radius:14px 14px 0 0">
          <div style="font-size:25px;font-weight:700;letter-spacing:.2px;line-height:1.2">Jamallta Films</div>
          <div style="margin-top:7px;color:#e7dac7;font-size:13px;line-height:1.45">Wedding Films, Photography and Editing Studio</div>
        </div>
        <div style="background:#ffffff;border:1px solid #eadfce;border-top:0;border-radius:0 0 14px 14px;padding:22px">
          <div style="display:inline-block;background:#e8f7ee;color:#17613a;border:1px solid #bfe8cf;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;margin-bottom:18px">Project Ready</div>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#17120d">Your project is ready for delivery</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.65">Hello ${studioName || "Client"},<br>Good news. Your project has been completed by <b>Jamallta Films</b> and is now ready for delivery.</p>

          <div style="border:1px solid #eadfce;border-radius:12px;overflow:hidden;margin:22px 0;background:#fffdf8">
            <div style="padding:14px 16px;border-bottom:1px solid #eadfce">
              <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Project Name</div>
              <div style="font-size:18px;font-weight:700;color:#17120d;margin-top:4px">${project}</div>
            </div>
            ${jobNo ? `
              <div style="padding:14px 16px;border-bottom:1px solid #eadfce">
                <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Job No</div>
                <div style="font-size:16px;color:#1f2937;margin-top:4px">${jobNo}</div>
              </div>
            ` : ""}
            ${readyDate ? `
              <div style="padding:14px 16px">
                <div style="font-size:12px;color:#7c6b57;text-transform:uppercase;font-weight:700">Ready Date</div>
                <div style="font-size:16px;color:#1f2937;margin-top:4px">${readyDate}</div>
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
                <div style="font-size:11px;color:#7c6b57;text-transform:uppercase;font-weight:700">Total Work</div>
                <div style="font-size:18px;font-weight:700;color:#17120d;margin-top:5px">${formatMoney(workTotal || total)}</div>
              </td>
              <td style="width:10px"></td>
              <td style="background:#f2fbf5;border:1px solid #cfead8;border-radius:12px;padding:14px;width:33.33%">
                <div style="font-size:11px;color:#35754c;text-transform:uppercase;font-weight:700">Paid</div>
                <div style="font-size:18px;font-weight:700;color:#17613a;margin-top:5px">${formatMoney(paid)}</div>
              </td>
              <td style="width:10px"></td>
              <td style="background:#fff8ed;border:1px solid #eadfce;border-radius:12px;padding:14px;width:33.33%">
                <div style="font-size:11px;color:#7c4d17;text-transform:uppercase;font-weight:700">Current Balance</div>
                <div style="font-size:18px;font-weight:700;color:#8a4b08;margin-top:5px">${formatMoney(pending)}</div>
              </td>
            </tr>
          </table>

          ${(jobsPending > 0 || advance > 0) ? `
            <div style="background:#fffdf8;border:1px solid #eadfce;border-radius:12px;padding:13px 14px;margin:-6px 0 18px;color:#51473d;line-height:1.55;font-size:13px">
              ${jobsPending > 0 ? `<b>Jobs pending:</b> ${formatMoney(jobsPending)} ` : ""}
              ${advance > 0 ? `<br><b>Advance:</b> ${formatMoney(advance)}` : ""}
            </div>
          ` : ""}

          ${(pending > 0 || total > 0) ? `
            <div style="background:#17120d;color:#fffaf2;border-radius:12px;padding:18px;margin:22px 0">
              <div style="font-size:19px;font-weight:700;margin-bottom:8px">Payment Options</div>
              <div style="line-height:1.6;color:#e7dac7">Mobile par button tap karte hi Google Pay/UPI app open hoga. Desktop par same button QR code page kholega.</div>
              <div style="background:#fffaf2;color:#17120d;border-radius:8px;padding:12px;margin:14px 0 0;font-weight:700">UPI ID: ${upiId}</div>
              <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:16px">
                <tr>
                  ${pending > 0 ? `
                    <td style="vertical-align:top;padding:0 0 12px;width:100%;display:block">
                      <div style="background:#241b14;border:1px solid #3c3026;border-radius:12px;padding:14px">
                        <div style="color:#e7dac7;font-size:12px;text-transform:uppercase;font-weight:700">Pay Current Balance</div>
                        <div style="font-size:22px;font-weight:700;margin:5px 0 12px">${formatMoney(pending)}</div>
                        <a href="${pendingPayUrl}" style="display:block;background:#b88a3d;color:#17120d;text-decoration:none;text-align:center;padding:13px 14px;border-radius:8px;font-weight:700">Pay Pending</a>
                      </div>
                    </td>
                  ` : ""}
                </tr>
                <tr>
                  ${total > 0 ? `
                    <td style="vertical-align:top;padding:0;width:100%;display:block">
                      <div style="background:#fffaf2;color:#17120d;border-radius:12px;padding:14px">
                        <div style="color:#7c6b57;font-size:12px;text-transform:uppercase;font-weight:700">Full Pay Current Balance</div>
                        <div style="font-size:22px;font-weight:700;margin:5px 0 12px">${formatMoney(total)}</div>
                        <a href="${fullPayUrl}" style="display:block;background:#17120d;color:#fffaf2;text-decoration:none;text-align:center;padding:13px 14px;border-radius:8px;font-weight:700">Full Pay</a>
                      </div>
                    </td>
                  ` : ""}
                </tr>
              </table>
            </div>
          ` : ""}

          <p style="margin:0 0 20px;line-height:1.65">Please reply to this email or contact us on WhatsApp to confirm delivery and any pending details.</p>
          <a href="https://wa.me/918091181135" style="display:inline-block;background:#17120d;color:#fffaf2;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:700">Contact on WhatsApp</a>
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
      <div class="qr-wrap" id="qrWrap"><img id="qrImage" alt="UPI payment QR code"><p>Desktop par payment ke liye Google Pay, PhonePe ya Paytm se QR scan karein.</p></div>
      <div class="status" id="status"></div>
    </section>
    <footer class="footer">Payment complete hone ke baad screenshot WhatsApp par share kar dein. Phone/WhatsApp: +91 8091181135</footer>
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
        document.getElementById("status").textContent = "UPI app open ho rahi hai. Agar open na ho, Pay Now dobara tap karein.";
        window.location.href = upiUrl;
        return;
      }
      document.getElementById("qrImage").src = qrUrl;
      document.getElementById("qrWrap").classList.add("active");
      document.getElementById("status").textContent = "QR code ready hai. Apne payment app se scan karein.";
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
      readyDate: formatJobDate(after.dataReadyDate || after.dataDeliverDate || new Date()),
      items: after.itemsAdded || [],
      ...await getStudioTotalsForJob(after)
    });

    await change.after.ref.update({
      readyEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      readyEmailTo: normEmail(customer.email),
      readyEmailSkippedAt: admin.firestore.FieldValue.delete(),
      readyEmailSkipReason: admin.firestore.FieldValue.delete()
    });

    return null;
  });
