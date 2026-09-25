/* ============================================================
   MAIN.JS — Delgado & Avellaneda
   ============================================================ */

(function () {
  'use strict';

  /* ---- NAVBAR scroll effect ---- */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  /* ---- Mobile nav toggle ---- */
  const navToggle = document.getElementById('nav-toggle');
  const navLinks  = document.getElementById('nav-links');
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    navToggle.classList.toggle('open');
  });
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
    });
  });

  /* ---- Active nav link on scroll ---- */
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-link');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navAnchors.forEach(a => a.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(s => observer.observe(s));

  /* ---- Hero profile cards scroll ---- */
  const hpJulio = document.getElementById('hp-julio');
  const hpMarco = document.getElementById('hp-marco');
  if (hpJulio) hpJulio.addEventListener('click', () => smoothScroll('julio-perfil'));
  if (hpMarco) hpMarco.addEventListener('click', () => smoothScroll('marco-perfil'));

  function smoothScroll(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Timeline tab switching ---- */
  const tabs = document.querySelectorAll('.timeline-tab');
  const tlJulio = document.getElementById('tl-julio');
  const tlMarco = document.getElementById('tl-marco');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const profile = tab.dataset.profile;
      if (profile === 'julio') {
        tlJulio.classList.remove('hidden');
        tlMarco.classList.add('hidden');
        animateTimeline(tlJulio);
      } else {
        tlMarco.classList.remove('hidden');
        tlJulio.classList.add('hidden');
        animateTimeline(tlMarco);
      }
    });
  });

  function animateTimeline(track) {
    const items = track.querySelectorAll('.tl-item');
    items.forEach((item, i) => {
      item.style.animationDelay = `${i * 0.08}s`;
      item.style.animation = 'none';
      void item.offsetWidth; // reflow
      item.style.animation = '';
    });
  }

  /* ---- Animated stat counters ---- */
  function animateCounter(el, target, duration) {
    let start = 0;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const statNums = document.querySelectorAll('.stat-number');
  let statsAnimated = false;
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !statsAnimated) {
      statsAnimated = true;
      statNums.forEach(el => {
        animateCounter(el, parseInt(el.dataset.target), 1800);
      });
    }
  }, { threshold: 0.5 });
  const statsBanner = document.querySelector('.stats-banner');
  if (statsBanner) statsObserver.observe(statsBanner);

  /* ---- Histogram bar animation (fixed) ---- */
  const histoBars = document.querySelectorAll('.histo-bar');
  // 1. Read and store original heights FIRST
  histoBars.forEach(bar => {
    const originalH = bar.style.getPropertyValue('--h') || '50%';
    bar.setAttribute('data-original-h', originalH);
  });
  // 2. Then zero them out
  histoBars.forEach(bar => bar.style.setProperty('--h', '0%'));

  const dashboard = document.querySelector('.dashboard');
  if (dashboard) {
    const histoObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        histoBars.forEach((bar, i) => {
          setTimeout(() => {
            const originalH = bar.getAttribute('data-original-h');
            bar.style.setProperty('--h', originalH);
          }, i * 80);
        });
        histoObserver.disconnect();
      }
    }, { threshold: 0.2 });
    histoObserver.observe(dashboard);
  }

  /* ---- Fade-in-up scroll animation (staggered) ---- */
  const fadeEls = document.querySelectorAll(
    '.rcard, .sin-card, .doc-card, .tl-item, .profile-block, .dashboard, .convergence-banner, .contact-person'
  );
  fadeEls.forEach(el => el.classList.add('fade-in-up'));
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Stagger siblings in the same parent grid
        const siblings = [...(entry.target.parentElement?.children || [])]
          .filter(el => el.classList.contains('fade-in-up') && !el.classList.contains('visible'));
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => entry.target.classList.add('visible'), Math.max(0, idx) * 80);
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  fadeEls.forEach(el => fadeObserver.observe(el));

  /* ---- Contact form ---- */
  const form      = document.getElementById('contact-form');
  const successEl = document.getElementById('form-success');
  const errorEl   = document.getElementById('form-error');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      successEl.classList.remove('visible');
      errorEl.classList.remove('visible');

      const nombre   = document.getElementById('f-nombre').value.trim();
      const email    = document.getElementById('f-email').value.trim();
      const dirigido = document.getElementById('f-dirigido').value;
      const asunto   = document.getElementById('f-asunto').value.trim();
      const mensaje  = document.getElementById('f-mensaje').value.trim();

      if (!nombre || !email || !dirigido || !asunto || !mensaje) {
        errorEl.classList.add('visible');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errorEl.classList.add('visible');
        errorEl.textContent = '✗ Por favor ingrese un correo electrónico válido.';
        return;
      }

      // Simulate submission
      const btn = document.getElementById('form-submit');
      btn.textContent = 'Enviando...';
      btn.disabled = true;
      setTimeout(() => {
        form.reset();
        btn.textContent = 'Enviar Mensaje';
        btn.disabled = false;
        successEl.classList.add('visible');
        setTimeout(() => successEl.classList.remove('visible'), 6000);
      }, 1200);
    });
  }

  /* ---- Smooth scroll for all hash links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = navbar.offsetHeight + 20;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

})();
