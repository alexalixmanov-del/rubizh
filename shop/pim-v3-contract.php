<?php
declare(strict_types=1);

// Offline foundation only. No config, PDO, router, publication or checkout side effects.
require_once __DIR__.'/pricing-policy.php';

function pimV3FoundationPolicy(): array {
    return ['foundation_version'=>1, 'sync_enabled'=>false, 'capabilities_advertised'=>[],
        'mixed_cart'=>['confirmation_state'=>'WAITING_CONFIRMATION', 'payment_strategy'=>'SINGLE_ORDER_PAYMENT_AFTER_CONFIRMATION', 'automatic_split'=>false]];
}

function pimV3PinnedSchema(): array {
    $path=dirname(__DIR__).'/contracts/pim-v3/1/category-size-export.schema.json';
    if(hash_file('sha256',$path)!=='12206d40acc471972ab9e67efb796839c5d4bdb1fc557329af49103dd46836e2')throw new RuntimeException('Pinned PIM schema hash mismatch');
    return json_decode((string)file_get_contents($path),true,64,JSON_THROW_ON_ERROR);
}

/** Interpreter for every keyword in the pinned draft-07 schema; unknown keywords fail closed.
 * Not a general-purpose JSON Schema implementation. Objects must be stdClass, arrays lists.
 */
function pimV3SchemaErrors(mixed $value,array $schema,string $path='$',int $depth=0): array {
    if($depth>64)return [['path'=>$path,'code'=>'DEPTH_LIMIT']];
    $supported=['$schema','$id','type','required','properties','not','allOf','const','enum','items','uniqueItems','additionalProperties','minLength','minimum','exclusiveMinimum','if','then','contains'];
    foreach(array_keys($schema) as $key)if(!in_array($key,$supported,true))throw new LogicException('Unsupported pinned schema keyword: '.$key);
    $errors=[];$add=static function(string $code)use(&$errors,$path):void{$errors[]=['path'=>$path,'code'=>$code];};
    $type=static fn($v,$t)=>match($t){'object'=>$v instanceof stdClass,'array'=>is_array($v)&&array_is_list($v),'string'=>is_string($v),'number'=>is_int($v)||is_float($v)&&is_finite($v),'integer'=>is_int($v)||is_float($v)&&is_finite($v)&&floor($v)===$v,'boolean'=>is_bool($v),'null'=>$v===null,default=>throw new LogicException('Unsupported schema type')};
    $equal=static function($a,$b)use(&$equal):bool{
        if(is_numeric($a)&&is_numeric($b)&&!is_string($a)&&!is_string($b))return $a==$b;
        if($a instanceof stdClass)$a=get_object_vars($a);
        if($b instanceof stdClass)$b=get_object_vars($b);
        if(is_array($a)&&is_array($b)){
            if(array_is_list($a)!==array_is_list($b)||count($a)!==count($b))return false;
            foreach($a as $k=>$v)if(!array_key_exists($k,$b)||!$equal($v,$b[$k]))return false;
            return true;
        }
        return $a===$b;
    };
    if(isset($schema['type'])&&!array_filter((array)$schema['type'],fn($t)=>$type($value,$t)))$add('TYPE');
    if(array_key_exists('const',$schema)&&!$equal($value,$schema['const']))$add('CONST');
    if(isset($schema['enum'])&&!array_filter($schema['enum'],fn($x)=>$equal($value,$x)))$add('ENUM');
    if(is_string($value)&&isset($schema['minLength'])&&preg_match_all('/./us',$value)<$schema['minLength'])$add('MIN_LENGTH');
    if(is_int($value)||is_float($value)){
        if(!is_finite((float)$value))$add('FINITE_NUMBER');
        if(isset($schema['minimum'])&&$value<$schema['minimum'])$add('MINIMUM');
        if(isset($schema['exclusiveMinimum'])&&$value<=$schema['exclusiveMinimum'])$add('EXCLUSIVE_MINIMUM');
    }
    if($value instanceof stdClass){
        foreach($schema['required']??[] as $k)if(!property_exists($value,$k))$errors[]=['path'=>$path.'.'.$k,'code'=>'REQUIRED'];
        foreach(get_object_vars($value) as $k=>$v){
            if(isset($schema['properties'][$k]))$errors=array_merge($errors,pimV3SchemaErrors($v,$schema['properties'][$k],$path.'.'.$k,$depth+1));
            elseif(($schema['additionalProperties']??true)===false)$add('ADDITIONAL_PROPERTY');
        }
    }
    if(is_array($value)){
        foreach($value as $k=>$v){
            if(isset($schema['items']))$errors=array_merge($errors,pimV3SchemaErrors($v,$schema['items'],$path.'['.$k.']',$depth+1));
            if(!empty($schema['uniqueItems']))foreach(array_slice($value,0,$k) as $earlier)if($equal($earlier,$v)){$add('UNIQUE_ITEMS');break;}
        }
        if(isset($schema['contains'])&&!array_filter($value,fn($x)=>pimV3SchemaErrors($x,$schema['contains'],$path,$depth+1)===[]))$add('CONTAINS');
    }
    foreach($schema['allOf']??[] as $part)$errors=array_merge($errors,pimV3SchemaErrors($value,$part,$path,$depth+1));
    if(isset($schema['not'])&&pimV3SchemaErrors($value,$schema['not'],$path,$depth+1)===[])$add('NOT');
    if(isset($schema['if'])&&pimV3SchemaErrors($value,$schema['if'],$path,$depth+1)===[])$errors=array_merge($errors,pimV3SchemaErrors($value,$schema['then']??[],$path,$depth+1));
    return array_slice($errors,0,100);
}

