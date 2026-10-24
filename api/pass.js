// Builds and signs an Apple Wallet pass from a QR code value.
// Privacy rules for this file:
//   - Never log the code or the request body.
//   - Never write anything to disk or a database.
//   - Build the pass in memory, send it, forget it.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PKPass } = require("passkit-generator");

// Only codes matching this pattern get signed. Tighten it once you know your
// school's exact format (e.g. ^\d{7}$ for a 7-digit ID). Set CODE_PATTERN in Vercel.
const CODE_PATTERN = new RegExp(process.env.CODE_PATTERN || "^[A-Za-z0-9_\\-]{4,64}$");

// Pass template files, stored at the root of the repo.
const MODEL_FILES = [
  "pass.json",
  "icon.png", "icon@2x.png", "icon@3x.png",
  "logo.png", "logo@2x.png", "logo@3x.png",
];

function loadModel() {
  const buffers = {};
  for (const name of MODEL_FILES) {
    buffers[name] = fs.readFileSync(path.join(process.cwd(), name));
  }
  return buffers;
}

// Best-effort rate limit: max 10 passes per IP per 10 minutes, per server instance.
// Vercel's built-in firewall rate limiting is the stronger version (see SETUP.md).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  // Store a hash, not the raw IP.
  const key = crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
  const entry = hits.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

// Running total of passes made. Stores ONE number, nothing about the user.
// Works once an Upstash Redis store is connected in Vercel (Storage tab).
async function countPass() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/incr/passes_made`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
  } catch (_) {
    // Never let the counter break pass creation.
  }
}

// Certificates live in Vercel environment variables as base64 text, never in the repo.
function fromEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error("missing_config");
  return Buffer.from(v, "base64");
}

function readCode(req) {
  let body = req.body;
  if (typeof body === "string") body = Object.fromEntries(new URLSearchParams(body));
  if (Buffer.isBuffer(body)) body = Object.fromEntries(new URLSearchParams(body.toString()));
  const code = body && typeof body.code === "string" ? body.code.trim() : "";
  return code;
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font-family:-apple-system,system-ui,sans-serif;padding:32px;text-align:center">` +
      `<p>${message}</p><p><a href="/">Go back</a></p></body>`
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Use the upload page to make a pass.");

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "";
  if (rateLimited(ip)) return sendError(res, 429, "Too many passes from this device. Try again in a few minutes.");

  const code = readCode(req);
  if (!CODE_PATTERN.test(code)) {
    return sendError(res, 400, "That QR code doesn't look like a dining hall code. Try a clearer screenshot.");
  }

  try {
    const pass = new PKPass(
      loadModel(),
      {
        wwdr: fromEnv("WWDR_CERT"),
        signerCert: fromEnv("SIGNER_CERT"),
        signerKey: fromEnv("SIGNER_KEY"),
        signerKeyPassphrase: process.env.SIGNER_KEY_PASSPHRASE || undefined,
      },
      {
        // Random serial so the pass itself doesn't reveal or track the ID.
        serialNumber: crypto.randomUUID(),
        passTypeIdentifier: process.env.PASS_TYPE_ID,
        teamIdentifier: process.env.TEAM_ID,
      }
    );

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: code,
      messageEncoding: "iso-8859-1",
    });

    const buffer = pass.getAsBuffer();
    await countPass();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", 'attachment; filename="dining.pkpass"');
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err) {
    // Log only the error type, never the code.
    console.error("pass_build_failed", err && err.message === "missing_config" ? "missing_config" : "sign_error");
    return sendError(res, 500, "Something went wrong making your pass. Try again later.");
  }
};
