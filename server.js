'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
const express = require('express');
const nodemailer = require('nodemailer');
const { GridFSBucket, MongoClient, ObjectId } = require('mongodb');

const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SETUP_KEY = process.env.ADMIN_SETUP_KEY || '';
const COOKIE_NAME = IS_PRODUCTION ? '__Host-cgrm_admin' : 'cgrm_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PAGE_SLUGS = [
  'home', 'about', 'visit', 'ministries', 'missions', 'sermons',
  'events', 'location', 'leadership', 'giving', 'prayer', 'contact',
];
const CONTENT_TYPES = ['announcement', 'event', 'sermon', 'ministry', 'leader', 'page-section'];
const SETTING_KEYS = [
  'ministryName', 'brandLogo', 'phone', 'email', 'address', 'serviceTimes',
  'facebookUrl', 'youtubeUrl', 'givingUrl', 'menuLabels',
  'mpesaPaybill', 'mpesaAccount', 'mobilePaybill', 'mobileAccount', 'mobileAccountName',
  'heroTitle', 'heroDescription', 'heroImage', 'pageCopy', 'pageContent',
];
const DEFAULT_SETTINGS = {
  ministryName: 'Call of God Revival Ministry International',
  brandLogo: 'assets/img/393841280_236881819388300_1089566289091516166_n.jpg',
  phone: '+254 726 046000',
  email: 'callofgodrevivalministry@gmail.com',
  address: 'Ugunja-Ukwala Road, Ugunja, Siaya County, Kenya · Postal Code 40606',
  serviceTimes: '8:30 AM & 10:00 AM',
  facebookUrl: 'https://www.facebook.com/p/Call-Of-God-Revival-Ministry-International-100090007431004/',
  youtubeUrl: 'https://www.youtube.com/@CGRM_Ugunja',
  givingUrl: '',
  menuLabels: {},
  mpesaPaybill: '632581',
  mpesaAccount: 'Tithe / Offering / First',
  mobilePaybill: '247247',
  mobileAccount: '589488',
  mobileAccountName: 'Call of God Revival Ministry',
  heroTitle: 'Revival through the Word of God.',
  heroDescription: 'Call of God Revival Ministry International is a church in Ugunja, committed to the Word of God, evangelism, and serving our community through missions.',
  heroImage: 'assets/img/605673610_122272980704086499_7073146479451574358_n.jpg',
  pageCopy: {},
  pageContent: {},
};

const scryptAsync = promisify(crypto.scrypt);
const loginAttempts = new Map();
const app = express();
let client;

if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

let db;
let admins;
let sessions;
let contentItems;
let settingsCollection;
let mediaBucket;
let mailTransport;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireDatabaseConfiguration() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Add your Atlas connection string to the server environment.');
  }
  if (!process.env.MONGODB_DB) {
    throw new Error('MONGODB_DB is required. Set the database name in the server environment.');
  }
  if (IS_PRODUCTION && SETUP_KEY.length < 32) {
    throw new Error('ADMIN_SETUP_KEY must contain at least 32 characters in production.');
  }
}

async function connectDatabase() {
  requireDatabaseConfiguration();
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB);
  admins = db.collection('admin_users');
  sessions = db.collection('admin_sessions');
  contentItems = db.collection('content_items');
  settingsCollection = db.collection('site_settings');
  mediaBucket = new GridFSBucket(db, { bucketName: 'site_media' });

  await Promise.all([
    admins.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    contentItems.createIndex({ status: 1, page: 1, order: 1, updatedAt: -1 }),
    contentItems.createIndex({ status: 1, publishAt: 1 }),
  ]);
}

function sendJsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function ensureHttps(req) {
  if (IS_PRODUCTION && !req.secure) {
    throw new HttpError(400, 'This action requires a secure HTTPS connection.');
  }
}

function ensureSameOrigin(req) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin) {
    throw new HttpError(403, 'The request could not be verified. Reload the website and try again.');
  }

  let requestOrigin;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw new HttpError(403, 'The request could not be verified. Reload the website and try again.');
  }

  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (requestOrigin !== expectedOrigin) {
    throw new HttpError(403, 'The request could not be verified. Reload the website and try again.');
  }
}