function pimV3Identifier(mixed $value): bool {return is_string($value)&&preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/D',$value)===1;}
function pimV3PhotoUrl(mixed $value): bool {
    if(!is_string($value)||strlen($value)>2048||preg_match('/[\x00-\x20\\\\]/',$value))return false;
    $u=parse_url($value);
    return is_array($u)&&($u['scheme']??'')==='https'&&!isset($u['user'])&&!isset($u['pass'])
        &&isset($u['host'])&&preg_match('/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/D',$u['host'])===1
        &&!preg_match('/(?:^|\.)(?:localhost|local|internal|test|invalid)$/i',$u['host'])&&(!isset($u['port'])||$u['port']===443);
}

/** Offline private-wire validation. Does not authorize publication, payment or a sync capability. */
function pimV3ValidateJson(string $json): array {
    if(strlen($json)>8*1024*1024)return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'BYTE_LIMIT']]];
    try{$batch=json_decode($json,false,64,JSON_THROW_ON_ERROR);}catch(JsonException){return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'INVALID_JSON']]];}
    $errors=[];$add=static function(string $path,string $code)use(&$errors):void{if(count($errors)<100)$errors[]=['path'=>$path,'code'=>$code];};
    if(!$batch instanceof stdClass||($batch->contract_version??null)!==3||($batch->pricing_policy_version??null)!==1||!is_array($batch->models??null)||!array_is_list($batch->models)||count($batch->models)>1000)return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'BATCH_CONTRACT']]];
    $schema=pimV3PinnedSchema();$models=[];$skus=[];
    foreach($batch->models as $i=>$model){
        $p='$.models['.$i.']';
        if($model instanceof stdClass){
            $bounded=true;
            foreach(['variants'=>5000,'colors'=>256,'size_options'=>1024,'size_catalogs'=>256] as $list=>$limit)if(is_array($model->$list??null)&&count($model->$list)>$limit)$bounded=false;
            foreach(is_array($model->size_catalogs??null)?$model->size_catalogs:[] as $catalog)if($catalog instanceof stdClass&&is_array($catalog->allowed_sizes??null)&&count($catalog->allowed_sizes)>256)$bounded=false;
            if(!$bounded){$add($p,'ENTITY_LIMIT');continue;}
        }
        $schemaErrors=pimV3SchemaErrors($model,$schema,$p);
        $errors=array_slice(array_merge($errors,$schemaErrors),0,100);
        if($schemaErrors!==[])continue;
        $m=get_object_vars($model);
        if(!pimV3Identifier($m['id'])||$m['id']!==$m['model_id']||isset($models[strtolower($m['id'])]))$add($p.'.model_id','MODEL_IDENTITY');
        $models[strtolower($m['id'])]=true;
        if(($m['pricing_policy_version']??null)!==1)$add($p,'PRICING_VERSION');
        if(!is_string($m['marketing_name_uk']??null)||trim($m['marketing_name_uk'])===''||strlen($m['marketing_name_uk'])>2000)$add($p,'MARKETING_NAME');
        if(!in_array($m['publication_state']??null,['ACTIVE','HIDDEN','ARCHIVED'],true))$add($p,'PUBLICATION_STATE');
        $colors=[];$colorKeys=[];
        foreach($m['colors'] as $j=>$color){
            $cp=$p.'.colors['.$j.']';
            if(!$color instanceof stdClass||!pimV3Identifier($color->id??null)||!is_array($color->photos??null)){$add($cp,'COLOR_CONTRACT');continue;}
            if(isset($colorKeys[strtolower($color->id)]))$add($cp,'DUPLICATE_COLOR');
            $colorKeys[strtolower($color->id)]=true;
            $colors[$color->id]=array_fill_keys(array_filter($color->photos,'is_string'),true);
            foreach($color->photos as $url)if(!pimV3PhotoUrl($url))$add($cp.'.photos','UNSAFE_PHOTO_URL');
            foreach(['color','camouflage'] as $f)if(isset($color->$f)&&(!is_string($color->$f)||strlen($color->$f)>480))$add($cp.'.'.$f,'COLOR_LABEL');
            if(isset($color->variant_skus)&&(!is_array($color->variant_skus)||array_filter($color->variant_skus,fn($sku)=>!pimV3Identifier($sku))))$add($cp.'.variant_skus','COLOR_SKU_LIST');
        }
        foreach(['size_catalogs'=>'catalog_id','size_options'=>'option_id'] as $list=>$idField){
            $seen=[];
            foreach($m[$list] as $j=>$item){
                $ip=$p.'.'.$list.'['.$j.']';
                if(!pimV3Identifier($item->$idField)||isset($seen[strtolower($item->$idField)]))$add($ip,'SIZE_IDENTITY');
                $seen[strtolower($item->$idField)]=true;
                $color=$item->color_id??null;
                if($item->scope==='MODEL'&&$color!==null||$item->scope==='COLOR'&&(!is_string($color)||!isset($colors[$color])))$add($ip,'SIZE_SCOPE_OWNERSHIP');
                foreach(($list==='size_catalogs'?$item->allowed_sizes:[$item->size]) as $size)if(trim($size)===''||strlen($size)>120)$add($ip,'SIZE_LABEL');
                if(isset($item->size_system)&&(!is_string($item->size_system)||strlen($item->size_system)>32))$add($ip,'SIZE_SYSTEM');
            }
        }
        $variantIds=[];
        foreach($m['variants'] as $j=>$v){
            $vp=$p.'.variants['.$j.']';
            if(!pimV3Identifier($v->sku)||isset($skus[strtolower($v->sku)]))$add($vp.'.sku','SKU_OWNERSHIP');
            $skus[strtolower($v->sku)]=$m['id'];
            if($v->color_id!==null&&!isset($colors[$v->color_id]))$add($vp.'.color_id','ORPHAN_COLOR');
            if($v->payment_allowed&&($v->binding_confirmation_required||$v->size_confirmation_required))$add($vp,'CONFIRMATION_PERMISSION_CONFLICT');
            foreach($v->photos as $url){
                if(!pimV3PhotoUrl($url))$add($vp.'.photos','UNSAFE_PHOTO_URL');
                if($v->color_id!==null&&!isset($colors[$v->color_id][$url]))$add($vp.'.photos','PHOTO_COLOR_OWNERSHIP');
            }
            foreach(['variant_id'] as $f)if(isset($v->$f)&&!pimV3Identifier($v->$f))$add($vp.'.'.$f,'VARIANT_IDENTITY');
            if(isset($v->variant_id)&&is_string($v->variant_id)){
                if(isset($variantIds[strtolower($v->variant_id)]))$add($vp,'DUPLICATE_VARIANT_ID');
                $variantIds[strtolower($v->variant_id)]=true;
            }
            foreach(['size_raw','size_display','size_normalized','size_system','size_type','size_alpha','size_fit','size_height'] as $f)if(isset($v->$f)&&(!is_string($v->$f)||strlen($v->$f)>120))$add($vp.'.'.$f,'SIZE_METADATA');
            if($v->stock!==$v->stock_quantity&&$v->stock!=$v->stock_quantity)$add($vp,'QUANTITY_DISAGREEMENT');
            if($v->stock_quantity!==null)try{shopMoney($v->stock_quantity);}catch(ShopPricingException){$add($vp,'QUANTITY_PRECISION');}
            if($v->availability_source==='QUANTITY'&&$v->inventory_mode!=='QUANTITY')$add($vp,'INVENTORY_MODE');
            if($v->availability==='OUT_OF_STOCK'&&$v->availability_source==='QUANTITY'&&$v->stock_quantity!==0&&$v->stock_quantity!==0.0)$add($vp,'OUT_OF_STOCK_QUANTITY');
            // No fallback from root pricing or supplier prices: catch the pinned export's G02 loss.
            $a=json_decode(json_encode($v,JSON_THROW_ON_ERROR),true,64,JSON_THROW_ON_ERROR);
            if(($a['pricing_policy_version']??null)!==1||!array_key_exists('site_price',$a)||!array_key_exists('price',$a)){$add($vp,'PRICING_V1_FIELDS');continue;}
            try{
                if($v->price_ready){$policy=shopPricingPolicy($a);if($policy===null)$add($vp,'PRICING_V1_FIELDS');}
                else foreach(['price','site_price'] as $f)if($a[$f]!==null)shopMoney($a[$f]);
                if(!$v->price_ready&&$a['price']!==$a['site_price'])$add($vp,'PRICING_DISAGREEMENT');
            }catch(ShopPricingException){$add($vp,'PRICING_POLICY');}
        }
        foreach($m['colors'] as $color)if($color instanceof stdClass&&isset($color->variant_skus)&&is_array($color->variant_skus)){
            $expected=[];
            foreach($m['variants'] as $variant)if($variant->color_id===($color->id??null))$expected[]=$variant->sku;
            $actual=$color->variant_skus;sort($expected);sort($actual);
            if($actual!==$expected)$add($p.'.colors','COLOR_SKU_OWNERSHIP');
        }
    }
    return ['valid'=>$errors===[],'errors'=>$errors,'model_count'=>count($batch->models),'sku_count'=>count($skus)];
}

