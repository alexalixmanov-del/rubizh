/* Explicit category banner assignments, shared by the directory and catalog. */
(() => {
  const banners = {
    'Одяг та форма': '/assets/category-uniform.95312bde6e13.webp',
    'Взуття': '/assets/category-boots.8c675db9bc54.webp',
    'Бронезахист': '/assets/category-armor.7c36c18e379c.webp',
    'Рюкзаки, сумки та баули': '/assets/category-gear.c56b57d557de.webp',
    'Тактична медицина': '/assets/category-med.a8f960dde519.webp',
    'Маскування': '/assets/category-camo.b7dc97473855.webp'
  };
  window.rubizhDirectoryArt = name => {
    const source = window.RUBIZH_DIRECTORY_BANNERS || banners;
    return Object.hasOwn(source, name) ? source[name] : '';
  };
  window.rubizhDirectoryOpen = id => {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open) return;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.addEventListener('close', () => {
      document.documentElement.style.overflow = overflow;
    }, {once: true});
    dialog.showModal();
  };
})();
