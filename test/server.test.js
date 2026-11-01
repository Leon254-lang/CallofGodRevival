'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, normalizeContentItem, normalizeSettings, normalizeVideoId } = require('../server');

test('normalizes content fields and keeps text as plain strings', () => {
  const item = normalizeContentItem({
    type: 'event',
    page: 'events',
    title: 'Sunday gathering',
    description: '<script>alert(1)</script>',
    date: 'Sunday at 10:00 AM',
    location: 'Ugunja',
    price: 'Free',
    speaker: '',
    series: '',
    passage: '',
    link: 'https://example.org/event',
    videoId: '',
    image: '',
    order: 2,
    status: 'published',
  });

  assert.equal(item.title, 'Sunday gathering');
  assert.equal(item.description, '<script>alert(1)</script>');
  assert.equal(item.price, 'Free');
  assert.equal(item.status, 'published');
  assert.equal(item.order, 2);
});

test('rejects invalid page names and unsafe content links', () => {
  const valid = {
    type: 'announcement',
    page: 'home',
    title: 'Service update',
    link: 'javascript:alert(1)',
  };
  assert.throws(() => normalizeContentItem(valid), /HTTPS/);
  assert.throws(() => normalizeContentItem({ ...valid, page: 'not-a-page', link: '' }), /website page/);
});

test('normalizes YouTube URLs to validated video IDs', () => {
  assert.equal(normalizeVideoId('https://www.youtube.com/watch?v=AbCdEf_1234'), 'AbCdEf_1234');
  assert.equal(normalizeVideoId('https://youtu.be/AbCdEf_1234'), 'AbCdEf_1234');
  assert.throws(() => normalizeVideoId('https://example.org/watch?v=AbCdEf_1234'), /youtube.com or youtu.be/);
  assert.throws(() => normalizeVideoId('short'), /11-character/);
});

test('validates website settings and limits editable page copy', () => {
  const settings = normalizeSettings({
    ministryName: 'Call of God Revival Ministry International',
    phone: '+254 726 046000',
    email: 'callofgodrevivalministry@gmail.com',
    address: 'Ugunja, Kenya',
    serviceTimes: '8:30 AM & 10:00 AM',
    facebookUrl: 'https://facebook.com/example',
    youtubeUrl: 'https://youtube.com/@example',
    heroTitle: 'Welcome',
    heroDescription: 'Join us in Ugunja.',
    heroImage: 'assets/img/church.jpg',
    pageCopy: { events: { title: 'Gather with us', intro: 'See what is happening.' } },
  });

  assert.equal(settings.pageCopy.events.title, 'Gather with us');
  assert.equal(settings.heroImage, 'assets/img/church.jpg');
  assert.throws(() => normalizeSettings({
    ministryName: 'Church',
    phone: '+254',
    email: 'not-an-email',
    address: 'Ugunja',
    serviceTimes: 'Sunday',
    heroTitle: 'Welcome',
    heroDescription: 'Join us.',
    heroImage: '',
  }), /valid ministry email/);
});

test('serves the admin portal without exposing server source files', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const [adminResponse, sourceResponse, formResponse] = await Promise.all([
    fetch(`${baseUrl}/admin`),
    fetch(`${baseUrl}/server.js`),
    fetch(`${baseUrl}/forms/prayer.php`),
  ]);
  const adminHtml = await adminResponse.text();
  const sourceBody = await sourceResponse.text();
  const formBody = await formResponse.text();

  assert.equal(adminResponse.status, 200);
  assert.match(adminHtml, /Manage your website/);
  assert.equal(adminResponse.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
  assert.equal(sourceResponse.status, 404);
  assert.doesNotMatch(sourceBody, /MONGODB_URI|passwordHash/);
  assert.equal(formResponse.status, 404);
  assert.doesNotMatch(formBody, /function cgrm|SMTP_PASS/);
});
