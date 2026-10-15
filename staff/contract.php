<?php
declare(strict_types=1);
// Contract-first Staff API (stage 4): contracts/crm/crm-api.json is the single source of routes, permissions,
// step-up, version and idempotency rules and request/response schemas. The router executes it; tests derive the
// RBAC matrix from it; the CRM frontend types are generated from it.

function crmContract(): array {
 static $c=null;
 if($c===null){$c=json_decode((string)file_get_contents(dirname(__DIR__).'/contracts/crm/crm-api.json'),true,64,JSON_THROW_ON_ERROR);}
 return $c;
}
/** Roles granted a permission by the contract. */
function crmContractRoles(string $permission): array {return crmContract()['permissions'][$permission]??[];}

/** Find the route for a method/path; returns [route, params] or null. Unknown methods on a known path → 405. */
function crmRouteMatch(string $method,string $path): ?array {
 $c=crmContract();$known=false;
 foreach($c['routes'] as $r){
  $names=[];
  $regex='~^'.preg_replace_callback('~\{([a-z]+)\}~',function($m)use(&$names,$c){$names[]=$m[1];return '('.trim($c['params'][$m[1]],'^$').')';},$r['path']).'$~D';
  if(!preg_match($regex,$path,$m))continue;
  $known=true;if($r['method']!==$method)continue;
  $params=[];foreach($names as $i=>$n)$params[$n]=$m[$i+1];
  return [$r,$params];
 }
 if($known)throw new CrmError('METHOD_NOT_ALLOWED',405);
 return null;
}

function crmIsObject(mixed $v): bool {return $v instanceof stdClass||is_array($v)&&($v===[]||!array_is_list($v));}
function crmIsList(mixed $v): bool {return is_array($v)&&array_is_list($v);}
function crmProps(mixed $v): array {return $v instanceof stdClass?get_object_vars($v):$v;}

/** Minimal JSON Schema validator for the keywords the CRM contract uses. Returns a list of {path, code}. */
function crmSchemaErrors(mixed $value,array|string $schema,string $path='$',int $depth=0): array {
 if($depth>32)return [['path'=>$path,'code'=>'DEPTH_LIMIT']];
 $defs=crmContract()['definitions'];
 if(is_string($schema))$schema=$defs[$schema]??throw new LogicException('Unknown contract definition '.$schema);
 if(isset($schema['$ref']))return crmSchemaErrors($value,$schema['$ref'],$path,$depth+1);
 $errors=[];$add=function(string $code)use(&$errors,$path){$errors[]=['path'=>$path,'code'=>$code];};
 if(isset($schema['type'])){
  $ok=false;foreach((array)$schema['type'] as $t)$ok=$ok||match($t){'object'=>crmIsObject($value),'array'=>crmIsList($value),'string'=>is_string($value),'integer'=>is_int($value),'number'=>is_int($value)||is_float($value)&&is_finite($value),'boolean'=>is_bool($value),'null'=>$value===null,default=>false};
  if(!$ok)return [['path'=>$path,'code'=>'TYPE']];
 }
 if(array_key_exists('const',$schema)&&$value!==$schema['const'])$add('CONST');
 if(isset($schema['enum'])&&!in_array($value,$schema['enum'],true))$add('ENUM');
 if(is_string($value)){
  $len=mb_strlen($value);
  if(isset($schema['minLength'])&&$len<$schema['minLength'])$add('MIN_LENGTH');
  if(isset($schema['maxLength'])&&$len>$schema['maxLength'])$add('MAX_LENGTH');
  if(isset($schema['pattern'])&&!preg_match('~'.str_replace('~','\~',$schema['pattern']).'~Du',$value))$add('PATTERN');
  if(preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u',$value)||!mb_check_encoding($value,'UTF-8'))$add('CONTROL_CHARACTERS');
 }
 if(is_int($value)||is_float($value)){
  if(isset($schema['minimum'])&&$value<$schema['minimum'])$add('MINIMUM');
  if(isset($schema['maximum'])&&$value>$schema['maximum'])$add('MAXIMUM');
 }
 if(crmIsObject($value)&&!($value instanceof stdClass===false&&isset($schema['items']))){
  $props=crmProps($value);
  foreach($schema['required']??[] as $k)if(!array_key_exists($k,$props))$errors[]=['path'=>$path.'.'.$k,'code'=>'REQUIRED'];
  foreach($props as $k=>$v){
   if(isset($schema['properties'][$k]))$errors=array_merge($errors,crmSchemaErrors($v,$schema['properties'][$k],$path.'.'.$k,$depth+1));
   elseif(($schema['additionalProperties']??true)===false)$errors[]=['path'=>$path.'.'.$k,'code'=>'ADDITIONAL_PROPERTY'];
  }
 }
 if(crmIsList($value)&&!($value===[]&&!isset($schema['items'])&&($schema['type']??null)==='object')){
  if(isset($schema['minItems'])&&count($value)<$schema['minItems'])$add('MIN_ITEMS');
  if(isset($schema['maxItems'])&&count($value)>$schema['maxItems'])$add('MAX_ITEMS');
  if(isset($schema['items']))foreach($value as $i=>$v)$errors=array_merge($errors,crmSchemaErrors($v,$schema['items'],$path.'['.$i.']',$depth+1));
 }
 foreach($schema['allOf']??[] as $part)$errors=array_merge($errors,crmSchemaErrors($value,$part,$path,$depth+1));
 if(isset($schema['anyOf'])){$any=false;foreach($schema['anyOf'] as $part)if(!crmSchemaErrors($value,$part,$path,$depth+1)){$any=true;break;}if(!$any)$add('ANY_OF');}
 return $errors;
}

/** CRM-PHP-01: scalar query fields only; arrays (?q[]=) and invalid values are rejected with a generic 400. */
function crmValidateQuery(array $route,array $query): array {
 foreach($query as $k=>$v)if(!is_string($v))throw new CrmError('INVALID_QUERY',400,['field'=>(string)$k]);
 if(empty($route['query']))return $query;
 $schema=crmContract()['definitions'][$route['query']];$known=array_intersect_key($query,$schema['properties']??[]);
 $errors=crmSchemaErrors($known,$route['query']);
 if($errors)throw new CrmError('INVALID_QUERY',400,['fields'=>array_values(array_unique(array_map(fn($e)=>$e['path'],$errors)))]);
 return $known;
}
/** Strict request body: unknown properties, wrong types, overlong strings, control characters → 400 INVALID_REQUEST. */
function crmValidateBody(array $route,stdClass|array $body): stdClass|array {
 if(empty($route['request']))return $body;
 $errors=crmSchemaErrors($body,$route['request']);
 if($errors)throw new CrmError('INVALID_REQUEST',400,['fields'=>array_values(array_unique(array_map(fn($e)=>$e['path'],$errors)))]);
 return $body;
}
