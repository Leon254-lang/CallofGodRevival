Call of God Revival Ministry International

Church website for the ministry in Ugunja, Siaya County, Kenya.

The site includes information about the church, ministries, Sunday services,
revival meetings, leadership, community missions, giving, prayer, and contact.

Website admin
-------------

The admin portal is available at /admin when the Node.js application is running.
It can manage shared church details, page headings and introductions, edit plain
text and replace photos in existing pages, and add or remove announcements,
events, sermons, ministries, leaders, and page sections. The page layouts remain
fixed; new content is added to the selected page.

Administrators can also manage additional full-access admin accounts, preview
content before saving, publish drafts or schedule content, and export settings
and content as JSON. Scheduled items become public when their scheduled time is
reached and the public site next requests content. Giving links must use an
external HTTPS provider; the site does not collect payment details. Sermons can
embed YouTube videos and include transcript/study notes and external study
material links.

Live streaming
--------------

In /admin under Church details, configure the weekly schedule as comma-separated
weekday and 24-hour local times (for example, "Sunday 08:30, Sunday 10:00") and
set the IANA time zone (default: Africa/Nairobi). The homepage calculates and
displays the next service in that time zone. Set the streaming channel link, or
leave it blank to use the configured YouTube channel.

The Live broadcast tab captures the church's camera and microphone in the
browser, sends audio/video using LiveKit WebRTC, and gives public viewers
subscribe-only access. Only signed-in website administrators can start or stop
a broadcast. Viewers can use real-time Socket.IO chat and see the live viewer
count. Chat messages are kept in memory only for the current broadcast.

For an external YouTube broadcast, set the YouTube live/watch/embed URL and
select "The external YouTube stream is live" under Admin > Church details. The
site uses YouTube's privacy-enhanced embed player and the existing channel link
as a fallback. Clear the checkbox when the stream ends. YouTube channel live
embeds require the channel's UC… ID; a direct live-video URL is also supported.

Bible and church assistant
--------------------------

Set OPENAI_API_KEY in the Node host's private environment to enable the chat
assistant. OPENAI_MODEL is optional and defaults to gpt-4.1-mini. The chat
widget appears across the public website. It sends a visitor's current
conversation to OpenAI and uses relevant published church content and public
church settings as context. Conversation history is kept only in the visitor's
browser memory and is not saved by this site. Do not enter private information
in the chat. The assistant cites KJV references when confident, but AI answers
can be wrong and should be checked against Scripture and the church.

The assistant requires an OpenAI API account with API access and billing
enabled. If the key is missing or the provider is unavailable, the widget shows
an error instead of returning an invented answer.

Deployment configuration
------------------------

1. Create a LiveKit Cloud project and set LIVEKIT_URL, LIVEKIT_API_KEY, and
   LIVEKIT_API_SECRET in the Node host's private environment. Never put these
   credentials in browser code or commit them.
2. Configure a private S3-compatible bucket and a least-privilege upload user.
   Set RECORDING_S3_BUCKET, RECORDING_S3_REGION, RECORDING_S3_ACCESS_KEY, and
   RECORDING_S3_SECRET_KEY. Set RECORDING_S3_ENDPOINT for non-AWS providers;
   enable RECORDING_S3_FORCE_PATH_STYLE when required by that provider. LiveKit
   Egress writes an MP4 under cgrm-recordings/ for each broadcast. The admin
   dashboard shows the recording object key and upload state. Keep the bucket
   private; access to recordings follows the bucket's IAM and retention policy.
3. Set PUBLIC_BASE_URL to the site's HTTPS origin. Set
   LIVE_NOTIFICATION_SECRET to a private random value of at least 32
   characters. Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
   SMTP_PASS, and SMTP_FROM. Viewers subscribe using a double-opt-in email
   link; live alert emails include an unsubscribe link.
4. Ensure the Node host/reverse proxy permits WebSocket upgrades for the
   same-origin Socket.IO connection and supports long-lived requests. Use HTTPS
   so the broadcaster can grant camera and microphone permissions.
5. Run npm install and npm start. The start script bundles the LiveKit browser
   clients locally before launching the server.

To test, sign in at /admin and open Live broadcast. Click Start live broadcast
and allow camera/microphone access; open the homepage in another browser to
check the stream, viewer count, and chat. Stop the broadcast and confirm the
MP4 object appears in the configured bucket. Submit the homepage email alert
form, confirm the address from the email, start another broadcast to verify
notification delivery, and use the unsubscribe link to opt out. Local status,
chat, and email workflows require the configured MongoDB, LiveKit, S3, and SMTP
services. Viewer counts and chat are held by the single Node process; use a
Socket.IO shared adapter before running multiple app instances.

Contact and prayer submissions continue to be emailed only and are not retained
in the website database. The reports show content counts, not traffic analytics
or sign-up counts. The JSON export does not include uploaded images; database
backups must include the GridFS media collections described below. All admin
accounts currently have the same full administrator access.

Deployment
----------

1. Use a persistent Node.js host with Node.js 20 or newer and HTTPS.
2. Create a MongoDB Atlas database user with access only to the website database,
   and allow the app host to connect in the Atlas network access settings.
3. Configure the variables shown in .env.example in the host's private
   environment settings. Do not commit .env or send credentials in chat.
   ADMIN_SETUP_KEY must be a private random value with at least 32 characters.
4. Install dependencies with npm install and start the application with npm start.
   The Node process serves the public pages and admin APIs from the same origin.
5. Visit /admin and use the setup key to create the first admin. Setup closes
   after that account is created. Keep the setup key private.
6. Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and
   SMTP_FROM for the contact and prayer forms. Those messages are not saved by
   the website; a delivery failure is reported to the visitor.

Uploaded JPEG, PNG, and WebP files are kept in MongoDB Atlas GridFS. Back up the
website database, including the site_media.files and site_media.chunks
collections. This app expects a long-running Node.js server rather than
ephemeral serverless storage.