function parseCookies(header = '') {
  const cookies = new Map();
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      continue;
    }
  }
  return cookies;
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(first, second) {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setSessionCookie(res, token) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (IS_PRODUCTION) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(res) {
  const attributes = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (IS_PRODUCTION) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

async function issueSession(adminId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  await sessions.insertOne({
    tokenDigest: tokenDigest(token),
    csrfToken,
    adminId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  setSessionCookie(res, token);
  return csrfToken;
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie).get(COOKIE_NAME);
  if (!token || token.length > 200) return null;
  return sessions.findOne({
    tokenDigest: tokenDigest(token),
    expiresAt: { $gt: new Date() },
  });
}

async function requireAdmin(req, res, next) {
  try {
    const session = await getSession(req);
    if (!session) {
      return sendJsonError(res, 401, 'Please sign in again to continue.');
    }
    req.adminSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

function requireCsrf(req, _res, next) {
  try {
    ensureHttps(req);
    ensureSameOrigin(req);
    const supplied = req.get('x-csrf-token') || '';
    if (!req.adminSession || !safeEqual(supplied, req.adminSession.csrfToken)) {
      throw new HttpError(403, 'Your session expired or could not be verified. Reload and try again.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

function limitAttempts(key, limit = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (current && current.expiresAt > now && current.count >= limit) {
    throw new HttpError(429, 'Too many attempts. Wait a little while before trying again.');
  }
  if (!current || current.expiresAt <= now) {
    loginAttempts.set(key, { count: 0, expiresAt: now + windowMs });
  }
}

function recordFailedAttempt(key, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.expiresAt <= now) {
    loginAttempts.set(key, { count: 1, expiresAt: now + windowMs });
  } else {
    current.count += 1;
  }
  if (loginAttempts.size > 5000) {
    for (const [attemptKey, attempt] of loginAttempts) {
      if (attempt.expiresAt <= now) loginAttempts.delete(attemptKey);
    }
  }
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return '';
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeText(value, label, maxLength, { required = false } = {}) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw new HttpError(400, `${label} must be text.`);
  }
  const text = value.trim();
  if (required && !text) throw new HttpError(400, `${label} is required.`);
  if (text.length > maxLength) throw new HttpError(400, `${label} must be ${maxLength} characters or fewer.`);
  return text;
}

function normalizeHttpsUrl(value, label, { optional = true } = {}) {
  const text = normalizeText(value, label, 500);
  if (!text && optional) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new HttpError(400, `${label} must be a valid HTTPS link.`);
  }
  if (parsed.protocol !== 'https:') throw new HttpError(400, `${label} must use HTTPS.`);
  return parsed.href;
}

function normalizePageCopy(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const pageCopy = {};
  for (const slug of PAGE_SLUGS) {
    const page = input[slug];
    if (!page || typeof page !== 'object' || Array.isArray(page)) continue;
    const title = normalizeText(page.title, `${slug} page title`, 140);
    const intro = normalizeText(page.intro, `${slug} page introduction`, 500);
    if (title || intro) pageCopy[slug] = { title, intro };
  }
  return pageCopy;
}

function normalizePageContent(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const pageContent = {};
  const editableGroups = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'eyebrow', 'eventDate']);
  let totalValues = 0;

  for (const slug of PAGE_SLUGS) {
    const page = input[slug];
    if (!page || typeof page !== 'object' || Array.isArray(page)) continue;
    const textsInput = page.texts && typeof page.texts === 'object' && !Array.isArray(page.texts)
      ? page.texts
      : {};
    const texts = {};
    for (const [group, entries] of Object.entries(textsInput)) {
      if (!editableGroups.has(group)) continue;
      if (!Array.isArray(entries) || entries.length > 200) {
        throw new HttpError(400, `The ${slug} page has too many editable text fields.`);
      }
      totalValues += entries.length;
      if (totalValues > 2000) throw new HttpError(400, 'There is too much page content to save at once.');
      texts[group] = entries.map((entry, index) => normalizeText(entry, `${slug} text ${index + 1}`, 1500));
    }

    let images = [];
    if (page.images !== undefined) {
      if (!Array.isArray(page.images) || page.images.length > 200) {
        throw new HttpError(400, `The ${slug} page has too many images.`);
      }
      totalValues += page.images.length;
      if (totalValues > 2000) throw new HttpError(400, 'There is too much page content to save at once.');
      images = page.images.map((image) => normalizeImageRef(image));
    }
    if (Object.keys(texts).length || images.length) pageContent[slug] = { texts, images };
  }
  return pageContent;
}

function normalizeSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Website settings must be an object.');
  }
  const settings = {
    ministryName: normalizeText(input.ministryName, 'Ministry name', 120, { required: true }),
    brandLogo: normalizeImageRef(input.brandLogo),
    phone: normalizeText(input.phone, 'Phone number', 40, { required: true }),
    email: normalizeEmail(input.email),
    address: normalizeText(input.address, 'Address', 240, { required: true }),
    serviceTimes: normalizeText(input.serviceTimes, 'Service times', 120, { required: true }),
    facebookUrl: normalizeHttpsUrl(input.facebookUrl, 'Facebook link'),
    youtubeUrl: normalizeHttpsUrl(input.youtubeUrl, 'YouTube link'),
    givingUrl: normalizeHttpsUrl(input.givingUrl, 'Giving link'),
    menuLabels: normalizeMenuLabels(input.menuLabels),
    mpesaPaybill: normalizeText(input.mpesaPaybill, 'M-PESA PayBill number', 32),
    mpesaAccount: normalizeText(input.mpesaAccount, 'M-PESA account reference', 80),
    mobilePaybill: normalizeText(input.mobilePaybill, 'Mobile money PayBill number', 32),
    mobileAccount: normalizeText(input.mobileAccount, 'Mobile money account number', 32),
    mobileAccountName: normalizeText(input.mobileAccountName, 'Mobile money account name', 120),
    heroTitle: normalizeText(input.heroTitle, 'Homepage headline', 140, { required: true }),
    heroDescription: normalizeText(input.heroDescription, 'Homepage introduction', 500, { required: true }),
    heroImage: normalizeImageRef(input.heroImage),
    pageCopy: normalizePageCopy(input.pageCopy),
    pageContent: normalizePageContent(input.pageContent),
    updatedAt: new Date(),
  };
  if (!settings.email) throw new HttpError(400, 'Enter a valid ministry email address.');
  return settings;
}

function normalizeMenuLabels(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const menuLabels = {};
  for (const [key, label] of Object.entries(input)) {
    if (!['home', 'about', 'visit', 'ministries', 'sermons', 'events', 'more', 'giving'].includes(key)) continue;
    const text = normalizeText(label, 'Menu label', 40);
    if (text) menuLabels[key] = text;
  }
  return menuLabels;
}

function normalizeImageRef(value) {
  const image = normalizeText(value, 'Image', 500);
  if (!image) return '';
  if (/^\/media\/[a-f\d]{24}$/i.test(image)) return image;
  if (/^\/?assets\/img\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(image)) {
    return image;
  }
  return normalizeHttpsUrl(image, 'Image link', { optional: false });
}

function normalizeVideoId(value) {
  const text = normalizeText(value, 'YouTube video', 300);
  if (!text) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, 'Enter an 11-character YouTube video ID or a valid YouTube video link.');
  }
  if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
    throw new HttpError(400, 'YouTube video links must come from youtube.com or youtu.be.');
  }
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new HttpError(400, 'That YouTube link does not contain a valid video ID.');
  }
  return id;
}

