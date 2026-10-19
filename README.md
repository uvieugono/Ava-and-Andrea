# GymTrack

GymTrack is a gymnastics training app. Uploaded videos and documents are stored in one Google Drive folder when `GYMTRACK_DRIVE_FOLDER_ID` is set. GymTrack serves each file itself, after checking who is asking.

The production folder `1YwIkSA6-1DZb19r-WMCEQZyd2T4W0oUW` is in the personal Google account `uvie.ugono@gmail.com` (not a Workspace Shared Drive). A service account has no Drive storage of its own, so uploads as `drive-reader@solyntaflow.iam.gserviceaccount.com` fail with `storageQuotaExceeded`. GymTrack therefore uploads **as that Google account**, using a one-time OAuth sign-in and a long-lived refresh token. Files count against his Drive quota.

## Why the full Drive scope

The refresh token is requested for `https://www.googleapis.com/auth/drive`.

`https://www.googleapis.com/auth/drive.file` only covers files the app created, or files the user opened with the Google Picker. The GymTrack folder already exists, and the app only knows it by its id, so Drive rejects an upload into that folder under `drive.file`. The full `drive` scope is the narrowest scope that can see it. It can read and change the whole of that Google account's Drive. Keep the refresh token private.

## What stays private

GymTrack never adds a sharing permission on an uploaded file. A skill-evidence video stays private to the Drive account, and only its owner and their club can open it through GymTrack. A public Connect video is public only through GymTrack's own access check (the same behaviour as before). It is not given an anyone-with-the-link Drive permission.

## One-time sign-in

Do this once, on a computer you control, while signed in to Google as **uvie.ugono@gmail.com**. Publish the consent screen before you run the command. A refresh token issued while the app is still in Testing expires after 7 days.

