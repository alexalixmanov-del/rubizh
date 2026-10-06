/* Explicit category banner assignments, shared by the directory and catalog. */
(() => {
  const banners = {
    "Одяг та форма": "/assets/category-clothing.b7a37481bb06.webp",
    "Взуття": "/assets/category-footwear.6a8bd09a2528.webp",
    "Бронезахист": "/assets/category-armor.8d7b42242386.webp",
    "Шоломи та захист голови": "/assets/category-helmets.54eeb057cd4f.webp",
    "Тактичний зв'язок та слух": "/assets/category-communications.ab4d258f71e1.webp",
    "Рюкзаки, сумки та баули": "/assets/category-backpacks.3ab1ce8d263c.webp",
    "Підсумки": "/assets/category-pouches.c73384bcd877.webp",
    "РПС та розвантаження": "/assets/category-load-bearing.cc84a5111499.webp",
    "Захист колін та ліктів": "/assets/category-knee-elbow.f9ebb4dcd78c.webp",
    "Тактична медицина": "/assets/category-medical.b31954343e29.webp",
    "Маскування": "/assets/category-camouflage.bf6b4c5b3b74.webp",
    "Туризм та польове спорядження": "/assets/category-camping.de832d8a5040.webp",
    "Електроніка та спостереження": "/assets/category-electronics.87be0a7693db.webp",
    "Освітлення": "/assets/category-lighting.79895340d867.webp",
    "Автономне живлення": "/assets/category-power.df14c79e24fc.webp",
    "Збройові аксесуари": "/assets/category-weapon-accessories.5f4d864bec89.webp",
    "Захист очей та обличчя": "/assets/category-eye-protection.ec76fd300361.webp",
    "Інструменти та ножі": "/assets/category-tools.4d8d4be93985.webp",
    "Формені комплекти та костюми": "/assets/category-uniforms.5f699a831579.webp",
    "Тактичні рукавички": "/assets/category-gloves.39fac99cf3ba.webp",
    "Пончо та дощовики": "/assets/category-ponchos.0930cacaacc9.webp"
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
