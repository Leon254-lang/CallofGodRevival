'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  normalizeBibleSearchQuery,
  normalizeContentItem,
  normalizeSettings,
  normalizeVideoId,
  normalizeYouTubeEmbedUrl,
  apiBibleProviderError,
} = require('../server');
const { getNextService } = require('../assets/js/live-schedule');

test('finds the next weekly service when today’s scheduled services have passed', () => {
  const now = new Date('2026-11-15T07:12:00.000Z');
  const next = getNextService('Sunday 08:30, Sunday 10:00', 'Africa/Nairobi', now);
  assert.equal(next.toISOString(), '2026-11-22T05:30:00.000Z');
});

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

test('validates scheduled content and transcript fields', () => {
  const publishAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const item = normalizeContentItem({
    type: 'sermon',
    page: 'sermons',
    title: 'Sunday message',
    status: 'scheduled',
    publishAt,
    transcript: 'Study notes for the message.',
    studyMaterial: 'https://example.org/study-notes',
  });

  assert.equal(item.status, 'scheduled');
  assert.equal(item.publishAt.toISOString(), publishAt);
  assert.equal(item.transcript, 'Study notes for the message.');
  assert.equal(item.studyMaterial, 'https://example.org/study-notes');
  assert.throws(() => normalizeContentItem({
    type: 'event',
    page: 'events',
    title: 'Past event',
    status: 'scheduled',
    publishAt: new Date(Date.now() - 60 * 1000).toISOString(),
  }), /future publication/);
});

test('normalizes YouTube URLs to validated video IDs', () => {
  assert.equal(normalizeVideoId('https://www.youtube.com/watch?v=AbCdEf_1234'), 'AbCdEf_1234');
  assert.equal(normalizeVideoId('https://youtu.be/AbCdEf_1234'), 'AbCdEf_1234');
  assert.throws(() => normalizeVideoId('https://example.org/watch?v=AbCdEf_1234'), /youtube.com or youtu.be/);
  assert.throws(() => normalizeVideoId('short'), /11-character/);
});

test('normalizes YouTube live URLs to privacy-enhanced embeds', () => {
  assert.equal(
    normalizeYouTubeEmbedUrl('https://www.youtube.com/live/AbCdEf_1234'),
    'https://www.youtube-nocookie.com/embed/AbCdEf_1234',
  );
  assert.equal(
    normalizeYouTubeEmbedUrl('https://www.youtube.com/embed/live_stream?channel=UC1234567890123456789012'),
    'https://www.youtube-nocookie.com/embed/live_stream?channel=UC1234567890123456789012',
  );
  assert.equal(normalizeYouTubeEmbedUrl(''), '');
  assert.throws(() => normalizeYouTubeEmbedUrl('https://example.org/live/AbCdEf_1234'), /YouTube URL/);
});

test('normalizes KJV keyword searches and passage references', () => {
  assert.equal(normalizeBibleSearchQuery('What does the Bible say about faith?'), 'faith');
  assert.equal(normalizeBibleSearchQuery('John 3:16'), 'John 3:16');
  assert.equal(normalizeBibleSearchQuery('1 Corinthians 13:4-7?'), '1 Corinthians 13:4-7');
  assert.throws(() => normalizeBibleSearchQuery('What is it?'), /topic, phrase, or passage reference/);
});

test('reports API.Bible configuration and rate-limit errors safely', () => {
  assert.equal(apiBibleProviderError(401).status, 503);
  assert.match(apiBibleProviderError(403).message, /KJV access/);
  assert.match(apiBibleProviderError(429).message, /rate-limited/);
  assert.equal(apiBibleProviderError(500).status, 502);
});