1. Open GCP project [solyntaflow](https://console.cloud.google.com/welcome?project=solyntaflow). Enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=solyntaflow) if it is not already enabled.
2. Open [Google Auth platform → Branding](https://console.cloud.google.com/auth/branding?project=solyntaflow) (the OAuth consent screen). Sign in as `uvie.ugono@gmail.com`, so that address can be selected. Set the app name to GymTrack, and set the user support email and the developer contact to `uvie.ugono@gmail.com`. If the page asks for a homepage and a privacy policy before it will save, use pages you control. You do not need to submit the app for verification.
3. Open [Data Access](https://console.cloud.google.com/auth/scopes?project=solyntaflow) and add the scope `https://www.googleapis.com/auth/drive` ("See, edit, create, and delete all of your Google Drive files").
4. Open [Audience](https://console.cloud.google.com/auth/audience?project=solyntaflow). Choose **External**. Click **Publish app** so the publishing status is **In production**. Leave the app unverified. Verification is not required for this single user. While the status is Testing, refresh tokens expire after 7 days.
5. Open [Clients](https://console.cloud.google.com/auth/clients?project=solyntaflow) and create an OAuth client of type **Desktop app** (not Web application). Name it `GymTrack Drive`. Copy the client id and client secret.
6. In this repo, put those two values in `.env` (that file is gitignored):

   ```
   GOOGLE_OAUTH_CLIENT_ID=your-client-id
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   GOOGLE_OAUTH_LOGIN_HINT=uvie.ugono@gmail.com
   ```

   `GOOGLE_OAUTH_LOGIN_HINT` is optional. It only tells the account chooser which address to offer. It is not a Cloud Run setting.
7. From the repo root, run `npm run drive:auth`. The command prints a consent URL and listens on `http://127.0.0.1` with a one-off port. A Desktop client accepts that loopback address; you do not register the port.
8. Open the URL if the browser does not. Sign in as **uvie.ugono@gmail.com** and no other account. Google shows an unverified-app warning because the Drive scope is restricted and the app is unverified. Choose **Advanced**, then continue to GymTrack, and allow access.
9. The command writes `.drive-oauth.json` (mode `0600`) and prints a warning. The file contains `GOOGLE_OAUTH_REFRESH_TOKEN`. It is listed in `.gitignore`. Do not commit it, paste it into chat, or email it.

If Google does not return a refresh token, open [Google account permissions](https://myaccount.google.com/permissions), remove GymTrack's access, and run `npm run drive:auth` again.

## Cloud Run

Service `gymtrack`, project `solyntaflow`, region `us-central1`. Set these four names:

| Name | Kind | Value |
| --- | --- | --- |
| `GYMTRACK_DRIVE_FOLDER_ID` | environment variable | `1YwIkSA6-1DZb19r-WMCEQZyd2T4W0oUW` |
| `GOOGLE_OAUTH_CLIENT_ID` | secret | Desktop client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | secret | Desktop client secret |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | secret | value written to `.drive-oauth.json` |

OAuth is used only when all three `GOOGLE_OAUTH_*` values are set. If they are all absent, GymTrack falls back to `GOOGLE_SERVICE_ACCOUNT_JSON` or the Cloud Run runtime service account. Leave `GOOGLE_SERVICE_ACCOUNT_JSON` unset for this folder. A half-set OAuth configuration refuses to start, rather than silently using the service account.

```bash
PROJECT=solyntaflow
REGION=us-central1
SERVICE=gymtrack

printf '%s' 'YOUR_CLIENT_ID' | gcloud secrets create GOOGLE_OAUTH_CLIENT_ID --project="$PROJECT" --data-file=-
printf '%s' 'YOUR_CLIENT_SECRET' | gcloud secrets create GOOGLE_OAUTH_CLIENT_SECRET --project="$PROJECT" --data-file=-
printf '%s' 'YOUR_REFRESH_TOKEN' | gcloud secrets create GOOGLE_OAUTH_REFRESH_TOKEN --project="$PROJECT" --data-file=-

RUNTIME=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')
if [ -z "$RUNTIME" ]; then
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
  RUNTIME="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
for NAME in GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REFRESH_TOKEN; do
  gcloud secrets add-iam-policy-binding "$NAME" --project="$PROJECT" \
    --member="serviceAccount:${RUNTIME}" --role="roles/secretmanager.secretAccessor"
done

gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --update-env-vars="GYMTRACK_DRIVE_FOLDER_ID=1YwIkSA6-1DZb19r-WMCEQZyd2T4W0oUW" \
  --update-secrets="GOOGLE_OAUTH_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID:latest,GOOGLE_OAUTH_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET:latest,GOOGLE_OAUTH_REFRESH_TOKEN=GOOGLE_OAUTH_REFRESH_TOKEN:latest"
```

If a secret already exists, add a new version with `gcloud secrets versions add NAME --project=solyntaflow --data-file=-` instead of `create`. To replace a revoked refresh token, add a new version of `GOOGLE_OAUTH_REFRESH_TOKEN` and deploy a new revision (updating the secret to `:latest` does that).

The runtime service account does not need access to the Drive folder. Uploads run as the Google account that signed in.

## When sign-in stops working

A revoked, expired, or mismatched refresh token fails the upload with `DRIVE_AUTH`. The gymnast sees "Google Drive sign-in needs to be renewed before files can be saved. Please tell the GymTrack team." The server log says to run `npm run drive:auth` again and update `GOOGLE_OAUTH_REFRESH_TOKEN`.

A refresh token also stops working if it is unused for six months, or if so many new tokens are issued for this client that Google drops the oldest one. Run the sign-in once and keep that token.

If the personal Drive is full, uploads fail with `DRIVE_QUOTA`.

## Local development

Leave `GYMTRACK_DRIVE_FOLDER_ID` unset to keep uploads on disk under `GYMTRACK_UPLOADS` (default `data/uploads`). That disk is wiped on Cloud Run, which is why production uses Drive.
