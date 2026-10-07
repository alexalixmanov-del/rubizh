/* Explicit category banner assignments, shared by the directory and catalog. */
(() => {
  const banners = {
    "clothing": "/assets/category-clothing.b7a37481bb06.webp",
    "footwear": "/assets/category-footwear.6a8bd09a2528.webp",
    "armor": "/assets/category-armor.8d7b42242386.webp",
    "helmets": "/assets/category-helmets.54eeb057cd4f.webp",
    "communications": "/assets/category-communications.ab4d258f71e1.webp",
    "bags": "/assets/category-backpacks.3ab1ce8d263c.webp",
    "pouches": "/assets/category-pouches.c73384bcd877.webp",
    "load_bearing": "/assets/category-load-bearing.cc84a5111499.webp",
    "limb_protection": "/assets/category-knee-elbow.f9ebb4dcd78c.webp",
    "medical": "/assets/category-medical.b31954343e29.webp",
    "camouflage": "/assets/category-camouflage.bf6b4c5b3b74.webp",
    "field": "/assets/category-camping.de832d8a5040.webp",
    "electronics": "/assets/category-electronics.87be0a7693db.webp",
    "lighting": "/assets/category-lighting.79895340d867.webp",
    "power": "/assets/category-power.df14c79e24fc.webp",
    "weapon_accessories": "/assets/category-weapon-accessories.5f4d864bec89.webp",
    "eye_protection": "/assets/category-eye-protection.ec76fd300361.webp",
    "tools": "/assets/category-tools.4d8d4be93985.webp",
    "clothing_costumes": "/assets/category-uniforms.5f699a831579.webp",
    "clothing_gloves": "/assets/category-gloves.39fac99cf3ba.webp",
    "clothing_rainwear": "/assets/category-ponchos.0930cacaacc9.webp"
};
  const legacyNames = {"Формені комплекти та костюми": "clothing_costumes", "Одяг та форма": "clothing", "Пончо та дощовики": "clothing_rainwear", "Тактичні рукавички": "clothing_gloves", "Взуття": "footwear", "Бронезахист": "armor", "Шоломи та захист голови": "helmets", "Тактичний зв'язок та слух": "communications", "Рюкзаки, сумки та баули": "bags", "Підсумки": "pouches", "РПС та розвантаження": "load_bearing", "Захист колін та ліктів": "limb_protection", "Тактична медицина": "medical", "Маскування": "camouflage", "Туризм та польове спорядження": "field", "Електроніка та спостереження": "electronics", "Освітлення": "lighting", "Автономне живлення": "power", "Збройові аксесуари": "weapon_accessories", "Захист очей та обличчя": "eye_protection", "Інструменти та ножі": "tools"};
  window.rubizhDirectoryArt = categoryId => {
    const source = window.RUBIZH_DIRECTORY_BANNERS || banners;
    const id = legacyNames[categoryId] || categoryId;
    return Object.hasOwn(source, id) ? source[id] : '';
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
