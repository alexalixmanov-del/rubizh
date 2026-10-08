<?php
declare(strict_types=1);
require_once __DIR__.'/taxonomy.php';

function shopSemanticObject(mixed $value): array {return is_array($value)?$value:(json_decode((string)$value,true)?:[]);}
function shopSemanticParse(array $p): array {
    $data=shopSemanticObject($p['data']??[]);$a=shopNormalizeAttributes(array_replace((array)($data['attributes']??[]),shopSemanticObject($p['attributes']??[])));
    $name=shopTaxonomyNormalize((string)($p['name']??''));$description=shopTaxonomyNormalize(strip_tags((string)($p['description']??'')));
    // Relational tails describe compatibility, purpose or supplied parts. They
    // are evidence, but their nouns cannot compete with the sold object.
    $parts=preg_split('/\s+(?:для|до|під|з|із|зі|на|с)\s+/u',$name,2);$head=preg_split('/\s*\+\s*|[,;.]\s*/u',$parts[0],2)[0];$tail=$parts[1]??'';if(!preg_match('/^комплект\b/u',$head))$head=preg_split('/\s*\(/u',$head,2)[0];
    $types=[
        'costume'=>'\b(?:костюми?|комплект\s+(?:тактичної\s+)?форми|бойовий\s+комплект|форма|комбінезон)\b',
        'pouch'=>'\b(?:підсум(?:ок|ки)|подсум(?:ок|ки)|аптечка-підсумок)\b',
        'ballistic_protection_element'=>'(?:балістичн\w*\s+(?:захист|пакет|фартух)|м[\x{0027}]який\s+балістичн\w*\s+пакет|бронепакет|захист\s+(?:плечей|шиї|паху|стегон|живота|попереку)|бронековдр|балістичн\w*\s+килим|килимок\s+балістичн\w*)',
        'armor_set'=>'(?:бронекомплект|комплект\s+(?:повного\s+)?бронезахисту|комплект\s+захисту\s+живота\s+та\s+паху)',
        'plate'=>'(?:бронеплит\w*|броньован\w*\s+плит\w*)',
        'armor_vest'=>'\bбронежилет\w*', 'carrier'=>'\b(?:плитоноск|плитонок)\w*',
        'mount'=>'(?:\bкріплен\w*|\bадаптер\w*|\bj-arm\b|\bперехідник\w*)',
        'cover'=>'(?:\bчохол\b|\bкавер\b|\bкейс\b|\bфутляр\b)',
        'helmet_suspension'=>'(?:підвісн\w*\s+систем|(?:протиударн\w*|шоломн\w*)\s+подушк\w*)', 'pillow'=>'\bподушк\w*',
        'helmet_rail'=>'(?:\bрейк\w*|\bпланк\w*)',
        'armor_accessory'=>'(?:камербанд\w*|кишен(?:я|і|ю|ь)\b|комплект\s+камербанд\w*)',
        'backpack'=>'\bрюкзак\w*', 'duffel'=>'\bбаул\w*', 'bag'=>'\bсумк\w*', 'hydration'=>'(?:гідратор|питна\s+система)', 'organizer'=>'\bорганайзер\w*',
        'flashlight'=>'(?:ліхтарик|ліхтар|фонарик|фонарь|\bled\s+ламп\w*)',
        'battery'=>'(?:\bакумулятор\b|\bакумуляторна\s+батарея\b|\bбатарейк\w*|\bбатарея\b)',
        'powerbank'=>'(?:повербанк|павербанк|power.?bank)', 'power_station'=>'(?:зарядн\w*\s+станці|блок\s+(?:багатоканальної\s+)?(?:швидкої\s+)?зарядки)',
        'charger'=>'(?:зарядн\w*\s+(?:мульти\s+)?пристрій|модуль\s+живлення)', 'solar_panel'=>'(?:сонячн\w*\s+панел|solar\s+panel)', 'cable'=>'(?:\bкабель\b|\bдріт\b)',
        'memory_card'=>"(?:карта|карти)\\s+пам[\x{0027}]яті", 'camera'=>'(?:екшн-?камера|екшн\s+камера|\bкамера\b)', 'monocular'=>'(?:монокуляр|бінокуляр)',
        'helmet'=>'\b(?:шолом|каска)\b', 'headphones'=>'(?:навушник|навшуник|наушник|беруші)', 'radio'=>'(?:радіостанц|\bраці[яїю])', 'ptt'=>'\bptt\b', 'antenna'=>'\bантен\w*',
        'thermal'=>'(?:термобілиз|термобель|термо\w*\s*(?:футбол|кальсон))', 'shirt'=>'(?:убакс|ubacs|\bсорочк\w*|кітель)',
        'pants'=>'\b(?:штани|брюки|джогер)\b', 'shorts'=>'\bшорти\b', 'jacket'=>'(?:\bкуртк\w*|\bвітровк\w*|\bкуртка\b|анорак|бушлат|пуховик)', 'fleece'=>'(?:\bфліс\b|\bфлис\b|\bкофт\w*|\bхуді\b|толстовк)',
        'tshirt'=>'(?:футболк|\bполо\b|\bмайк\w*|тільняшк|реглан|лонгслів)', 'vest'=>'\bжилет\w*', 'sweater'=>'(?:светр|гольф)', 'rainwear'=>'(?:пончо|дощовик)',
        'gloves'=>'(?:рукавич|рукавиці)', 'balaclava'=>'(?:балаклав|\bбаф\b|\bбафф\b)', 'hat'=>'(?:шапк|кепк|панам|бейсбол)', 'belt'=>'(?:\bремінь\b|\bремень\b|\bпортупея\b|\bпояс\b)',
        'boots'=>'\b(?:берц\w*|берци)\b','shoes'=>'(?:черевик|чобіт|лофер)','sneakers'=>'(?:кросів|кроссов)','socks'=>'шкарпет','gaiters'=>'бахіл','insole'=>'(?:устілк|стельк)',
        'rps'=>'(?:ремінно-плечов\w*\s+систем|розвантажувальн\w*\s+систем|\bрпс\b)','load_bearing'=>'(?:розвантажувальн\w*\s+пояс\b|бойов\w*\s+пояс\b|тактичн\w*\s+пояс\b|war\s+belt)','shoulder_system'=>'(?:плечов\w*\s+систем|плечов\w*\s+лямк)',
        'knee_protection'=>'наколін','elbow_protection'=>'налокіт', 'medical_kit'=>'(?:\bаптечк\w*|\bifak\b)', 'tourniquet'=>'(?:турнікет|джгут)','hemostatic'=>'гемостат','bandage'=>'(?:бандаж|бинт)','shears'=>'ножиц','occlusive'=>'оклюз',
        'net'=>'(?:маскувальн\w*\s+сіт|антидронов\w*\s+сіт|сітка\s+проти\s+дронів)','camouflage_suit'=>'(?:маскувальн\w*\s+костюм|костюм\s+маскувальн\w*)','camouflage_material'=>'(?:маскувальн\w*\s+стріч|маскувальн\w*\s+матеріал)',
        'seat'=>'(?:сидуш|п[\x{0027}]ятиточ|сидіння)','mat'=>'(?:каремат|килимок)','sleeping_bag'=>'спальн\w*\s+мішок','blanket'=>'термоковдр','thermos'=>'\bтермос(?:и|а|ом|ів|у)?\b','burner'=>'пальник','carabiner'=>'карабін',
        'cookware'=>'(?:\bпосуд\b|\bказан\w*|\bкружк\w*|\bчашк\w*)','hygiene'=>'(?:\bрепелент\w*|гігієн|засіб\s+від\s+комах)',
        'weapon_magazine'=>'^магазин\w*','grip'=>'(?:руків[\x{0027}]?я|\bцівк\w*|\bупор\b)','stock'=>'(?:\bприклад\b|\bщок\w*)','bipod'=>'(?:сошк|біпод)','holster'=>'кобур','cleaning'=>'(?:набір\s+(?:для\s+)?чищенн|набір\s+(?:для\s+)?чистк)',
        'glasses'=>'окуляр','mask'=>'\b(?:маска|маски|маску)\b','multitool'=>'мультитул','knife'=>'\b(?:ніж|нож)\b','tool'=>'(?:\bінструмент\w*|\bключ\b)',
        'flag'=>'\bпрапор\w*','water_filter'=>'фільтр\b','shoe_care'=>'(?:\bспрей\b|\bнейтралізатор\b|засіб\b)',
        'pouch_panel'=>'(?:передня\s+панел|панель\b)','shoulder_straps'=>'(?:\bлямк\w*|ремені\s+плечов\w*)',
        'optics_accessory'=>'(?:\bскло\b|\bкришк\w*|кришеч\w*)','generic_accessory'=>'(?:комплект\s+обвіс|набір\s+аксесуар|велкро\s+липучк|болти\s+та\s+гайки)',
        'weapon_part'=>'(?:\bантабк\w*|\bфіксатор\b|буферн\w*\s+трубк|захват-накладк|цілик|мушка|запобіжник|газблок|рукоятка\s+зведення)',
        'medical_marker'=>'маркер\b','beacon'=>'(?:стробоскопічн\w*\s+маркер|маячок)','mosquito_net'=>'антимоскітн\w*\s+сітк','scarf'=>'(?:шарф|арафатк)','mount_optic'=>'(?:\bмаунт\b|риг|ріг)', 'apron'=>'\bфартух\b'
    ];
    $candidates=[];if(preg_match('/^набір\s+для\s+(чищенн|чистк)/u',$name))$candidates['cleaning']=['score'=>100,'phrase'=>'набір для чищення','offset'=>0];
    if(preg_match('/комплект/u',$head)&&preg_match('/шапка/u',$name)&&preg_match('/баф/u',$name))$candidates['hat']=['score'=>100,'phrase'=>'комплект шапка + баф','offset'=>0];
    foreach($types as $type=>$pattern)if(preg_match('/(*UCP)'.$pattern.'/u',$head,$m,PREG_OFFSET_CAPTURE)){
        $offset=mb_strlen(substr($head,0,$m[0][1]));$candidates[$type]=['score'=>max(35,100-$offset),'phrase'=>$m[0][0],'offset'=>$offset];
    }
    // Composite and adjective relationships, rather than rule-list order.
    $dominates=[
        'costume'=>['pants','jacket','shirt','tshirt','fleece'], 'camouflage_suit'=>['costume','net'],
        'pouch'=>['medical_kit','tourniquet','bag','organizer'], 'bag'=>['organizer'], 'cover'=>['helmet','radio','carrier','bag'],
        'ballistic_protection_element'=>['rps','carrier','armor_vest','mat','seat','belt'],
        'armor_accessory'=>['carrier','armor_set'], 'armor_set'=>['carrier','armor_vest','plate'],
        'load_bearing'=>['belt','rps'], 'thermal'=>['tshirt','costume','pants'],
        'powerbank'=>['battery'], 'headphones'=>['helmet'], 'net'=>['camouflage_material'],
        'helmet_suspension'=>['helmet','pillow'], 'helmet_rail'=>['helmet']
    ];
    foreach($dominates as $type=>$secondary)if(isset($candidates[$type]))foreach($secondary as $other)if(isset($candidates[$other])&&$candidates[$type]['offset']<=$candidates[$other]['offset']+3)unset($candidates[$other]);
    if(isset($candidates['jacket'])&&preg_match('/флісов|флисов/u',$head)){$candidates['fleece']=$candidates['jacket'];unset($candidates['jacket']);}
    if(isset($candidates['knee_protection'],$candidates['elbow_protection']))unset($candidates['elbow_protection']);
    if(isset($candidates['seat'])&&preg_match('/п[\x{0027}]ятиточ/u',$name))unset($candidates['mat']);
    if(isset($candidates['shirt'])&&preg_match('/(?:убакс|ubacs)/u',$head))unset($candidates['tshirt']);
    if(isset($candidates['tshirt'])&&preg_match('/(?:^|\s)(?:футболка|поло|майка|тільняш)/u',$head))unset($candidates['shirt']);
    if(isset($candidates['rps'],$candidates['belt'])&&preg_match('/(?:^|\s)(?:пояс|ремінь)/u',$head))unset($candidates['rps']);
    if(isset($candidates['rps'],$candidates['shoulder_system']))unset($candidates['shoulder_system']);
    if(isset($candidates['balaclava'],$candidates['fleece']))unset($candidates['fleece']);
    if(isset($candidates['boots'],$candidates['shoes']))unset($candidates['shoes']);
    if(isset($candidates['seat'])&&preg_match('/каремат[- (]|каремат.*сидін/u',$head))unset($candidates['mat']);
    if(isset($candidates['pouch']))unset($candidates['multitool']);
    if(isset($candidates['belt'],$candidates['load_bearing']))unset($candidates['belt']);
    if(isset($candidates['bag'],$candidates['cover'])&&preg_match('/сумка-чохол/u',$head))unset($candidates['cover']);
    if(isset($candidates['bag'],$candidates['backpack'])&&preg_match('/сумка-рюкзак/u',$head))unset($candidates['bag']);
    if(isset($candidates['hat'],$candidates['balaclava']))unset($candidates['hat']);
    if(isset($candidates['mask'],$candidates['balaclava']))unset($candidates['mask']);
    if(isset($candidates['glasses'],$candidates['mask'])&&preg_match('/окуляри-маска/u',$head))unset($candidates['mask']);
    if(isset($candidates['backpack'],$candidates['bag'])&&preg_match('/рюкзак-сумка/u',$head))unset($candidates['bag']);
    if(isset($candidates['beacon']))unset($candidates['medical_marker']);
    if(isset($candidates['shoulder_system'],$candidates['shoulder_straps']))unset($candidates['shoulder_straps']);
    if(isset($candidates['balaclava'],$candidates['scarf']))unset($candidates['scarf']);
    if(isset($candidates['bag'],$candidates['duffel'])&&preg_match('/сумка\s*-?\s*баул/u',$head))unset($candidates['bag']);
    uasort($candidates,fn($a,$b)=>$b['score']<=>$a['score']);$best=array_key_first($candidates);$scores=array_values($candidates);
    $conflict=count($scores)>1&&abs($scores[0]['score']-$scores[1]['score'])<12;
    if(preg_match('/бронежилет\s*\/\s*плитоноска|плитоноска\s*\/\s*бронежилет/u',$head))$conflict=true;
    $purposes=[];foreach(['medical'=>'медичн|аптеч|ifak','magazines'=>'магаз[иі]н|\bmag\s+pouch','grenades'=>'гранат','tourniquets'=>'турнікет|джгут','radios'=>'раці|радіостанц','phone'=>'телефон|планшет','utility'=>'утилітар|органайзер'] as $key=>$pattern)if(preg_match('/'.$pattern.'/u',$name))$purposes[]=$key;
    $components=[];if($best==='costume'){foreach(['jacket'=>'кітель|курт','pants'=>'штани|брюки','shirt'=>'сороч|убакс'] as $key=>$pattern)if(preg_match('/'.$pattern.'/u',$name))$components[]=$key;}
    $features=[];foreach(['quick_release'=>'швидк\w*\s*(?:скид|скидан)|швидкоскид','rechargeable_battery'=>'акумуляторн','molle'=>'molle','insulated'=>'утеплен|утеплю','assault'=>'штурмов|assault|штурм[\x{0027}\"”]','dump_magazines'=>'(?:скидання|скид|збору)\s+магаз[иі]н|під\s+скидання|dump\s+pouch|mag\s+reset|нерозсипайка'] as $key=>$pattern)if(preg_match('/'.$pattern.'/u',$name))$features[]=$key;
    $derived=[];
    if(empty($a['Сезон'])){foreach(['Зима'=>'зимов|зимн','Демісезон'=>'демісез|демисез','Літо'=>'літн|летн'] as $season=>$pattern)if(preg_match('/'.$pattern.'/u',$name)){$derived['Сезон']=$season;break;}}
    if(empty($a['Клас захисту'])&&preg_match('/(?:^|\s)([1-6])\s*клас(?:у)?\s*(?:захисту|дсту)?/u',$name,$m))$derived['Клас захисту']=$m[1];
    if(empty($a['Розмір плити'])&&$best==='plate'&&preg_match('/\b(\d{2,3})\s*[xх×*]\s*(\d{2,3})\b/u',$name,$m))$derived['Розмір плити']=$m[1].'×'.$m[2];
    $effective=array_replace($derived,$a);
    $semantic=['primary_product_type'=>$conflict?null:$best,'primary_candidates'=>array_keys($candidates),'components'=>$components,'purpose'=>$purposes,'compatible_with'=>$tail?[$tail]:[],'accessory_for'=>in_array($best,['cover','mount','armor_accessory','helmet_rail','helmet_suspension'],true)&&$tail?[$tail]:[],'features'=>$features,'material'=>$effective['Матеріал']??null,'season'=>$effective['Сезон']??null,'gender'=>$effective['Стать']??null,'color'=>$a['Колір']??null,'camouflage'=>$a['Камуфляж']??null,'size'=>$a['Розмір']??null,'protection_class'=>$effective['Клас захисту']??null,'plate_size'=>$effective['Розмір плити']??null,'brand'=>$p['brand']??$a['Бренд']??null,'supplier_category'=>$data['supplier_category']??$p['supplier_category']??null,'supplier_category_path'=>$data['supplier_category_path']??$p['category_path']??$p['category']??''];
    return ['semantic'=>$semantic,'attributes'=>$effective,'derived_attributes'=>$derived,'name'=>$name,'head'=>$head,'description'=>$description,'conflict'=>$conflict,'candidates'=>$candidates,'evidence'=>array_map(fn($type,$signal)=>['source'=>'product_head','type'=>$type,'phrase'=>$signal['phrase'],'decision_score'=>$signal['score']],array_keys($candidates),array_values($candidates))];
}
function shopSemanticCategory(array $parsed): ?string {
    $s=$parsed['semantic'];$type=$s['primary_product_type'];$n=$parsed['name'];$context=shopTaxonomyNormalize($s['supplier_category_path']);$object=implode(' ',$s['compatible_with']);
    $simple=['costume'=>'clothing_costumes','camouflage_suit'=>'camouflage_suits','ballistic_protection_element'=>'armor_soft','armor_set'=>'armor_sets','plate'=>'armor_plates','armor_vest'=>'armor_vests','carrier'=>'armor_carriers','armor_accessory'=>'armor_accessories','helmet'=>'helmets_ballistic','helmet_suspension'=>'helmets_suspension','helmet_rail'=>'helmets_rails','headphones'=>'communications_headphones','radio'=>'communications_radios','ptt'=>'communications_ptt','antenna'=>'communications_antennas','duffel'=>'bags_duffel','hydration'=>'bags_hydration','organizer'=>'bags_organizers','battery'=>'power_batteries','powerbank'=>'power_banks','power_station'=>'power_stations','charger'=>'power_accessories','solar_panel'=>'power_solar','cable'=>'power_cables','memory_card'=>'electronics_memory','camera'=>'electronics_cameras','monocular'=>'electronics_monoculars','thermal'=>'clothing_thermal','shirt'=>'clothing_combat_shirts','pants'=>'clothing_pants','shorts'=>'clothing_shorts','jacket'=>'clothing_jackets','fleece'=>'clothing_fleece','tshirt'=>'clothing_tshirts','vest'=>'clothing_vests','sweater'=>'clothing_sweaters','rainwear'=>'clothing_rainwear','gloves'=>'clothing_gloves','balaclava'=>'clothing_balaclavas','hat'=>'clothing_headwear','boots'=>'footwear_boots','shoes'=>'footwear_shoes','sneakers'=>'footwear_sneakers','socks'=>'footwear_socks','gaiters'=>'footwear_gaiters','insole'=>'footwear_accessories','rps'=>'load_bearing_rps','load_bearing'=>'load_bearing_belts','shoulder_system'=>'load_bearing_shoulder','medical_kit'=>'medical_kits','tourniquet'=>'medical_tourniquets','hemostatic'=>'medical_hemostatics','bandage'=>'medical_bandages','shears'=>'medical_shears','occlusive'=>'medical_occlusive','camouflage_material'=>'camouflage_materials','seat'=>'field_seats','mat'=>'field_mats','sleeping_bag'=>'field_sleeping','blanket'=>'field_blankets','thermos'=>'field_thermos','burner'=>'field_burners','carabiner'=>'field_fasteners','cookware'=>'field_cookware','hygiene'=>'field_hygiene','weapon_magazine'=>'weapon_accessories_magazines','grip'=>'weapon_accessories_grips','stock'=>'weapon_accessories_stocks','bipod'=>'weapon_accessories_bipods','holster'=>'weapon_accessories_holsters','cleaning'=>'weapon_accessories_cleaning','glasses'=>'eye_protection_glasses','mask'=>'eye_protection_masks','multitool'=>'tools_multitools','knife'=>'tools_knives','tool'=>'tools_tools'];
    if($type==='pouch'){
        if(preg_match('/захист\w*\s+(?:живота|паху)|балістичн\w*\s+пакет/u',$object))return 'armor_accessories';
        if(in_array('medical',$s['purpose'],true))return 'pouches_medical';
        if(in_array('utility',$s['purpose'],true)&&in_array('phone',$s['purpose'],true))return 'pouches_phone';
        if(in_array('dump_magazines',$s['features'],true))return 'pouches_dump';
        $purposes=array_intersect($s['purpose'],['tourniquets','grenades','magazines','radios','phone','utility']);
        if(count($purposes)>1){$tail=implode(' ',$s['compatible_with']);foreach(['tourniquets'=>'турнікет|джгут','grenades'=>'гранат','magazines'=>'магаз[иі]н','radios'=>'раці','phone'=>'телефон|планшет'] as $purpose=>$noun)if(preg_match('/^(?:\d+\s+)?(?:'.$noun.')/u',$tail))return 'pouches_'.$purpose;return null;}
        if($purposes)return 'pouches_'.reset($purposes);
        if(preg_match('/напашн/u',$n))return 'pouches_dangler';return 'pouches_other';
    }
    if($type==='backpack')return in_array('assault',$s['features'],true)?'bags_assault':'bags_backpacks';
    if($type==='bag'){
        if(preg_match('/захист\w*\s+(?:живота|паху)/u',$object))return 'armor_accessories';
        if(in_array('dump_magazines',$s['features'],true))return 'pouches_dump';
        if(preg_match('/напашн/u',$n))return 'pouches_dangler';
        if(preg_match('/поясн|бананка/u',$n))return 'bags_waist';
        if(preg_match('/через плече|плечов|однолям/u',$n))return 'bags_shoulder';
        if(preg_match('/органайзер/u',$n))return 'bags_organizers';return 'bags_tactical_bags';
    }
    if($type==='flashlight')return preg_match('/налобн/u',$n)?'lighting_headlamps':(preg_match('/тактичн/u',$n)?'lighting_tactical':'lighting_handheld');
    if($type==='belt')return preg_match('/збр(?:о|ой)|автомат|гвинтів|рушниц|пулемет|ак\b|ar-?15/u',$n.' '.$object.' '.$context)?'weapon_accessories_slings':(preg_match('/рпс|war belt|розвантаж|бойовий/u',$n)?'load_bearing_belts':'clothing_belts');
    if($type==='cover'){
        if(preg_match('/шолом|каск/u',$object.' '.$context)||preg_match('/кавер/u',$n))return 'helmets_covers';
        if(preg_match('/плит|бронежилет|бронезахист/u',$object.' '.$context))return 'armor_accessories';
        if(preg_match('/збро|гвинтів|автомат|пістолет|збройов/u',$object.' '.$context))return 'weapon_accessories_cases';
        if(preg_match('/раці|радіостанц/u',$object.' '.$context))return 'communications_accessories';
        if(preg_match('/смартфон|телефон/u',$object))return 'field_fasteners';
        if(preg_match('/камер/u',$object))return 'electronics_accessories';return null;
    }
    if($type==='mount'){
        if(preg_match('/пнб|nvg|pvs|тепловіз|монокуляр|бінокуляр|dovetail|j-arm/u',$n))return 'electronics_mounts';
        if(preg_match('/atn\s+odin/u',$n))return 'electronics_mounts';
        if(preg_match('/живлення|заряд|usb|xt60/u',$n))return 'power_cables';
        if(preg_match('/раці|навушник/u',$object.' '.$context))return 'communications_accessories';
        if(preg_match('/шолом|каск/u',$object.' '.$context))return 'helmets_mounts';
        if(preg_match('/телефон|смартфон/u',$n))return 'field_fasteners';
        if(str_starts_with($context,'освітлення'))return 'lighting_accessories';
        if(preg_match('/збро|приклад|антабк/u',$n))return 'weapon_accessories_other';
        if(preg_match('/molle|паракорд/u',$n))return 'field_fasteners';return null;
    }
    if($type==='pillow')return preg_match('/шолом|каск/u',$object.' '.$context)?'helmets_suspension':'field_other';
    if($type==='pouch_panel')return preg_match('/магаз[иі]н|плит|molle/u',$n)?'pouches_panels':null;
    if($type==='flag'||$type==='water_filter'&&preg_match('/очищення\s+води/u',$n))return 'field_other';
    if($type==='shoe_care'&&preg_match('/комах|кліщ|комар/u',$n))return 'field_hygiene';
    if($type==='shoe_care')return preg_match('/взутт|замш|нубук|шкір|текстил|waterproof/u',$n)?'footwear_accessories':null;
    if($type==='shoulder_straps')return preg_match('/рпс|ремінно-плеч|пояс/u',$n)?'load_bearing_shoulder':null;
    if($type==='weapon_part')return preg_match('/збро|ar.?15|m.?16|m-lok|qd|magpul|магазин|цілик\s+та\s+мушка/u',$n)?'weapon_accessories_other':null;
    if($type==='optics_accessory')return preg_match('/пнб|pvs|бінокуляр/u',$n)?'electronics_accessories':(preg_match('/ar.?15|гільз/u',$n)?'weapon_accessories_other':null);
    if($type==='generic_accessory')return preg_match('/шолом/u',$n)?'helmets_accessories':(preg_match('/pvs/u',$n)?'electronics_accessories':null);
    if($type==='medical_marker')return preg_match('/турнікет|джгут/u',$n)?'medical_other':null;
    if($type==='beacon')return preg_match('/шолом/u',$n)?'helmets_accessories':null;
    if($type==='mosquito_net')return 'field_hygiene';
    if($type==='scarf')return 'clothing_balaclavas';
    if($type==='mount_optic')return preg_match('/g24|l4|пнб|pvs/u',$n)?'electronics_mounts':null;
    if($type==='mat'&&preg_match('/для сидіння|сидуш|п[\x{0027}]?ятиточ/u',$n))return 'field_seats';
    if($type==='apron')return preg_match('/балістичн|бронепакет/u',$n)?'armor_soft':null;
    if($type==='net')return preg_match('/антидрон|проти\s+дрон/u',$n)?'camouflage_antidrone':'camouflage_nets';
    if(in_array($type,['knee_protection','elbow_protection'],true))return preg_match('/наколін.*налокіт|налокіт.*наколін/u',$n)?'limb_protection_sets':($type==='knee_protection'?'limb_protection_knees':'limb_protection_elbows');
    if(in_array($type,['medical_kit','tourniquet','bandage','hemostatic'],true)&&preg_match('/навчальн|тренувальн/u',$n))return 'medical_training';
    return $simple[$type]??null;
}
function shopSemanticSupplierUnambiguous(string $path,string $id): bool {
    $parts=explode(' / ',$path);$leaf=end($parts);$parsed=shopSemanticParse(['name'=>$leaf]);return count($parsed['candidates'])===1&&!$parsed['conflict']&&shopSemanticCategory($parsed)===$id;
}
function shopSemanticResolve(array $p): array {
    $parsed=shopSemanticParse($p);$category=shopSemanticCategory($parsed);$defs=shopTaxonomyDefinitions();$path=(string)($p['category_path']??$p['category']??'');
    $status=$parsed['conflict']?'REAL_CONFLICT':($category?'AUTO_CONFIRMED_WITH_ATTRIBUTES':'INSUFFICIENT_DATA');$reason=$category?'semantic_primary_product':'insufficient_primary_product';
    if($parsed['conflict']){$category=null;$reason='competing_primary_product_types';}
    if(!$category&&!$parsed['conflict']&&!$parsed['semantic']['primary_product_type']){
        $mapping=shopTaxonomyLegacy($path);$id=shopCanonicalCategoryId($mapping['category_id']??'');
        // Only an unambiguous leaf mapping may supply missing object evidence.
        if(isset($defs[$id])&&$defs[$id]['status']==='active'&&$defs[$id]['parent_id']!==null&&($mapping['decision']??'')!=='manual_review'&&shopSemanticSupplierUnambiguous($path,$id)){$category=$id;$status='SUPPLIER_MAPPING';$reason='unambiguous_supplier_mapping';$parsed['evidence'][]=['source'=>'supplier_category','phrase'=>$path,'category_id'=>$id];}
    }
    if($category&&(!isset($defs[$category])||$defs[$category]['status']!=='active'))throw new RuntimeException('Semantic classifier used an unknown canonical ID');
    return ['category_id'=>$category??'__CATEGORY_REVIEW__','legacy_path'=>$path,'derived_attributes'=>$parsed['derived_attributes'],'filter_attributes'=>$parsed['attributes'],'reason'=>$reason,'status'=>$status,'classifier_version'=>'semantic-v2','semantic'=>$parsed['semantic'],'evidence'=>$parsed['evidence'],'decision_score'=>$category?($parsed['candidates'][$parsed['semantic']['primary_product_type']]['score']??60):0];
}