function normalizeContentItem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Content must be submitted as a form.');
  }
  const type = input.type;
  if (!CONTENT_TYPES.includes(type)) throw new HttpError(400, 'Choose a supported content type.');
  const page = input.page;
  if (!PAGE_SLUGS.includes(page) && page !== 'all') throw new HttpError(400, 'Choose a website page.');
  const order = Number(input.order || 0);
  if (!Number.isInteger(order) || order < 0 || order > 10000) {
    throw new HttpError(400, 'Display order must be a whole number between 0 and 10000.');
  }
  const status = ['published', 'scheduled'].includes(input.status) ? input.status : 'draft';
  let publishAt = null;
  if (input.publishAt) {
    const parsedPublishAt = new Date(input.publishAt);
    if (!Number.isFinite(parsedPublishAt.getTime())) {
      throw new HttpError(400, 'Choose a valid publication date and time.');
    }
    publishAt = parsedPublishAt;
  }
  if (status === 'scheduled' && (!publishAt || publishAt <= new Date())) {
    throw new HttpError(400, 'Scheduled content must have a future publication date and time.');
  }
  return {
    type,
    page,
    title: normalizeText(input.title, 'Title', 140, { required: true }),
    description: normalizeText(input.description, 'Description', 3000),
    date: normalizeText(input.date, 'Date or schedule', 100),
    location: normalizeText(input.location, 'Location', 180),
    price: normalizeText(input.price, 'Price', 80),
    speaker: normalizeText(input.speaker, 'Speaker', 120),
    series: normalizeText(input.series, 'Series', 120),
    passage: normalizeText(input.passage, 'Bible passage', 120),
    link: normalizeHttpsUrl(input.link, 'Link'),
    videoId: normalizeVideoId(input.videoId),
    transcript: normalizeText(input.transcript, 'Transcript or study notes', 10000),
    studyMaterial: normalizeHttpsUrl(input.studyMaterial, 'Study material link'),
    image: normalizeImageRef(input.image),
    order,
    status,
    publishAt: status === 'scheduled' ? publishAt : null,
    updatedAt: new Date(),
  };
}

