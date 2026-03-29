HVAC Fleet Deployment Guide for swordfishconsultingin.com

Goal
- Run HVAC Fleet at fleet.swordfishconsultingin.com.
- Keep your main site on GoDaddy.
- Add a new navigation tab that opens the Fleet app.

What is already prepared in this repo
- Express now serves the built React app from dist in production.
- Start command is node server.js.
- Railway config is included in railway.json.
- API health endpoint is available at /api/health.

Step 1: Push this repo to GitHub
1. Create a GitHub repo if needed.
2. Push your local hvac-fleet code.

Step 2: Create Railway project
1. Sign in to Railway.
2. New Project > Deploy from GitHub Repo.
3. Select your hvac-fleet repo.
4. Railway will detect package.json and railway.json.

Step 3: Configure environment variables in Railway
Set these variables in Railway service settings.

Required
- NODE_ENV = production

Optional for SMS
- TWILIO_SID = your value
- TWILIO_TOKEN = your value
- TWILIO_PHONE = your value
- TO_PHONE = your dispatcher phone

Optional for custom CORS list
- CORS_ORIGINS = https://fleet.swordfishconsultingin.com,https://www.swordfishconsultingin.com,https://swordfishconsultingin.com

Notes
- Do not set PORT manually on Railway unless specifically needed.
- Railway injects PORT automatically.

Step 4: Verify Railway default domain first
1. Open your Railway generated URL.
2. Confirm app loads.
3. Confirm /api/health returns ok true.

Step 5: Add GoDaddy DNS record
In GoDaddy DNS for swordfishconsultingin.com:
1. Add record type CNAME.
2. Name: fleet
3. Value: your Railway target hostname (from Railway custom domain panel).
4. TTL: 1 hour (or default).

If Railway gives an A record target instead, use A record as instructed by Railway.

Step 6: Attach custom domain in Railway
1. In Railway service, go to Settings > Domains.
2. Add custom domain fleet.swordfishconsultingin.com.
3. Railway shows verification status.
4. Wait until SSL certificate is issued and status is Active.

Step 7: Add your new tab on main website
In your GoDaddy-hosted site navigation:
1. Add menu item label: HVAC Fleet.
2. URL: https://fleet.swordfishconsultingin.com
3. Set open in new tab if desired.

Step 8: Final validation checklist
- https://fleet.swordfishconsultingin.com opens successfully.
- Refresh on deep app pages still works.
- Manager, Owner, Technician views load.
- Contact form submissions create queue jobs.
- If Twilio configured, SMS sends.
- No CORS errors in browser console.

Troubleshooting
- 404 on refresh:
  The Express static fallback is already configured. Redeploy and retest.

- CORS blocked:
  Add your exact origin to CORS_ORIGINS and redeploy.

- Domain not resolving:
  DNS propagation can take minutes to 24 hours.

- SSL pending:
  Usually DNS is not yet fully propagated; wait and retry.

Quick commands for local verification before deploy
- npm ci
- npm run build
- npm run start
- Open http://localhost:3002 and verify app and API health.
