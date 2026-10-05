<?php
declare(strict_types=1);
require_once __DIR__.'/lib.php';
function rubizhSellerDefaults(): array {return ['name'=>'ФОП Мєшалкін Андрій Леонідович','tax_id'=>'2837300592','iban'=>'UA943220010000026004380084907','bank'=>'УНІВЕРСАЛ БАНК','mfo'=>'322001','bank_tax_id'=>'21133352','address'=>'Україна, 18007, м. Черкаси, вул. Смілянська, 23/1','email'=>'info@rubizh.shop','phone'=>'+380976867892','phone_label'=>'+380 97 686 78 92'];}
function rubizhSeller(): array {$defaults=rubizhSellerDefaults();$c=is_file(__DIR__.'/config.php')?(cfg('seller')??[]):[];return array_replace($defaults,array_intersect_key(is_array($c)?$c:[],$defaults));}
function rubizhSellerHtml(string $html): string {$defaults=rubizhSellerDefaults();$seller=rubizhSeller();$map=[];foreach($defaults as $k=>$v)if($seller[$k]!==$v)$map[$v]=htmlspecialchars((string)$seller[$k],ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');return strtr($html,$map);}
