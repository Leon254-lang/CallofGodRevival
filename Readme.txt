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
