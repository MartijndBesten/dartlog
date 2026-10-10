// OKKIE. website: betekenisvolle beweging en interactie (zie PRODUCTPRINCIPES.md).
// Zonder JavaScript of met verminderde beweging blijft alles in de eindstand zichtbaar.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('js');

  // ---- Inschuiven bij scrollen (eenmalig per blok) ----
  const blocks = document.querySelectorAll('.reveal, .stagger');
  if ('IntersectionObserver' in window && !reduce.matches) {
    const show = b => { b.classList.add('in'); io.unobserve(b); };
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) show(e.target);
      // Na een sprong (menulink, snel scrollen) ook alles wat al boven het scherm ligt tonen.
      blocks.forEach(b => { if (!b.classList.contains('in') && b.getBoundingClientRect().bottom < 0) show(b); });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    blocks.forEach(b => io.observe(b));
  } else blocks.forEach(b => b.classList.add('in'));

  // ---- Demo-beurt in de telefoon: T20, 5, D10 → 85 ----
  const phone = document.querySelector('[data-demo]');
  if (phone) {
    const total = phone.querySelector('[data-demo-total]');
    const avg = phone.querySelector('[data-demo-avg]');
    const bar = phone.querySelector('[data-demo-bar]');
    const darts = [...phone.querySelectorAll('[data-dart]')];
    const fmt = n => n.toFixed(2).replace('.', ',');
    let timers = [], frame = 0;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const countTo = (from, to, ms) => {
      cancelAnimationFrame(frame);
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / ms), eased = 1 - Math.pow(1 - t, 3);
        total.textContent = Math.round(from + (to - from) * eased);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const finalState = () => {
      darts.forEach(d => d.classList.add('hit'));
      total.textContent = '85'; avg.textContent = '57,30'; bar.style.width = '67%';
    };
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      if (reduce.matches) return finalState();
      phone.classList.remove('done');
      darts.forEach(d => d.classList.remove('hit', 'pop'));
      total.textContent = '0'; avg.textContent = fmt(52.4); bar.style.width = '0%';
      later(() => { bar.style.width = '61%'; }, 150);
      let sum = 0;
      darts.forEach((d, i) => later(() => {
        const add = Number(d.dataset.dart);
        d.classList.add('hit', 'pop');
        countTo(sum, sum + add, 420);
        sum += add;
      }, 700 + i * 850));
      later(() => {
        phone.classList.add('done');
        avg.textContent = '57,30'; bar.style.width = '67%';
      }, 700 + darts.length * 850);
    };
    // Pas afspelen als de telefoon in beeld is; tikken speelt opnieuw af.
    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver(([e]) => { if (e.isIntersecting) { play(); seen.disconnect(); } }, { threshold: 0.4 });
      seen.observe(phone);
    } else play();
    phone.addEventListener('click', play);
    phone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
    reduce.addEventListener?.('change', () => { if (reduce.matches) { timers.forEach(clearTimeout); finalState(); } });
  }

  // ---- Contact: e-mailadres kopiëren, met bevestiging ----
  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const status = btn.closest('.contact-card')?.querySelector('.copy-status');
    try { await navigator.clipboard.writeText(btn.dataset.copy); if (status) status.textContent = 'Gekopieerd: ' + btn.dataset.copy; }
    catch { if (status) status.textContent = 'Kopiëren lukt hier niet; selecteer het adres hierboven.'; }
  }));

  // ---- Installeren: het toestel van de bezoeker uitlichten ----
  const ua = navigator.userAgent;
  const device = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : '';
  const card = device && document.querySelector(`[data-device="${device}"]`);
  if (card) {
    card.classList.add('mine');
    card.insertAdjacentHTML('afterbegin', '<span class="mine-label">Jouw toestel</span>');
  }
})();
