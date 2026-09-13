// /api/subscribe.js  — Vercel serverless function (CommonJS, no build step needed)
//
// Receives { email, name } from the protein calculator,
// { email, source, movement, url } from the exercise ladder, or
// { email, name, source, tier, shirt_size } from the Summer Series waitlist,
// and adds the person to MailerLite as an ACTIVE subscriber — no double opt-in.
//
// SECURITY: the API key is read from process.env.MAILERLITE_API_KEY, which you
// set in Vercel (Project -> Settings -> Environment Variables). It must NEVER be
// written into this file or committed to GitHub.

// Which MailerLite group each tool feeds into.
// Add a line here when you build the next tool; nothing else needs to change.
const GROUPS = {
  proteincalc:  "189117175765665178", // Protein Calc
  ladder:       "195991971750217505", // Ladder
  summerseries: "198180674172093718"  // Summer Series 001
};

// The protein calc posts { email, name } with no source, so anything that
// arrives without one keeps going where it always went.
const DEFAULT_SOURCE = "proteincalc";

const ML_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

// Only these values are accepted for the Summer Series fields, so a junk or
// tampered post can't write rubbish into the list you order shirts from.
const TIERS = ["in-person", "online", "undecided"];
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

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

  const source = (body.source || DEFAULT_SOURCE).trim();
  const groupId = GROUPS[source];
  if (!groupId) {
    res.status(400).json({ ok: false, error: "Unknown source" });
    return;
  }

  // Only send fields that actually have a value, so a repeat subscriber
  // never gets existing data blanked out.
  const fields = {};
  if (name) fields.name = name;
  if (body.movement) fields.movement = String(body.movement).slice(0, 200);
  if (body.url) fields.ladder_url = String(body.url).slice(0, 500);

  if (source === "summerseries") {
    const tier = String(body.tier || "").trim();
    const size = String(body.shirt_size || "").trim().toUpperCase();
    if (TIERS.indexOf(tier) !== -1) fields.tier = tier;
    if (SIZES.indexOf(size) !== -1) fields.shirt_size = size;
  }

  try {
    const payload = {
      email: email,
      groups: [groupId],
      status: "active"        // <- the bit that skips double opt-in
    };
    if (Object.keys(fields).length) payload.fields = fields;

    const mlRes = await fetch(ML_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify(payload)
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