test('searches API.Bible with the server-side key and returns its FUMS token', async (context) => {
  const nativeFetch = global.fetch;
  const previousApiKey = process.env.API_BIBLE_KEY;
  process.env.API_BIBLE_KEY = 'test-api-key';
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(options.headers['api-key'], 'test-api-key');
    if (url.pathname === '/v1/bibles') {
      assert.equal(url.searchParams.get('abbreviation'), 'KJV');
      return new Response(JSON.stringify({
        data: [{ id: 'test-kjv-id', abbreviation: 'KJV', name: 'King James Version', copyright: 'KJV notice' }],
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    assert.equal(url.pathname, '/v1/bibles/test-kjv-id/search');
    assert.equal(url.searchParams.get('query'), 'faith');
    return new Response(JSON.stringify({
      data: { verses: [{ reference: 'Hebrews 11:1', text: 'Now faith is the substance of things hoped for.' }] },
      meta: { fumsToken: 'test-fums-token' },
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const server = app.listen(0);
  context.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
    global.fetch = nativeFetch;
    if (previousApiKey === undefined) delete process.env.API_BIBLE_KEY;
    else process.env.API_BIBLE_KEY = previousApiKey;
  }));
  await new Promise((resolve) => server.once('listening', resolve));

  const address = `127.0.0.1:${server.address().port}`;
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const response = await nativeFetch(`http://${address}/api/public/church-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `${protocol}://${address}`,
      ...(protocol === 'https' ? { 'X-Forwarded-Proto': 'https' } : {}),
    },
    body: JSON.stringify({ question: 'What does the Bible say about faith?' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.match(result.answer, /Hebrews 11:1/);
  assert.match(result.answer, /KJV notice/);
  assert.equal(result.fumsToken, 'test-fums-token');
});

test('validates website settings and limits editable page copy', () => {
  const settings = normalizeSettings({
    ministryName: 'Call of God Revival Ministry International',
    phone: '+254 726 046000',
    email: 'callofgodrevivalministry@gmail.com',
    address: 'Ugunja, Kenya',
    serviceTimes: '8:30 AM & 10:00 AM',
    serviceSchedule: 'Sunday 08:30, Sunday 10:00',
    serviceTimeZone: 'Africa/Nairobi',
    streamChannelUrl: 'https://youtube.com/@example',
    streamEmbedUrl: 'https://www.youtube.com/watch?v=AbCdEf_1234',
    streamLive: true,
    facebookUrl: 'https://facebook.com/example',
    youtubeUrl: 'https://youtube.com/@example',
    mpesaPaybill: '632581',
    mpesaAccount: 'Tithe / Offering / First',
    mobilePaybill: '247247',
    mobileAccount: '589488',
    mobileAccountName: 'Call of God Revival Ministry',
    heroTitle: 'Welcome',
    heroDescription: 'Join us in Ugunja.',
    heroImage: 'assets/img/church.jpg',
    pageCopy: { events: { title: 'Gather with us', intro: 'See what is happening.' } },
  });

  assert.equal(settings.pageCopy.events.title, 'Gather with us');
  assert.equal(settings.heroImage, 'assets/img/church.jpg');
  assert.equal(settings.mpesaPaybill, '632581');
  assert.equal(settings.mpesaAccount, 'Tithe / Offering / First');
  assert.equal(settings.mobilePaybill, '247247');
  assert.equal(settings.mobileAccount, '589488');
  assert.equal(settings.mobileAccountName, 'Call of God Revival Ministry');
  assert.equal(settings.streamChannelUrl, 'https://youtube.com/@example');
  assert.equal(settings.streamEmbedUrl, 'https://www.youtube-nocookie.com/embed/AbCdEf_1234');
  assert.equal(settings.streamLive, true);
  assert.equal(settings.serviceSchedule, 'Sunday 08:30, Sunday 10:00');
  assert.equal(settings.serviceTimeZone, 'Africa/Nairobi');
  assert.equal(settings.menuLabels.about, undefined);
  assert.equal(settings.givingUrl, '');
  assert.throws(() => normalizeSettings({ ...settings, streamEmbedUrl: '', streamLive: true }), /before marking the external stream live/);
  assert.throws(() => normalizeSettings({
    ministryName: 'Church',
    phone: '+254',
    email: 'church@example.org',
    address: 'Ugunja',
    serviceTimes: 'Sunday',
    heroTitle: 'Welcome',
    heroDescription: 'Join us.',
    heroImage: '',
    givingUrl: 'javascript:alert(1)',
  }), /HTTPS/);
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
  assert.throws(() => normalizeSettings({
    ministryName: 'Church',
    phone: '+254',
    email: 'church@example.org',
    address: 'Ugunja',
    serviceTimes: 'Sunday',
    serviceSchedule: 'Sunday 8:30 AM',
    serviceTimeZone: 'Not/A_Timezone',
    heroTitle: 'Welcome',
    heroDescription: 'Join us.',
    heroImage: '',
  }), /weekday and 24-hour time/);
});

test('serves the admin portal without exposing server source files', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const [
    adminResponse,
    sourceResponse,
    formResponse,
    adminBundleResponse,
    viewerBundleResponse,
    privacyResponse,
    termsResponse,
  ] = await Promise.all([
    fetch(`${baseUrl}/admin`),
    fetch(`${baseUrl}/server.js`),
    fetch(`${baseUrl}/forms/prayer.php`),
    fetch(`${baseUrl}/admin/live-dashboard.bundle.js`),
    fetch(`${baseUrl}/assets/js/live-stream.bundle.js`),
    fetch(`${baseUrl}/privacy-policy.html`),
    fetch(`${baseUrl}/terms-of-use.html`),
  ]);
  const adminHtml = await adminResponse.text();
  const sourceBody = await sourceResponse.text();
  const formBody = await formResponse.text();
  const privacyHtml = await privacyResponse.text();
  const termsHtml = await termsResponse.text();

  const homeResponse = await fetch(`${baseUrl}/`);
  const homeHtml = await homeResponse.text();

  assert.equal(adminResponse.status, 200);
  assert.match(adminHtml, /Manage your website/);
  assert.match(adminHtml, /Live broadcast/);
  assert.match(adminHtml, /Admin accounts/);
  assert.match(adminHtml, /Reports &amp; backup/);
  assert.match(adminHtml, /Preview content/);
  assert.equal(adminResponse.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
  assert.equal(adminBundleResponse.status, 200);
  assert.equal(viewerBundleResponse.status, 200);
  assert.equal(privacyResponse.status, 200);
  assert.equal(termsResponse.status, 200);
  assert.match(privacyHtml, /Data Protection Act, 2019/);
  assert.match(privacyHtml, /callofgodrevivalministry@gmail\.com/);
  assert.match(privacyHtml, /API\.Bible/);
  assert.match(termsHtml, /Terms of Use/);
  assert.match(termsHtml, /Ugunja-Ukwala Road/);
  assert.equal(adminResponse.headers.get('content-security-policy')?.includes("connect-src 'self' https: wss:"), true);
  assert.equal(homeResponse.status, 200);
  assert.match(homeHtml, /Call of God Revival Ministry/);
  assert.match(homeHtml, /Live Stream/);
  assert.match(homeHtml, /title="Live church service on YouTube"/);
  assert.match(homeHtml, /live-stream-fallback-link/);
  assert.match(homeHtml, /assets\/js\/church.js/);
  assert.match(homeHtml, /live-email-form/);
  assert.equal(homeResponse.headers.get('content-security-policy')?.includes("script-src 'self' 'unsafe-inline'"), true);
  assert.equal(homeResponse.headers.get('content-security-policy')?.includes('wss:'), true);
  assert.equal(sourceResponse.status, 404);
  assert.doesNotMatch(sourceBody, /MONGODB_URI|passwordHash/);
  assert.equal(formResponse.status, 404);
  assert.doesNotMatch(formBody, /function cgrm|SMTP_PASS/);
});
