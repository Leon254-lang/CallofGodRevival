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

  document.querySelectorAll('#navmenu a').forEach((link) => {
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
})();
