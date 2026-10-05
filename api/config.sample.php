<?php
// РУБІЖ · API магазина. Скопируйте этот файл в config.php и заполните.
return [
  // Доступ к базе MySQL (adm.tools → MySQL → ваша база)
  'db_host' => 'localhost',
  'db_name' => 'xk589064_rubizh',
  'db_user' => 'xk589064_rubizh',
  'db_pass' => 'ПАРОЛЬ_ОТ_БАЗЫ',

  // Секретный ключ PIM: длинная случайная строка. Тот же ключ вставляется в PIM → «Выгрузка» → «Сайт».
  'pim_key' => 'ЗАМЕНИТЕ_НА_ДЛИННЫЙ_СЛУЧАЙНЫЙ_КЛЮЧ',

  // Откуда разрешено отправлять товары (адрес PIM)
  'pim_origins' => ['https://pim.rubizh.shop'],

  // Ключ для планировщика задач (обработка фото по расписанию)
  'cron_key' => 'ЗАМЕНИТЕ_НА_ДРУГОЙ_КЛЮЧ',

  // Фото: папка и публичный адрес
  'media_dir' => __DIR__ . '/../media',
  'media_url' => '/media',
  'photo_max' => 1600,   // большая сторона основного фото, px
  'thumb_max' => 480,    // превью для каталога, px
  'webp_quality' => 82,
  // Нова пошта: добавляйте эти поля в существующий config.php, не заменяйте его.
  'nova_poshta_api_key' => '', // Только бизнес-ключ ФОП, никогда не в браузере.
  'np_manager_emails' => [], // Подтверждённые email менеджеров; доступ закрыт по умолчанию.
  'np_ttn_enabled' => false, // Включить после диагностики и согласования тестового заказа.
  'np_sender' => ['ref'=>'','contact_ref'=>'','phone'=>'','confirmed'=>false],
  'np_origin_refs' => [], // code => city_ref, warehouse_ref, expected_area, confirmed
  'np_custom_origins' => [], // kiborg => name,city,region,branch,address — после согласования
  'np_supplier_names' => [],
  'np_supplier_by_sku' => [],
  'np_supplier_by_product' => [],
  'np_cod_contract_confirmed' => false,
  'np_cod_service' => '', // afterpayment только после проверки договора ФОП.
  'tg_bot_token' => '', // серверный токен бота
  'tg_chat_id' => '', // приватный чат менеджера
  'order_notification_email' => 'zakaz@rubizh.shop',
  'mono_activation_confirmed' => false, // после тестовой оплаты и проверки фискализации у ФОП
  'mono_token' => '', // токен эквайринга ФОП; сначала тестовая среда
  'ga4_id' => '', // G-…; включается после согласия
  'meta_pixel_id' => '', // цифры; включается после согласия
  'supplier_contacts' => [], // code => channel (email/telegram), recipient, enabled
  'supplier_sku_map' => [], // RUB-SKU => артикул постачальника; приватно
  'donation_enabled' => false,
  'donation_percent' => 3,
  'donation_schedule' => '',
  'donation_report_url' => '',
  'seller' => [], // переопределения реквизитов из api/seller.php
  'np_card_payment_verified' => false, // Требуется достоверное подтверждение PSP.
];