/** Explicit legacy mapping validator; produces no guessed targets, redirects or catalog writes. */
function pimV3ValidateMappingJson(string $mappingJson,string $batchJson): array {
    $batchResult=pimV3ValidateJson($batchJson);
    if(!$batchResult['valid'])return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'INVALID_TARGET_CONTRACT']]];
    if(strlen($mappingJson)>8*1024*1024)return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'BYTE_LIMIT']]];
    try{$mapping=json_decode($mappingJson,true,64,JSON_THROW_ON_ERROR);}catch(JsonException){return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'INVALID_JSON']]];}
    if(!is_array($mapping)||($mapping['mapping_version']??null)!==1||!is_array($mapping['entries']??null)||!array_is_list($mapping['entries'])||count($mapping['entries'])>20000)return ['valid'=>false,'errors'=>[['path'=>'$','code'=>'MAPPING_CONTRACT']]];
    $models=[];
    foreach(json_decode($batchJson,true,64,JSON_THROW_ON_ERROR)['models'] as $m)$models[$m['model_id']]=$m;
    $errors=[];$seen=[];
    foreach($mapping['entries'] as $i=>$e){
        $path='$.entries['.$i.']';$bad=static function(string $code)use(&$errors,$path):void{if(count($errors)<100)$errors[]=['path'=>$path,'code'=>$code];};
        if(!is_array($e)||!pimV3Identifier($e['mapping_id']??null)||!pimV3Identifier($e['legacy_product_id']??null)||!in_array($e['mapping_status']??null,['CONFIRMED','UNKNOWN','NEEDS_DECISION'],true)){$bad('MAPPING_IDENTITY');continue;}
        if(isset($seen[$e['mapping_id']]))$bad('DUPLICATE_MAPPING');$seen[$e['mapping_id']]=true;
        $refsValid=true;
        foreach(['legacy_sku','legacy_variant_id','model_id','color_id','variant_sku'] as $key)if(isset($e[$key])&&!pimV3Identifier($e[$key])){$bad('MAPPING_REFERENCE');$refsValid=false;}
        if(!$refsValid)continue;
        if($e['mapping_status']!=='CONFIRMED'){
            // Unknown photos/SKU remain unresolved, not assigned by a guessed model or colour.
            foreach(['model_id','color_id','variant_sku','redirect_url'] as $key)if(($e[$key]??null)!==null)$bad('UNCONFIRMED_TARGET');
            continue;
        }
        if(!is_array($e['evidence_refs']??null)||!array_is_list($e['evidence_refs'])||$e['evidence_refs']===[]||array_filter($e['evidence_refs'],fn($v)=>!is_string($v)||trim($v)===''))$bad('MAPPING_PROOF_REQUIRED');
        $m=$models[$e['model_id']??'']??null;
        if($m===null){$bad('ORPHAN_MODEL');continue;}
        $colors=array_column($m['colors'],null,'id');$color=$e['color_id']??null;
        if($color!==null&&!isset($colors[$color]))$bad('ORPHAN_COLOR');
        $sku=$e['variant_sku']??null;
        if($sku!==null){$variants=array_column($m['variants'],null,'sku');if(!isset($variants[$sku])||$variants[$sku]['color_id']!==$color)$bad('SKU_OWNERSHIP');}
        if(isset($e['legacy_sku'])&&$sku===null)$bad('SKU_TARGET_REQUIRED');
        if(isset($e['photo_url'])&&(!pimV3PhotoUrl($e['photo_url'])||$color===null||!in_array($e['photo_url'],$colors[$color]['photos']??[],true)))$bad('PHOTO_ASSIGNMENT');
        foreach(['legacy_url','redirect_url'] as $key)if(isset($e[$key])&&(!is_string($e[$key])||strlen($e[$key])>700||!preg_match('~^/product/[A-Za-z0-9_-]+(?:\?color=[A-Za-z0-9_.:-]+)?$~D',$e[$key])))$bad('LOCAL_PRODUCT_URL_REQUIRED');
    }
    return ['valid'=>$errors===[],'errors'=>$errors,'mapping_count'=>count($mapping['entries'])];
}

