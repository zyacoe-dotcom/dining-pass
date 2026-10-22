# Dining Pass setup

About an hour total. Do these in order. Commands are for a Mac Terminal. On Windows, install Git for Windows and run them in Git Bash.

---

## Step 1. Test that your QR is static (2 min)

Before anything else, open a dining hall screenshot that's at least a few days old and make sure it still scans. If old screenshots stop working, the QR rotates and a Wallet pass won't work either. Stop here if so.

## Step 2. Find your Team ID (1 min)

1. Go to developer.apple.com/account
2. Scroll to **Membership details**
3. Copy the 10-character **Team ID** (looks like `A1B2C3D4E5`)

## Step 3. Create a Pass Type ID (3 min)

1. developer.apple.com/account → **Certificates, IDs & Profiles** → **Identifiers**
2. Click **+** → choose **Pass Type IDs** → Continue
3. Description: `Dining Pass`
4. Identifier: `pass.com.YOURNAME.diningpass` (all lowercase, e.g. `pass.com.zyacoe.diningpass`)
5. Register

## Step 4. Make the signing certificate (10 min)

Make a folder that is NOT inside the project, so the key never ends up on GitHub.

```bash
mkdir ~/dining-certs && cd ~/dining-certs

# 1. Make a private key and a certificate request
openssl genrsa -out signer.key 2048
openssl req -new -key signer.key -out request.csr -subj "/CN=Dining Pass/emailAddress=you@example.com"
```

Then in Apple's portal:

1. **Certificates** → **+** → under Services choose **Pass Type ID Certificate** → Continue
2. Pick the Pass Type ID from Step 3
3. Upload `request.csr` from `~/dining-certs`
4. Download the certificate. It saves as `pass.cer`. Move it into `~/dining-certs`

Download Apple's intermediate certificate (WWDR G4) from
https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
and move it into `~/dining-certs` too.

Convert both to the format the server needs.

```bash
cd ~/dining-certs
openssl x509 -inform DER -in pass.cer -out signer.pem
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

Keep `signer.key` private. Anyone with it can sign passes as you.

## Step 5. Put the code on GitHub (5 min)

1. Make a free account at github.com
2. Click **New repository** → name it `dining-pass` → Public (so people can verify it stores nothing) → Create
3. On the empty repo page click **uploading an existing file**
4. Drag in everything from the project folder EXCEPT `node_modules` (`api`, `model.pass`, `public`, `package.json`, `package-lock.json`, `vercel.json`, `.gitignore`, `SETUP.md`)
5. Commit

## Step 6. Deploy on Vercel (10 min)

1. Sign up at vercel.com with your GitHub account (free Hobby plan)
2. **Add New → Project** → import `dining-pass` → leave the settings as they are
3. Before clicking Deploy, open **Environment Variables** and add these seven.

| Name | Value |
|---|---|
| `PASS_TYPE_ID` | your ID from Step 3, e.g. `pass.com.zyacoe.diningpass` |
| `TEAM_ID` | your Team ID from Step 2 |
| `SIGNER_CERT` | output of `base64 < signer.pem \| tr -d '\n' \| pbcopy` (it copies to your clipboard, then paste) |
| `SIGNER_KEY` | output of `base64 < signer.key \| tr -d '\n' \| pbcopy` |
| `WWDR_CERT` | output of `base64 < wwdr.pem \| tr -d '\n' \| pbcopy` |
| `CODE_PATTERN` | see Step 7. For now use `^[A-Za-z0-9_-]{4,64}$` |

Run the `base64` commands from inside `~/dining-certs`. Each one copies a long single line of text. Paste one, then run the next.

4. Click **Deploy**. You get a link like `dining-pass.vercel.app`.

## Step 7. Lock the code format (5 min)

Open the site on your iPhone, upload your real screenshot, and look at what it shows after "Code found" (only the last 4 digits show, but count the dots too).

If it's always the same shape, tighten the rule so nothing else can be signed.

- 7 digits → `^\d{7}$`
- 9 digits → `^\d{9}$`
- Letters and numbers, 10 long → `^[A-Za-z0-9]{10}$`

Update it in two places.
1. Vercel → Project → Settings → Environment Variables → `CODE_PATTERN` → then Redeploy
2. `public/index.html`, the line `var CODE_PATTERN = ...` (edit it on GitHub and Vercel redeploys automatically)

## Step 8. Turn on stronger rate limiting (3 min)

The code already limits each device to 10 passes per 10 minutes, but that resets when Vercel restarts the server. For a real limit, go to Vercel → Project → **Firewall** → add a rate-limit rule on path `/api/pass` (e.g. 20 requests per minute per IP).

## Step 9. Test on your phone

1. Open the link in **Safari** on your iPhone (not Chrome, not inside Instagram)
2. Upload your screenshot → tap **Add to Apple Wallet** → tap **Add**
3. Scan it at the dining hall

If the Add screen doesn't show up, the most common cause is a mismatch between `PASS_TYPE_ID` / `TEAM_ID` and the certificate. Check Vercel → Project → Logs for `missing_config` or `sign_error`.

## Optional

- Custom domain, about $10–15/yr, in Vercel → Settings → Domains
- Change the pass look by editing `model.pass/pass.json` (colors, the "Dining Hall" text) and the images in `model.pass/`
- Apple asks that sites use their official "Add to Apple Wallet" badge artwork. You can download it from developer.apple.com/wallet and swap it in for the button before you share the site widely
