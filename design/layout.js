/* Inyecta cabecera y footer compartidos. Uso: <div id="site-header"></div> ... <div id="site-footer"></div> */
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  const nav = [
    ['tratamientos.html', 'Tratamientos'],
    ['la-clinica.html', 'La clínica'],
    ['productos.html', 'Nuestros productos'],
    ['consejos.html', 'Consejos de salud'],
    ['faqs.html', 'Preguntas frecuentes'],
  ];
  const header = `
  <header class="site-header"><div class="bar">
    <a class="logo" href="index.html">Clínica Vet</a>
    <nav class="main-nav">${nav.map(([h, t]) => `<a href="${h}"${h === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
    <div class="header-cta">
      <div class="account-menu">
        <button class="chip btn--ghost btn--sm btn" aria-haspopup="true">👤 Mi cuenta ⌄</button>
        <div class="account-menu__panel"><a href="login.html">Iniciar sesión</a><a href="registro.html">Crear cuenta</a><a href="cuenta.html">Mis mascotas y pedidos</a></div>
      </div>
      <a class="chip btn--sky btn--sm btn" href="cita.html">Pide cita</a><a class="chip btn--pink btn--sm btn" href="contacto.html">Contacto</a>
      <a class="icon-link" href="carrito.html" aria-label="Carrito">🛒<span class="cart-count">0</span></a>
    </div>
  </div></header>`;
  const footer = `
  <footer class="site-footer"><div class="container footer__grid">
    <div><strong>Clínica Veterinaria</strong><p>Cuidamos de tu mascota como se merece.</p></div>
    <div><a href="la-clinica.html">La clínica</a><br><a href="cita.html">Pedir cita</a><br><a href="contacto.html">Contacto</a><br><a href="tratamientos.html">Tratamientos</a></div>
    <div><a href="consejos.html">Consejos de salud</a><br><a href="#">Política de privacidad</a><br><a href="#">Cookies</a></div>
  </div></footer>`;
  const h = document.getElementById('site-header'), f = document.getElementById('site-footer');
  if (h) h.outerHTML = header;
  if (f) f.outerHTML = footer;
})();
