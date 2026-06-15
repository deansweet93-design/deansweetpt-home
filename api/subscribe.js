// /api/subscribe.js  — Vercel serverless function (CommonJS, no build step needed)
//
// Receives { email, name } from the protein calculator and adds the person to
// MailerLite as an ACTIVE subscriber in the Protein Calc group — no double opt-in.
//
// SECURITY: the API key is read from process.env.MAILERLITE_API_KEY, which you
// set in Vercel (Project -> Settings -> Environment Variables). It must NEVER be
// written into this file or committed to GitHub.

const GROUP_ID = "189117175765665178"; // Protein Calc group
const ML_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: "Server not configured" });
    return;
  }

  // Parse body whether it arrives parsed or as a raw string
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const email = (body.email || "").trim();
  const name = (body.name || "").trim();

  if (!isEmail(email)) {
    res.status(400).json({ ok: false, error: "Invalid email" });
    return;
  }

  try {
    const mlRes = await fetch(ML_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        email: email,
        fields: { name: name },
        groups: [GROUP_ID],
        status: "active"        // <- the bit that skips double opt-in
      })
    });

    if (mlRes.ok) {
      res.status(200).json({ ok: true });
    } else {
      const detail = await mlRes.text();
      console.error("MailerLite error", mlRes.status, detail);
      // Don't leak MailerLite internals to the browser
      res.status(502).json({ ok: false, error: "Subscribe failed" });
    }
  } catch (err) {
    console.error("subscribe exception", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};
