(() => {
  const toggle = document.querySelector('.mobile-nav-toggle');
  const body = document.body;

  if (toggle) {
    toggle.addEventListener('click', () => {
      body.classList.toggle('mobile-nav-active');
      toggle.classList.toggle('bi-list');
      toggle.classList.toggle('bi-x');
    });
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle.click();
      }
    });
  }

  document.querySelectorAll('#navmenu .dropdown-toggle').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const submenu = link.nextElementSibling;
      const isExpanded = link.getAttribute('aria-expanded') === 'true';
      link.setAttribute('aria-expanded', String(!isExpanded));
      link.classList.toggle('active', !isExpanded);
      if (submenu) submenu.classList.toggle('dropdown-active', !isExpanded);
    });
  });

  document.querySelectorAll('#navmenu a:not(.dropdown-toggle)').forEach((link) => {
    link.addEventListener('click', () => {
      body.classList.remove('mobile-nav-active');
      if (toggle) {
        toggle.classList.add('bi-list');
        toggle.classList.remove('bi-x');
      }
    });
  });

  const scrollTop = document.querySelector('.scroll-top');
  if (scrollTop) {
    const updateScrollTop = () => scrollTop.classList.toggle('active', window.scrollY > 100);
    window.addEventListener('scroll', updateScrollTop, { passive: true });
    updateScrollTop();
    scrollTop.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const currentYear = document.querySelector('#current-year');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());

  const cmsPages = {
    'index.html': 'home',
    'about.html': 'about',
    'visit.html': 'visit',
    'courses.html': 'ministries',
    'course-details.html': 'missions',
    'sermons.html': 'sermons',
    'events.html': 'events',
    'location.html': 'location',
    'trainers.html': 'leadership',
    'pricing.html': 'giving',
    'starter-page.html': 'prayer',
    'contact.html': 'contact',
  };
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  const pageSlug = cmsPages[pageName] || 'home';
  const pageCopyTitle = document.querySelector('.page-title .heading h1');
  const pageCopyIntro = document.querySelector('.page-title .heading p');
  const cmsTextGroups = {
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    p: 'p',
    blockquote: 'blockquote',
    eyebrow: '.eyebrow',
    eventDate: '.event-date'
  };
  const cmsEditableElements = (root, selector) => Array.from(root.querySelectorAll(`main ${selector}`))
    .filter((element) => element.children.length === 0 &&
      !element.closest('.page-title, .church-hero, [data-cms-content], a, button, label, form') &&
      !(element.matches('p') && /Ugunja-Ukwala Road|8:30 AM|10:00 AM/.test(element.textContent || '')));

  const renderCmsItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;
    const main = document.querySelector('main');
    if (!main) return;

    const section = document.createElement('section');
    section.className = 'section-pad light-background';
    section.setAttribute('data-cms-content', '');
    const container = document.createElement('div');
    container.className = 'container';
    const heading = document.createElement('div');
    heading.className = 'section-heading';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'From the ministry';
    const title = document.createElement('h2');
    title.textContent = 'Updates & resources';
    heading.append(eyebrow, title);
    const row = document.createElement('div');
    row.className = 'row gy-4';

    for (const item of items) {
      const column = document.createElement('div');
      column.className = 'col-lg-4 col-md-6';
      let card;

      if (item.videoId) {
        card = document.createElement('article');
        card.className = 'video-card';
        const frame = document.createElement('div');
        frame.className = 'video-frame';
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}`;
        iframe.title = item.title;
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        frame.append(iframe);
        const content = document.createElement('div');
        content.className = 'video-card-content';
        const cardTitle = document.createElement('h3');
        cardTitle.textContent = item.title;
        content.append(cardTitle);
        if (item.description) {
          const description = document.createElement('p');
          description.textContent = item.description;
          content.append(description);
        }
        if (item.transcript) {
          const transcript = document.createElement('details');
          transcript.className = 'media-notes';
          const summary = document.createElement('summary');
          summary.textContent = 'Read transcript or study notes';
          const notes = document.createElement('p');
          notes.textContent = item.transcript;
          transcript.append(summary, notes);
          content.append(transcript);
        }
        if (item.studyMaterial) {
          const material = document.createElement('a');
          material.href = item.studyMaterial;
          material.target = '_blank';
          material.rel = 'noopener noreferrer';
          material.textContent = 'Open study materials';
          content.append(material);
        }
        card.append(frame, content);
      } else if (item.type === 'event' || item.type === 'announcement') {
        card = document.createElement('article');
        card.className = 'event-card';
        if (item.image) {
          const image = document.createElement('img');
          image.src = item.image;
          image.alt = item.title;
          image.loading = 'lazy';
          card.append(image);
        }
        const content = document.createElement('div');
        content.className = 'event-card-content';
        if (item.date) {
          const date = document.createElement('span');
          date.className = 'event-date';
          date.textContent = item.date;
          content.append(date);
        }
        const cardTitle = document.createElement('h3');
        cardTitle.textContent = item.title;
        content.append(cardTitle);
        if (item.description) {
          const description = document.createElement('p');
          description.textContent = item.description;
          content.append(description);
        }
        if (item.location) {
          const location = document.createElement('p');
          location.textContent = item.location;
          content.append(location);
        }
        if (item.price) {
          const price = document.createElement('p');
          price.textContent = item.price;
          content.append(price);
        }
        card.append(content);
      } else {
        card = document.createElement('article');
        card.className = 'icon-card';
        if (item.image) {
          const image = document.createElement('img');
          image.src = item.image;
          image.alt = item.title;
          image.loading = 'lazy';
          image.className = 'cms-content-image';
          card.append(image);
        }
        const cardTitle = document.createElement('h3');
        cardTitle.textContent = item.title;
        card.append(cardTitle);
        if (item.description) {
          const description = document.createElement('p');
          description.textContent = item.description;
          card.append(description);
        }
        if (item.date || item.location || item.price || item.speaker || item.series || item.passage) {
          const details = document.createElement('p');
          details.className = 'cms-content-details';
          details.textContent = [item.date, item.location, item.price, item.speaker, item.series, item.passage].filter(Boolean).join(' · ');
          card.append(details);
        }
      }

      if (item.link) {
        const link = document.createElement('a');
        link.href = item.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Learn more';
        const content = card.querySelector('.event-card-content, .video-card-content') || card;
        content.append(link);
      }
      column.append(card);
      row.append(column);
    }

    container.append(heading, row);
    section.append(container);
    const lastMainSection = main.lastElementChild;
    if (lastMainSection) main.insertBefore(section, lastMainSection);
    else main.append(section);
  };

  const applyCmsSettings = (settings) => {
    if (!settings || typeof settings !== 'object') return;
    document.querySelectorAll('.sitename').forEach((element) => {
      element.textContent = settings.ministryName;
    });

    const phone = String(settings.phone || '').trim();
    const phoneHref = phone.replace(/[^\d+]/g, '');
    if (phoneHref) {
      document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
        link.href = `tel:${phoneHref}`;
        link.textContent = link.textContent.replace(/\+?\d[\d\s()-]{6,}/, phone);
      });
    }

    const email = String(settings.email || '').trim();
    if (email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
        link.href = `mailto:${email}`;
        if (link.textContent.includes('@')) link.textContent = email;
      });
    }

    if (settings.facebookUrl) {
      document.querySelectorAll('a[href*="facebook.com/p/Call-Of-God"]').forEach((link) => {
        link.href = settings.facebookUrl;
      });
    }
    if (settings.youtubeUrl) {
      document.querySelectorAll('a[href^="https://www.youtube.com/@CGRM_Ugunja"]').forEach((link) => {
        link.href = settings.youtubeUrl;
      });
    }
    if (settings.brandLogo) {
      document.querySelectorAll('.brand-logo').forEach((image) => {
        image.src = settings.brandLogo;
      });
    }

    const menuLabels = settings.menuLabels || {};
    const menuPages = {
      home: 'index.html',
      about: 'about.html',
      visit: 'visit.html',
      ministries: 'courses.html',
      sermons: 'sermons.html',
      events: 'events.html',
      more: '#',
      giving: 'pricing.html',
    };
    for (const [key, file] of Object.entries(menuPages)) {
      const label = menuLabels[key];
      if (!label) continue;
      const link = document.querySelector(`#navmenu a[href="${file}"]`);
      if (!link) continue;
      for (const node of Array.from(link.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
      }
      link.insertBefore(document.createTextNode(label), link.firstChild);
    }

    if (pageSlug === 'giving' && settings.givingUrl) {
      const givingLink = document.querySelector('[data-giving-link]');
      if (givingLink) {
        givingLink.href = settings.givingUrl;
        givingLink.hidden = false;
      }
    }

    document.querySelectorAll('p').forEach((paragraph) => {
      const text = paragraph.textContent || '';
      if (text.includes('Ugunja-Ukwala Road') && text.includes('Siaya County') && !text.includes('From the Kisumu')) {
        paragraph.textContent = settings.address;
      }
      if (text.includes('8:30 AM') && text.includes('10:00 AM')) {
        paragraph.textContent = text.replace(/8:30 AM\s*(?:&|and|·)\s*10:00 AM/g, settings.serviceTimes);
      }
    });

    const homeTitle = document.querySelector('.church-hero h1');
    const homeIntro = document.querySelector('.church-hero p');
    const homeImage = document.querySelector('.church-hero > img');
    if (homeTitle && settings.heroTitle) homeTitle.textContent = settings.heroTitle;
    if (homeIntro && settings.heroDescription) homeIntro.textContent = settings.heroDescription;
    if (homeImage && settings.heroImage) homeImage.src = settings.heroImage;

    const copy = settings.pageCopy?.[pageSlug];
    if (copy && pageSlug !== 'home') {
      if (pageCopyTitle && copy.title) pageCopyTitle.textContent = copy.title;
      if (pageCopyIntro && copy.intro) pageCopyIntro.textContent = copy.intro;
    }

    const pageContent = settings.pageContent?.[pageSlug];
    if (pageContent?.texts) {
      for (const [group, selector] of Object.entries(cmsTextGroups)) {
        const values = pageContent.texts[group];
        if (!Array.isArray(values)) continue;
        cmsEditableElements(document, selector).forEach((element, index) => {
          if (typeof values[index] === 'string') element.textContent = values[index];
        });
      }
    }
    if (Array.isArray(pageContent?.images)) {
      const images = Array.from(document.querySelectorAll('main img'))
        .filter((image) => !image.closest('.church-hero, [data-cms-content]'));
      images.forEach((image, index) => {
        if (typeof pageContent.images[index] === 'string' && pageContent.images[index]) {
          image.src = pageContent.images[index];
        }
      });
    }
  };

  const signalCmsReady = () => {
    window.__cmsReady = true;
    window.dispatchEvent(new Event('cms:ready'));
  };

  fetch(`/api/public/bootstrap?page=${encodeURIComponent(pageSlug)}`, { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error(`Content service returned ${response.status}.`);
      return response.json();
    })
    .then((data) => {
      applyCmsSettings(data.settings);
      renderCmsItems(data.items);
      signalCmsReady();
    })
    .catch((error) => {
      console.error('Website content could not be refreshed from the admin system:', error);
      signalCmsReady();
    });

  const prayerStatus = document.querySelector('#prayer-form-status');
  if (prayerStatus) {
    const result = new URLSearchParams(window.location.search).get('prayer');
    if (result === 'sent') {
      prayerStatus.textContent = 'Your request was handed to the ministry email service. Delivery can be delayed; please call if you need urgent support.';
      prayerStatus.classList.add('alert-success');
      prayerStatus.hidden = false;
      window.history.replaceState(null, '', `${window.location.pathname}#prayer-request-form`);
    }
  }

  const contactStatus = document.querySelector('#contact-form-status');
  if (contactStatus && new URLSearchParams(window.location.search).get('message') === 'sent') {
    contactStatus.textContent = 'Your message was handed to the ministry email service. Delivery can be delayed; if your matter is urgent, please call the ministry.';
    contactStatus.classList.add('alert-success');
    contactStatus.hidden = false;
    window.history.replaceState(null, '', `${window.location.pathname}#contact`);
  }
})();