/** Public DTO foundation. Explicit whitelist + computed public pricing; never copy sources/raw evidence. */
function pimV3PublicDto(string $json): array {
    $result=pimV3ValidateJson($json);
    if(!$result['valid'])throw new InvalidArgumentException('Invalid private PIM foundation contract');
    $batch=json_decode($json,true,64,JSON_THROW_ON_ERROR);$out=[];
    $pick=static function(array $a,array $keys):array{return array_intersect_key($a,array_fill_keys($keys,true));};
    foreach($batch['models'] as $m){
        $public=$pick($m,['id','model_id','marketing_name_uk','canonical_category_id','publication_state','availability','order_submission_allowed','payment_allowed','requires_order_confirmation']);
        // Strings only; nested objects under marketing fields cannot smuggle private data.
        foreach(['brand','description'] as $key)if(is_string($m[$key]??null))$public[$key]=$m[$key];
        $public['colors']=array_map(fn($c)=>$pick($c,['id','color','camouflage','photos']),$m['colors']);
        $public['size_catalogs']=array_map(fn($s)=>$pick($s,['catalog_id','scope','color_id','size_system','allowed_sizes']),$m['size_catalogs']);
        $public['size_options']=array_map(fn($s)=>$pick($s,['option_id','scope','color_id','size','variant_sku','availability','order_submission_allowed','payment_allowed','requires_order_confirmation']),$m['size_options']);
        $public['variants']=[];
        foreach($m['variants'] as $v){
            $item=$pick($v,['sku','variant_id','color_id','photos','size_status','size_raw','size_display','size_normalized','size_system','size_type','size_alpha','size_fit','size_height','availability','order_submission_allowed','payment_allowed','requires_order_confirmation','stock_quantity','delivery_lead_time_days','ready_to_dispatch']);
            $item=array_merge($item,$v['price_ready']?shopPricingPublic(shopPricingPolicy($v)):['price'=>null,'site_price'=>null,'kit_price'=>null,'wholesale'=>[]]);
            $public['variants'][]=$item;
        }
        $out[]=$public;
    }
    return ['models'=>$out];
}
