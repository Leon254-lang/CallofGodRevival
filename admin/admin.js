'use strict';

(() => {
  const notice = document.querySelector('#notice');
  const state = { csrfToken: '', settings: null, items: [], editingId: '' };
  const editorPages = {
    home: 'index.html',
    about: 'about.html',
    visit: 'visit.html',
    ministries: 'courses.html',
    missions: 'course-details.html',
    sermons: 'sermons.html',
    events: 'events.html',
    location: 'location.html',
    leadership: 'trainers.html',
    giving: 'pricing.html',
    prayer: 'starter-page.html',
    contact: 'contact.html',
  };
  const editorGroups = {
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    p: 'p',
    blockquote: 'blockquote',
    eyebrow: '.eyebrow',
    eventDate: '.event-date',
  };
  let selectedPreviewImage = null;
  let selectedPreviewImageIndex = -1;
  const typeNames = {
    announcement: 'Announcement',
    event: 'Event',
    sermon: 'Sermon / video',
    ministry: 'Ministry',
    leader: 'Leader',
    'page-section': 'Page section',
  };
  const pageNames = {
    home: 'Home',
    about: 'Our Church',
    visit: 'Plan Your Visit',
    ministries: 'Ministries',
    missions: 'Community Missions',
    sermons: 'Sermons',
    events: 'Events',
    location: 'Service Times & Location',
    leadership: 'Leadership',
    giving: 'Giving',
    prayer: 'Prayer & Care',
    contact: 'Contact',
    all: 'All pages',
  };

  function showNotice(message, type = 'success') {
    notice.textContent = message;
    notice.className = `notice${type === 'error' ? ' error' : type === 'info' ? ' info' : ''}`;
    notice.hidden = false;
    notice.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function clearNotice() {
    notice.hidden = true;
    notice.textContent = '';
  }

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.csrf) headers.set('X-CSRF-Token', state.csrfToken);
    if (options.body && !(options.body instanceof File) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (options.body && !(options.body instanceof File) && headers.get('Content-Type') === 'application/json') {
      options.body = JSON.stringify(options.body);
    }
    if (options.body instanceof File) headers.set('Content-Type', options.body.type);

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The request failed (${response.status}).`);
    return data;
  }

  function showOnly(elementId) {
    for (const id of ['setup-panel', 'login-panel', 'unavailable-panel', 'dashboard']) {
      document.getElementById(id).hidden = id !== elementId;
    }
  }

  function fillSettingsForm() {
    const form = document.querySelector('#settings-form');
    for (const [key, value] of Object.entries(state.settings)) {
      if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value || '';
    }
  }

  function selectedPageCopy() {
    const slug = document.querySelector('#page-copy-slug').value;
    return state.settings.pageCopy?.[slug] || { title: '', intro: '' };
  }

  function fillPageCopyForm() {
    const pageCopy = selectedPageCopy();
    const form = document.querySelector('#page-copy-form');
    form.elements.title.value = pageCopy.title || '';
    form.elements.intro.value = pageCopy.intro || '';
  }

  async function loadDashboard() {
    const [settingsResponse, itemsResponse] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/content'),
    ]);
    state.settings = settingsResponse.settings;
    state.items = itemsResponse.items;
    fillSettingsForm();
    fillPageCopyForm();
    renderContentList();
    showOnly('dashboard');
  }

  function makePill(text, extraClass = '') {
    const pill = document.createElement('span');
    pill.className = `pill${extraClass ? ` ${extraClass}` : ''}`;
    pill.textContent = text;
    return pill;
  }

  function renderContentList() {
    const list = document.querySelector('#content-list');
    list.replaceChildren();
    document.querySelector('#content-count').textContent = String(state.items.length);
    if (state.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = 'No content yet. Use the form to add your first item.';
      list.append(empty);
      return;
    }

    for (const item of state.items) {
      const row = document.createElement('article');
      row.className = 'content-row';
      const header = document.createElement('div');
      header.className = 'content-row-head';
      const details = document.createElement('div');
      const title = document.createElement('h4');
      title.textContent = item.title;
      const type = document.createElement('p');
      type.textContent = typeNames[item.type] || item.type;
      details.append(title, type);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editContent(item));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => deleteContent(item));
      actions.append(edit, remove);
      header.append(details, actions);
      row.append(header);

      const meta = document.createElement('div');
      meta.className = 'content-meta';
      meta.append(
        makePill(pageNames[item.page] || item.page),
        makePill(item.status === 'published' ? 'Published' : 'Draft', item.status === 'draft' ? 'draft' : ''),
      );
      if (item.date) meta.append(makePill(item.date));
      row.append(meta);
      if (item.description) {
        const description = document.createElement('p');
        description.textContent = item.description;
        row.append(description);
      }
      list.append(row);
    }
  }

  function resetContentForm() {
    const form = document.querySelector('#content-form');
    form.reset();
    form.elements.id.value = '';
    form.elements.image.value = '';
    form.elements.order.value = '0';
    form.elements.status.checked = true;
    document.querySelector('#content-form-title').textContent = 'Add content';
    document.querySelector('#cancel-edit').hidden = true;
    document.querySelector('#image-status').textContent = 'Images are stored in your MongoDB Atlas database.';
    state.editingId = '';
  }

  function editContent(item) {
    const form = document.querySelector('#content-form');
    for (const key of ['id', 'type', 'page', 'title', 'description', 'date', 'location', 'price', 'speaker', 'series', 'passage', 'link', 'videoId', 'image', 'order']) {
      form.elements[key].value = item[key] ?? '';
    }
    form.elements.status.checked = item.status === 'published';
    document.querySelector('#content-form-title').textContent = 'Edit content';
    document.querySelector('#cancel-edit').hidden = false;
    document.querySelector('#image-status').textContent = item.image ? 'An image is saved for this item. Choose a new file to replace it.' : 'No image is saved for this item.';
    state.editingId = item.id;
    document.querySelector('#panel-content').scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteContent(item) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    clearNotice();
    try {
      await api(`/api/admin/content/${encodeURIComponent(item.id)}`, { method: 'DELETE', csrf: true });
      state.items = state.items.filter((entry) => entry.id !== item.id);
      renderContentList();
      showNotice('Content deleted.');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  async function uploadImage(file) {
    const response = await api('/api/admin/media', {
      method: 'POST',
      body: file,
      csrf: true,
    });
    return response.image;
  }

  function switchTab(tabName) {
    for (const button of document.querySelectorAll('.tab')) {
      const active = button.dataset.tab === tabName;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.admin-panel')) {
      panel.hidden = panel.id !== `panel-${tabName}`;
    }
    clearNotice();
    if (tabName === 'editor') loadPagePreview();
  }

  function pageEditorTextElements(root, selector) {
    return Array.from(root.querySelectorAll(`main ${selector}`)).filter((element) =>
      element.children.length === 0 &&
      !element.closest('.page-title, .church-hero, [data-cms-content], a, button, label, form') &&
      !(element.matches('p') && /Ugunja-Ukwala Road|8:30 AM|10:00 AM/.test(element.textContent || '')));
  }

  function pageEditorImages(root) {
    return Array.from(root.querySelectorAll('main img'))
      .filter((image) => !image.closest('.church-hero, [data-cms-content]'));
  }

  function attachPageEditor() {
    const frame = document.querySelector('#page-preview');
    let previewDocument;
    try {
      previewDocument = frame.contentDocument;
    } catch {
      showNotice('The page preview is unavailable. Open the admin page and website on the same host.', 'error');
      return;
    }
    if (!previewDocument?.querySelector('main')) {
      showNotice('The page preview has not finished loading. Try selecting the page again.', 'error');
      return;
    }

    const style = previewDocument.createElement('style');
    style.textContent = [
      '.cms-editable-preview{outline:2px dashed #b8894b!important;outline-offset:3px!important;cursor:text!important;}',
      '.cms-image-preview{outline:3px solid #b8894b!important;outline-offset:3px!important;cursor:pointer!important;}',
    ].join('');
    previewDocument.head.append(style);

    for (const [group, selector] of Object.entries(editorGroups)) {
      pageEditorTextElements(previewDocument, selector).forEach((element) => {
        element.contentEditable = 'true';
        element.spellcheck = true;
        element.classList.add('cms-editable-preview');
        element.setAttribute('aria-label', `Edit ${group} text`);
      });
    }

    selectedPreviewImage = null;
    selectedPreviewImageIndex = -1;
    document.querySelector('#replace-page-image').disabled = true;
    document.querySelector('#page-image-status').textContent = 'Click a photo in the preview first.';
    pageEditorImages(previewDocument).forEach((image, index) => {
      image.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (selectedPreviewImage) selectedPreviewImage.classList.remove('cms-image-preview');
        selectedPreviewImage = image;
        selectedPreviewImageIndex = index;
        image.classList.add('cms-image-preview');
        document.querySelector('#replace-page-image').disabled = false;
        document.querySelector('#page-image-status').textContent = 'Photo selected. Choose a replacement image and upload it.';
      });
    });
  }

  function loadPagePreview() {
    const slug = document.querySelector('#page-editor-slug').value;
    const frame = document.querySelector('#page-preview');
    const expectedUrl = `/${editorPages[slug]}`;
    if (frame.getAttribute('src') === expectedUrl && frame.contentWindow?.__cmsReady) {
      attachPageEditor();
      return;
    }

    frame.onload = () => {
      let previewWindow;
      try {
        previewWindow = frame.contentWindow;
      } catch {
        showNotice('The page preview could not be opened on this host.', 'error');
        return;
      }
      if (previewWindow.__cmsReady) {
        attachPageEditor();
        return;
      }
      previewWindow.addEventListener('cms:ready', attachPageEditor, { once: true });
    };
    frame.src = expectedUrl;
  }

  function collectPageContent() {
    const frame = document.querySelector('#page-preview');
    const previewDocument = frame.contentDocument;
    const texts = {};
    for (const [group, selector] of Object.entries(editorGroups)) {
      texts[group] = pageEditorTextElements(previewDocument, selector).map((element) => element.textContent || '');
    }
    const images = pageEditorImages(previewDocument).map((image) => image.getAttribute('src') || image.src);
    return { texts, images };
  }

  async function savePageContent() {
    clearNotice();
    const slug = document.querySelector('#page-editor-slug').value;
    try {
      const pageContent = { ...(state.settings.pageContent || {}) };
      pageContent[slug] = collectPageContent();
      const data = await api('/api/admin/settings', {
        method: 'PUT',
        body: { ...state.settings, pageContent },
        csrf: true,
      });
      state.settings = data.settings;
      showNotice(`${pageNames[slug]} page text and photos saved and published.`);
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  document.querySelector('#setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/admin/setup', {
        method: 'POST',
        body: Object.fromEntries(new FormData(form)),
      });
      state.csrfToken = data.csrfToken;
      form.reset();
      await loadDashboard();
      showNotice('Admin account created. Keep your sign-in details private.');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: Object.fromEntries(new FormData(form)),
      });
      state.csrfToken = data.csrfToken;
      form.reset();
      await loadDashboard();
      showNotice('You are signed in.');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#logout-button').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', csrf: true });
      state.csrfToken = '';
      state.settings = null;
      state.items = [];
      showOnly('login-panel');
      showNotice('You have signed out.');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  document.querySelector('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    values.pageCopy = state.settings.pageCopy || {};
    const heroImage = document.querySelector('#hero-image').files[0];
    try {
      if (heroImage) {
        document.querySelector('#hero-image-status').textContent = 'Uploading homepage image to Atlas…';
        values.heroImage = await uploadImage(heroImage);
      } else {
        values.heroImage = state.settings.heroImage;
      }
      const data = await api('/api/admin/settings', { method: 'PUT', body: values, csrf: true });
      state.settings = data.settings;
      document.querySelector('#hero-image').value = '';
      document.querySelector('#hero-image-status').textContent = 'Choose a new photo to replace the current homepage church image.';
      showNotice('Church details saved and published.');
    } catch (error) {
      document.querySelector('#hero-image-status').textContent = 'The homepage image or church details could not be saved.';
      showNotice(error.message, 'error');
    }
  });

  document.querySelector('#page-copy-slug').addEventListener('change', fillPageCopyForm);

  document.querySelector('#page-copy-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    const form = event.currentTarget;
    const slug = form.elements.page.value;
    const pageCopy = { ...(state.settings.pageCopy || {}) };
    const title = form.elements.title.value.trim();
    const intro = form.elements.intro.value.trim();
    if (title || intro) pageCopy[slug] = { title, intro };
    else delete pageCopy[slug];
    try {
      const data = await api('/api/admin/settings', {
        method: 'PUT',
        body: { ...state.settings, pageCopy },
        csrf: true,
      });
      state.settings = data.settings;
      fillPageCopyForm();
      showNotice('Page heading saved and published.');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  document.querySelector('#content-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const file = document.querySelector('#content-image').files[0];
      if (file) {
        document.querySelector('#image-status').textContent = 'Uploading image to Atlas…';
        values.image = await uploadImage(file);
      }
      values.order = Number(values.order || 0);
      values.status = form.elements.status.checked ? 'published' : 'draft';
      const id = values.id;
      delete values.id;
      const response = await api(
        id ? `/api/admin/content/${encodeURIComponent(id)}` : '/api/admin/content',
        { method: id ? 'PUT' : 'POST', body: values, csrf: true },
      );
      if (id) {
        state.items = state.items.map((item) => item.id === id ? response.item : item);
      } else {
        state.items.unshift(response.item);
      }
      renderContentList();
      resetContentForm();
      showNotice('Content saved. Published items are now visible on the selected page.');
    } catch (error) {
      document.querySelector('#image-status').textContent = 'The content was not saved.';
      showNotice(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('#cancel-edit').addEventListener('click', resetContentForm);
  document.querySelector('#page-editor-slug').addEventListener('change', loadPagePreview);
  document.querySelector('#save-page-content').addEventListener('click', savePageContent);
  document.querySelector('#replace-page-image').addEventListener('click', async (event) => {
    const file = document.querySelector('#page-image-file').files[0];
    if (!file || !selectedPreviewImage || selectedPreviewImageIndex < 0) {
      showNotice('Select a photo in the preview and choose a replacement file.', 'error');
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    document.querySelector('#page-image-status').textContent = 'Uploading image to Atlas…';
    try {
      const image = await uploadImage(file);
      selectedPreviewImage.src = image;
      selectedPreviewImage.setAttribute('src', image);
      document.querySelector('#page-image-file').value = '';
      document.querySelector('#page-image-status').textContent = 'Replacement uploaded. Save page text & photos to publish it.';
    } catch (error) {
      document.querySelector('#page-image-status').textContent = 'The photo could not be uploaded.';
      showNotice(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
  document.querySelectorAll('.tab').forEach((button) => {
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  async function start() {
    try {
      const data = await api('/api/admin/state');
      if (data.authenticated) {
        state.csrfToken = data.csrfToken;
        await loadDashboard();
      } else if (data.setupAvailable) {
        showOnly('setup-panel');
      } else if (data.configured) {
        showOnly('login-panel');
      } else {
        showOnly('unavailable-panel');
      }
    } catch (error) {
      showOnly('unavailable-panel');
      showNotice(error.message, 'error');
    }
  }

  start();
})();