function serializeContent(doc) {
  return {
    id: doc._id.toString(),
    type: doc.type,
    page: doc.page,
    title: doc.title,
    description: doc.description,
    date: doc.date,
    location: doc.location,
    price: doc.price,
    speaker: doc.speaker,
    series: doc.series,
    passage: doc.passage,
    link: doc.link,
    videoId: doc.videoId,
    transcript: doc.transcript || '',
    studyMaterial: doc.studyMaterial || '',
    image: doc.image,
    order: doc.order,
    status: doc.status,
    publishAt: doc.publishAt || null,
    updatedAt: doc.updatedAt,
  };
}

function publicSettings(doc) {
  if (!doc) return DEFAULT_SETTINGS;
  const safe = {};
  for (const key of SETTING_KEYS) safe[key] = doc[key] ?? DEFAULT_SETTINGS[key];
  return safe;
}

function sendMailTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    throw new HttpError(503, 'The ministry email service is not configured on this server. Please call or email the ministry directly.');
  }
  if (!mailTransport) {
    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be a valid network port.');
    }
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || '',
      } : undefined,
    });
  }
  return mailTransport;
}

function requestIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function cleanFormInput(body, field, maxLength) {
  const value = body[field];
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').trim().slice(0, maxLength);
}

async function sendWebsiteForm(req, res, kind) {
  ensureHttps(req);
  ensureSameOrigin(req);
  const ipKey = `form:${kind}:${requestIp(req)}`;
  limitAttempts(ipKey, 5, 10 * 60 * 1000);
  recordFailedAttempt(ipKey, 10 * 60 * 1000);
  if (cleanFormInput(req.body, 'website', 500)) {
    return res.status(400).send('The form could not be accepted. Return to the website and try again.');
  }

  const name = cleanFormInput(req.body, 'name', 120);
  const email = normalizeEmail(req.body.email);
  const phone = cleanFormInput(req.body, 'phone', 40);
  const subject = cleanFormInput(req.body, 'subject', 160).replace(/[\r\n]/g, ' ');
  const message = cleanFormInput(req.body, 'message', kind === 'prayer' ? 5000 : 8000);
  const isPrayer = kind === 'prayer';

  if (
    (!isPrayer && (!name || !email || !subject)) ||
    (isPrayer && req.body.consent !== 'yes') ||
    !message ||
    message.length < 2 ||
    (!isPrayer && !email)
  ) {
    return res.status(400).send('Please check the form fields and try again.');
  }

  const mailSubject = isPrayer ? 'Prayer request from the church website' : 'Website contact message';
  const body = isPrayer
    ? `A prayer request was submitted through the church website.\n\nName: ${name || 'Not provided'}\nEmail: ${email || 'Not provided'}\nPhone: ${phone || 'Not provided'}\n\nPrayer request:\n${message}\n`
    : `A message was submitted through the church website.\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}\n`;

  try {
    await sendMailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: 'callofgodrevivalministry@gmail.com',
      replyTo: email || undefined,
      subject: mailSubject,
      text: body,
    });
  } catch (error) {
    console.error('Website form email delivery failed:', error);
    throw new HttpError(503, 'The email service could not accept your message. The website did not save it. Please call +254 726 046000 or email the ministry directly.');
  }

  clearAttempts(ipKey);
  const location = isPrayer
    ? '/starter-page.html?prayer=sent#prayer-request-form'
    : '/contact.html?message=sent#contact';
  res.redirect(303, location);
}

