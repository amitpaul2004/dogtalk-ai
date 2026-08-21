(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.add('js-motion');

  const app = document.querySelector('.app');
  if (!app) return;

  // Scroll progress indicator.
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);

  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.setProperty('--scroll', max > 0 ? `${(window.scrollY / max) * 100}%` : '0%');
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });

  // Ambient cursor glow for desktop pointer devices.
  if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);
    let raf = 0;
    let x = -200;
    let y = -200;
    let tx = x;
    let ty = y;

    const render = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(render);
    };
    render();

    window.addEventListener('pointermove', (event) => {
      tx = event.clientX;
      ty = event.clientY;
    }, { passive: true });

    window.addEventListener('blur', () => {
      glow.style.opacity = '0';
    });
    window.addEventListener('focus', () => {
      glow.style.opacity = '';
    });

    window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
  }

  if (reducedMotion) return;

  // Reveal sections/cards as they enter the viewport.
  const revealTargets = [
    ...document.querySelectorAll('.hero-copy, .hero-orbit, .notice, .translator-card, .flow-section, footer')
  ];
  revealTargets.forEach((element, index) => {
    element.classList.add('motion-reveal');
    element.style.setProperty('--reveal-delay', `${Math.min(index * 55, 420)}ms`);
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

  revealTargets.forEach((element) => revealObserver.observe(element));

  // Add a tiny depth tilt to the interactive cards.
  document.querySelectorAll('.translator-card, .flow-item').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rotateX = (0.5 - py) * 5;
      const rotateY = (px - 0.5) * 5;
      card.style.setProperty('--rx', `${rotateX}deg`);
      card.style.setProperty('--ry', `${rotateY}deg`);
      card.classList.add('is-tilting');
    });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.classList.remove('is-tilting');
    });
  });

  // Magnetic hover for primary actions.
  document.querySelectorAll('.primary-button, .secondary').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      if (button.disabled) return;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      button.style.transform = `translate3d(${x * 0.06}px, ${y * 0.06 - 2}px, 0)`;
    });

    button.addEventListener('pointerleave', () => {
      button.style.transform = '';
    });
  });

  // Enhance recording status with a live dot pulse without touching app logic.
  const statusIds = ['dogStatus', 'humanStatus'];
  statusIds.forEach((id) => {
    const status = document.getElementById(id);
    if (!status) return;
    const observer = new MutationObserver(() => {
      status.classList.toggle('is-busy', /Listening|Analyzing|Converting/i.test(status.textContent));
    });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
  });
})();
