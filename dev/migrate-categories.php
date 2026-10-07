<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);require __DIR__.'/../shop/taxonomy-migration.php';
$options=getopt('', ['apply','rollback:','report:']);$db=db();
if(isset($options['rollback'])){shopTaxonomyRollback($db,(string)$options['rollback']);echo "Category migration rolled back; product rows and media were preserved.\n";exit;}
if(isset($options['apply']))$report=shopTaxonomyApply($db,dirname(dirname(__DIR__)).'/rubizh-private-backups');else $report=shopTaxonomyPlan($db);
if(isset($options['report']))shopTaxonomyExport($report,(string)$options['report']);
echo json_encode(['mode'=>isset($options['apply'])?'apply':'dry-run','before'=>$report['before'],'after'=>$report['after']??null,'assigned'=>count($report['relations']),'review'=>count($report['review']),'unassigned'=>$report['unassigned_products'],'potential_duplicate_groups'=>count($report['potential_duplicates']),'LOST_PRODUCTS'=>$report['LOST_PRODUCTS']??null,'LOST_VARIANTS'=>$report['LOST_VARIANTS']??null,'UNEXPECTED_DUPLICATES'=>$report['UNEXPECTED_DUPLICATES']??null,'backup'=>$report['backup']??null],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