const ADMIN_CSP = "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'";
const PUBLIC_CSP = "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; font-src 'self' data:; media-src 'self';";

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  if (IS_PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', ADMIN_CSP);
  } else {
    res.setHeader('Content-Security-Policy', PUBLIC_CSP);
  }
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/admin/state', asyncRoute(async (req, res) => {
  const [adminCount, setupState, session] = await Promise.all([
    admins.countDocuments({}, { limit: 1 }),
    db.collection('admin_setup').findOne({ _id: 'first-admin' }),
    getSession(req),
  ]);
  res.json({
    setupAvailable: adminCount === 0 && !setupState && SETUP_KEY.length >= 32,
    configured: adminCount > 0,
    authenticated: Boolean(session),
    adminId: session?.adminId?.toString() || '',
    csrfToken: session?.csrfToken || '',
  });
}));

app.post('/api/admin/setup', asyncRoute(async (req, res) => {
  ensureHttps(req);
  ensureSameOrigin(req);
  if (SETUP_KEY.length < 32) throw new HttpError(503, 'Secure first-admin setup is not enabled. Configure ADMIN_SETUP_KEY on the server.');
  const ipKey = `setup:${requestIp(req)}`;
  limitAttempts(ipKey, 5);
  if (await db.collection('admin_setup').findOne({ _id: 'first-admin' })) {
    throw new HttpError(409, 'Admin setup has already been completed.');
  }
  if (!safeEqual(typeof req.body.setupKey === 'string' ? req.body.setupKey : '', SETUP_KEY)) {
    recordFailedAttempt(ipKey);
    throw new HttpError(403, 'The setup key is not valid.');
  }

  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email) throw new HttpError(400, 'Enter a valid admin email address.');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    throw new HttpError(400, `Choose a password between ${PASSWORD_MIN_LENGTH} and 128 characters.`);
  }

  const salt = crypto.randomBytes(16);
  const passwordHash = await scryptAsync(password, salt, 64);
  const dbSession = client.startSession();
  let adminId;
  try {
    await dbSession.withTransaction(async () => {
      if (await admins.countDocuments({}, { session: dbSession, limit: 1 }) > 0) {
        throw new HttpError(409, 'Admin setup has already been completed.');
      }
      await db.collection('admin_setup').updateOne(
        { _id: 'first-admin' },
        { $set: { completedAt: new Date(), email } },
        { upsert: true, session: dbSession },
      );
      const result = await admins.insertOne({
        email,
        passwordSalt: salt.toString('hex'),
        passwordHash: Buffer.from(passwordHash).toString('hex'),
        createdAt: new Date(),
      }, { session: dbSession });
      adminId = result.insertedId;
    });
  } finally {
    await dbSession.endSession();
  }

  clearAttempts(ipKey);
  const csrfToken = await issueSession(adminId, res);
  res.status(201).json({ authenticated: true, adminId: adminId.toString(), csrfToken });
}));

app.post('/api/admin/login', asyncRoute(async (req, res) => {
  ensureHttps(req);
  ensureSameOrigin(req);
  const key = `login:${requestIp(req)}`;
  limitAttempts(key, 8);

  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const admin = email ? await admins.findOne({ email }) : null;
  const salt = admin ? Buffer.from(admin.passwordSalt, 'hex') : Buffer.alloc(16, 0);
  const expected = admin ? Buffer.from(admin.passwordHash, 'hex') : Buffer.alloc(64, 0);
  const actual = Buffer.from(await scryptAsync(password.slice(0, 128), salt, 64));
  if (!admin || !safeEqual(actual, expected)) {
    recordFailedAttempt(key);
    return sendJsonError(res, 401, 'Email or password is not correct.');
  }

  clearAttempts(key);
  const csrfToken = await issueSession(admin._id, res);
  res.json({ authenticated: true, adminId: admin._id.toString(), csrfToken });
}));

app.get('/api/admin/accounts', requireAdmin, asyncRoute(async (_req, res) => {
  const accounts = await admins.find({}, { projection: { email: 1, createdAt: 1 } }).sort({ createdAt: 1 }).toArray();
  res.json({
    accounts: accounts.map((account) => ({
      id: account._id.toString(),
      email: account.email,
      createdAt: account.createdAt,
    })),
  });
}));

app.post('/api/admin/accounts', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email) throw new HttpError(400, 'Enter a valid admin email address.');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    throw new HttpError(400, `Choose a password between ${PASSWORD_MIN_LENGTH} and 128 characters.`);
  }

  const salt = crypto.randomBytes(16);
  const passwordHash = await scryptAsync(password, salt, 64);
  const result = await admins.insertOne({
    email,
    passwordSalt: salt.toString('hex'),
    passwordHash: Buffer.from(passwordHash).toString('hex'),
    createdAt: new Date(),
  });
  res.status(201).json({
    account: { id: result.insertedId.toString(), email, createdAt: new Date() },
  });
}));

app.delete('/api/admin/accounts/:id', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(400, 'That admin account could not be found.');
  const accountId = new ObjectId(req.params.id);
  if (accountId.equals(req.adminSession.adminId)) {
    throw new HttpError(400, 'You cannot remove the admin account you are currently using.');
  }
  const dbSession = client.startSession();
  try {
    await dbSession.withTransaction(async () => {
      if (await admins.countDocuments({}, { limit: 2, session: dbSession }) <= 1) {
        throw new HttpError(400, 'The last admin account cannot be removed.');
      }
      const result = await admins.deleteOne({ _id: accountId }, { session: dbSession });
      if (result.deletedCount !== 1) throw new HttpError(404, 'That admin account could not be found.');
      await sessions.deleteMany({ adminId: accountId }, { session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }
  res.status(204).end();
}));

app.post('/api/admin/logout', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  await sessions.deleteOne({ _id: req.adminSession._id });
  clearSessionCookie(res);
  res.json({ authenticated: false });
}));

app.get('/api/admin/settings', requireAdmin, asyncRoute(async (_req, res) => {
  const doc = await settingsCollection.findOne({ _id: 'main' });
  res.json({ settings: publicSettings(doc) });
}));

app.put('/api/admin/settings', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const settings = normalizeSettings(req.body);
  await settingsCollection.updateOne(
    { _id: 'main' },
    { $set: settings, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  res.json({ settings: publicSettings(settings) });
}));

app.get('/api/admin/content', requireAdmin, asyncRoute(async (_req, res) => {
  const docs = await contentItems.find({}).sort({ updatedAt: -1 }).limit(200).toArray();
  res.json({ items: docs.map(serializeContent) });
}));

app.get('/api/admin/reports', requireAdmin, asyncRoute(async (_req, res) => {
  const [total, byStatus, byType, nextEvents, settingsDoc, latest] = await Promise.all([
    contentItems.countDocuments({}),
    contentItems.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    contentItems.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).toArray(),
    contentItems.find({ type: 'event', status: { $in: ['published', 'scheduled'] } })
      .sort({ publishAt: 1, updatedAt: -1 }).limit(10).toArray(),
    settingsCollection.findOne({ _id: 'main' }, { projection: { updatedAt: 1 } }),
    contentItems.find({}).sort({ updatedAt: -1 }).limit(1).next(),
  ]);
  res.json({
    total,
    byStatus: Object.fromEntries(byStatus.map((entry) => [entry._id || 'draft', entry.count])),
    byType: Object.fromEntries(byType.map((entry) => [entry._id || 'other', entry.count])),
    nextEvents: nextEvents.map(serializeContent),
    lastUpdatedAt: [latest?.updatedAt, settingsDoc?.updatedAt].filter(Boolean).sort().at(-1) || null,
    analyticsAvailable: false,
  });
}));

app.get('/api/admin/backup', requireAdmin, asyncRoute(async (_req, res) => {
  const [settingsDoc, docs] = await Promise.all([
    settingsCollection.findOne({ _id: 'main' }),
    contentItems.find({}).sort({ createdAt: 1 }).toArray(),
  ]);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cgrm-website-backup.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    settings: publicSettings(settingsDoc),
    items: docs.map(serializeContent),
  });
}));

app.post('/api/admin/content', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const item = normalizeContentItem(req.body);
  item.createdAt = new Date();
  const result = await contentItems.insertOne(item);
  res.status(201).json({ item: serializeContent({ ...item, _id: result.insertedId }) });
}));

app.put('/api/admin/content/:id', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(400, 'That content item could not be found.');
  const item = normalizeContentItem(req.body);
  const result = await contentItems.findOneAndUpdate(
    { _id: new ObjectId(req.params.id) },
    { $set: item },
    { returnDocument: 'after' },
  );
  if (!result) throw new HttpError(404, 'That content item could not be found.');
  res.json({ item: serializeContent(result) });
}));

app.delete('/api/admin/content/:id', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(400, 'That content item could not be found.');
  const result = await contentItems.deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount !== 1) throw new HttpError(404, 'That content item could not be found.');
  res.status(204).end();
}));

app.post(
  '/api/admin/media',
  requireAdmin,
  requireCsrf,
  (req, _res, next) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.get('content-type')?.split(';')[0].trim())) {
      return next(new HttpError(415, 'Upload a JPEG, PNG, or WebP image.'));
    }
    next();
  },
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }),
  asyncRoute(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Choose an image to upload.');
    const type = req.get('content-type').split(';')[0].trim();
    const isJpeg = type === 'image/jpeg' && req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff;
    const isPng = type === 'image/png' && req.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = type === 'image/webp' &&
      req.body.toString('ascii', 0, 4) === 'RIFF' &&
      req.body.toString('ascii', 8, 12) === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) throw new HttpError(415, 'The selected file is not a valid JPEG, PNG, or WebP image.');

    const extension = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
    const upload = mediaBucket.openUploadStream(
      `${crypto.randomUUID()}.${extension}`,
      { contentType: type, metadata: { uploadedAt: new Date(), uploadedBy: req.adminSession.adminId } },
    );
    const fileId = upload.id;
    await new Promise((resolve, reject) => {
      upload.once('error', reject);
      upload.once('finish', resolve);
      upload.end(req.body);
    });
    res.status(201).json({ image: `/media/${fileId.toString()}` });
  }),
);

app.get('/media/:id', asyncRoute(async (req, res, next) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Image not found.');
  const id = new ObjectId(req.params.id);
  const file = await mediaBucket.find({ _id: id }).next();
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.contentType)) {
    throw new HttpError(404, 'Image not found.');
  }
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = mediaBucket.openDownloadStream(id);
  stream.on('error', next);
  stream.pipe(res);
}));

app.get('/api/public/bootstrap', asyncRoute(async (req, res) => {
  const page = typeof req.query.page === 'string' && PAGE_SLUGS.includes(req.query.page)
    ? req.query.page
    : 'home';
  const [settingsDoc, items] = await Promise.all([
    settingsCollection.findOne({ _id: 'main' }),
    contentItems.find({
      page: { $in: [page, 'all'] },
      $or: [
        { status: 'published' },
        { status: 'scheduled', publishAt: { $lte: new Date() } },
      ],
    })
      .sort({ order: 1, updatedAt: -1 })
      .limit(50)
      .toArray(),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    settings: publicSettings(settingsDoc),
    items: items.map(serializeContent),
  });
}));

app.post('/forms/contact.php', asyncRoute(async (req, res) => sendWebsiteForm(req, res, 'contact')));
app.post('/forms/prayer.php', asyncRoute(async (req, res) => sendWebsiteForm(req, res, 'prayer')));
app.all('/forms/:name.php', (_req, res) => sendJsonError(res, 404, 'That form endpoint is not available.'));

app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.use('/admin', express.static(path.join(ROOT, 'admin'), { dotfiles: 'deny', index: false }));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { dotfiles: 'deny', index: false }));

const publicPages = new Set([
  'index.html', 'about.html', 'visit.html', 'courses.html', 'course-details.html',
  'sermons.html', 'events.html', 'location.html', 'trainers.html', 'pricing.html',
  'starter-page.html', 'contact.html',
]);
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/:page', (req, res, next) => {
  if (!publicPages.has(req.params.page)) return next();
  res.sendFile(path.join(ROOT, req.params.page));
});

app.use((req, res) => {
  if (req.path.endsWith('.php')) return sendJsonError(res, 404, 'That form endpoint is not available.');
  res.status(404).send('Page not found.');
});

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) return sendJsonError(res, error.status, error.message);
  if (error?.type === 'entity.too.large') return sendJsonError(res, 413, 'The uploaded file or form is too large.');
  if (error?.name === 'MongoServerError' && error.code === 11000) {
    return sendJsonError(res, 409, 'That admin account already exists or setup has already been completed.');
  }
  console.error('Website request failed:', error);
  if (res.headersSent) return res.end();
  sendJsonError(res, 500, 'The request could not be completed. Please try again or contact the ministry.');
});

async function start() {
  await connectDatabase();
  const server = app.listen(PORT, () => {
    console.log(`Church website listening on port ${PORT}.`);
    console.log(`Admin page: ${IS_PRODUCTION ? 'https' : 'http'}://localhost:${PORT}/admin`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Website startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  normalizeContentItem,
  normalizeSettings,
  normalizeVideoId,
};
