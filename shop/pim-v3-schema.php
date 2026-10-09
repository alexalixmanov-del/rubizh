<?php
declare(strict_types=1);

// Pure additive schema descriptions. Inclusion and plan inspection never execute SQL.
function pimV3OrderStates(): array {return ['NEW','WAITING_CONFIRMATION','CONFIRMED','CANCELLED','COMPLETED'];}

function pimV3SchemaPlan(): array {
    $steps=[];
    $column=static function(string $table,string $name,string $definition)use(&$steps):void{
        $steps[]=['id'=>$table.'.'.$name,'kind'=>'column','table'=>$table,'name'=>$name,'sql'=>"ALTER TABLE `$table` ADD COLUMN `$name` $definition"];
    };
    foreach(['pim_contract_version'=>'SMALLINT UNSIGNED NULL DEFAULT NULL','pim_model_id'=>'VARCHAR(64) NULL DEFAULT NULL',
        'pim_publication_state'=>"VARCHAR(16) NOT NULL DEFAULT 'LEGACY' CHECK (pim_publication_state IN ('LEGACY','ACTIVE','HIDDEN','ARCHIVED'))",
        'pim_publication_reason'=>'VARCHAR(255) NULL DEFAULT NULL','pim_revision'=>'VARCHAR(64) NULL DEFAULT NULL',
        'pim_usable_photo_count'=>'INT UNSIGNED NULL DEFAULT NULL','pim_media_revision'=>'VARCHAR(64) NULL DEFAULT NULL'] as $name=>$definition)$column('products',$name,$definition);
    foreach(['classification_version'=>1,'category_catalog_version'=>2,'size_catalog_version'=>1,'order_policy_version'=>1,'inventory_policy_version'=>1,'pricing_policy_version'=>1] as $name=>$version)$column('products','pim_'.$name,"SMALLINT UNSIGNED NULL DEFAULT NULL CHECK(pim_$name=$version)");
    foreach(['pim_variant_id'=>'VARCHAR(64)','pim_color_id'=>'VARCHAR(64)','pim_size_system'=>'VARCHAR(32)',
        'pim_size_raw'=>'VARCHAR(120)','pim_size_normalized'=>'VARCHAR(120)','pim_size_display'=>'VARCHAR(120)',
        'pim_size_status'=>'VARCHAR(32)','pim_size_confidence_tier'=>'VARCHAR(16)','pim_source_binding_status'=>'VARCHAR(32)',
        'pim_effective_availability'=>'VARCHAR(32)','pim_stock_status'=>'VARCHAR(32)','pim_stock_quantity'=>'DECIMAL(14,2)',
        'pim_availability_status'=>'VARCHAR(32)','pim_availability_source'=>'VARCHAR(16)','pim_availability_confirmation'=>'VARCHAR(16)',
        'pim_inventory_mode'=>'VARCHAR(32)','pim_inventory_policy_id'=>'VARCHAR(64)','pim_inventory_policy_version'=>'SMALLINT UNSIGNED',
        'pim_stock_observed_at'=>'BIGINT UNSIGNED','pim_source_updated_at'=>'BIGINT UNSIGNED','pim_stock_data_age_hours'=>'DECIMAL(12,2)',
        'pim_stock_warning_hours'=>'DECIMAL(12,2)','pim_expires_at'=>'BIGINT UNSIGNED','pim_delivery_lead_time_days'=>'INT UNSIGNED',
        'pim_revision'=>'VARCHAR(64)'] as $name=>$type){
        $enums=['pim_size_status'=>['EXACT_SIZE','ONE_SIZE','NO_SIZE_REQUIRED','SIZE_CONFIRMATION_REQUIRED'],
            'pim_size_confidence_tier'=>['SAFE_AUTO','LIKELY','AMBIGUOUS'],'pim_source_binding_status'=>['CONFIRMED','CONFIRMATION_REQUIRED'],
            'pim_effective_availability'=>['IN_STOCK','OUT_OF_STOCK','PREORDER','ORDER_ON_REQUEST','UNKNOWN','SIZE_CONFIRMATION_REQUIRED'],
            'pim_stock_status'=>['CONFIRMED','CONFIRMED_BY_STATUS','CONFIRMED_BY_PRESENCE','UNKNOWN'],
            'pim_availability_status'=>['IN_STOCK','OUT_OF_STOCK','PREORDER','ORDER_ON_REQUEST','UNKNOWN'],
            'pim_availability_source'=>['QUANTITY','STATUS','FEED_PRESENCE','MANUAL'],'pim_availability_confirmation'=>['CONFIRMED','UNKNOWN'],
            'pim_inventory_mode'=>['QUANTITY','STATUS','FEED_PRESENCE','NO_AVAILABILITY_SIGNAL']];
        $check=isset($enums[$name])?" CHECK ($name IN ('".implode("','",$enums[$name])."'))":'';
        if(in_array($name,['pim_stock_quantity','pim_stock_data_age_hours'],true))$check=" CHECK ($name >= 0)";
        if($name==='pim_stock_warning_hours')$check=" CHECK ($name > 0)";
        $column('variants',$name,$type.' NULL DEFAULT NULL'.$check);
    }
    foreach(['order_submission_allowed','payment_allowed','requires_order_confirmation','inventory_policy_confirmed','stale_source',
        'ready_to_dispatch','price_ready','binding_confirmation_required','size_confirmation_required','active'] as $f)$column('variants','pim_'.$f,"TINYINT UNSIGNED NULL DEFAULT NULL CHECK (pim_$f IN (0,1))");
    foreach(['pim_photo_id'=>'VARCHAR(64)','pim_media_revision'=>'VARCHAR(64)'] as $f=>$type)$column('photos',$f,$type.' NULL DEFAULT NULL');
    foreach(['pim_order_state'=>'VARCHAR(32)','pim_fulfillment_state'=>'VARCHAR(32)','pim_contract_version'=>'SMALLINT UNSIGNED',
        'pim_catalog_revision'=>'VARCHAR(64)','pim_confirmation_revision'=>'VARCHAR(64)'] as $f=>$type){
        $check=match($f){'pim_order_state'=>" CHECK(pim_order_state IN ('".implode("','",pimV3OrderStates())."'))",'pim_fulfillment_state'=>" CHECK(pim_fulfillment_state IN ('NOT_READY','READY_TO_SHIP','TTN_CREATED','SHIPPED','IN_TRANSIT','DELIVERED'))",default=>''};
        $column('rubizh_customer_orders',$f,$type.' NULL DEFAULT NULL'.$check);
    }
    $index=static function(string $table,string $name,string $columns,bool $unique=false)use(&$steps):void{
        $steps[]=['id'=>$table.'.'.$name,'kind'=>'index','table'=>$table,'name'=>$name,'sql'=>"ALTER TABLE `$table` ADD ".($unique?'UNIQUE ':'')."KEY `$name` ($columns)"];
    };
    $index('products','pim_model_identity','pim_model_id',true);
    $index('variants','pim_sku_owner','product_id,sku',true);
    $index('variants','pim_variant_identity','product_id,pim_variant_id',true);
    $index('variants','pim_color_selection','product_id,pim_color_id,pim_active');
    $table=static function(string $name,string $body)use(&$steps):void{
        $steps[]=['id'=>$name,'kind'=>'table','table'=>$name,'name'=>$name,'sql'=>"CREATE TABLE `$name` ($body) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"];
    };
    $owner='FOREIGN KEY(product_id) REFERENCES products(id)';
    $colorOwner='FOREIGN KEY(product_id,color_id) REFERENCES rubizh_product_colors(product_id,color_id)';
    $table('rubizh_product_colors',"product_id VARCHAR(64) NOT NULL, color_id VARCHAR(64) NOT NULL, color VARCHAR(120) NULL, camouflage VARCHAR(120) NULL, sort INT NOT NULL DEFAULT 0, revision VARCHAR(64) NOT NULL, active TINYINT UNSIGNED NOT NULL DEFAULT 0 CHECK(active IN (0,1)), PRIMARY KEY(product_id,color_id), $owner");
    $table('rubizh_model_photos',"product_id VARCHAR(64) NOT NULL, photo_id INT NOT NULL, sort INT NOT NULL DEFAULT 0, assignment_state VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN' CHECK(assignment_state IN ('UNKNOWN','CONFIRMED')), revision VARCHAR(64) NOT NULL, PRIMARY KEY(product_id,photo_id), $owner, FOREIGN KEY(photo_id) REFERENCES photos(id)");
    $table('rubizh_color_photos',"product_id VARCHAR(64) NOT NULL, color_id VARCHAR(64) NOT NULL, photo_id INT NOT NULL, sort INT NOT NULL DEFAULT 0, revision VARCHAR(64) NOT NULL, assignment_state VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN' CHECK(assignment_state IN ('UNKNOWN','CONFIRMED')), PRIMARY KEY(product_id,color_id,photo_id), $colorOwner, FOREIGN KEY(product_id,photo_id) REFERENCES rubizh_model_photos(product_id,photo_id)");
    $scope="scope VARCHAR(8) NOT NULL CHECK(scope IN ('MODEL','COLOR')), color_id VARCHAR(64) NULL, CHECK((scope='MODEL' AND color_id IS NULL) OR (scope='COLOR' AND color_id IS NOT NULL))";
    $table('rubizh_size_catalogs',"product_id VARCHAR(64) NOT NULL, catalog_id VARCHAR(64) NOT NULL, $scope, size_system VARCHAR(32) NOT NULL, allowed_sizes_json JSON NOT NULL, revision VARCHAR(64) NOT NULL, PRIMARY KEY(product_id,catalog_id), $owner, $colorOwner");
    $table('rubizh_size_options',"product_id VARCHAR(64) NOT NULL, option_id VARCHAR(64) NOT NULL, catalog_id VARCHAR(64) NULL, $scope, size VARCHAR(120) NOT NULL, size_system VARCHAR(32) NULL, revision VARCHAR(64) NOT NULL, active TINYINT UNSIGNED NOT NULL DEFAULT 0 CHECK(active IN (0,1)), variant_sku VARCHAR(64) NULL CHECK(variant_sku IS NULL), supplier_sku VARCHAR(64) NULL CHECK(supplier_sku IS NULL), stock_quantity DECIMAL(14,2) NULL CHECK(stock_quantity IS NULL), effective_availability VARCHAR(32) NOT NULL DEFAULT 'SIZE_CONFIRMATION_REQUIRED' CHECK(effective_availability='SIZE_CONFIRMATION_REQUIRED'), order_submission_allowed TINYINT NOT NULL DEFAULT 1 CHECK(order_submission_allowed=1), payment_allowed TINYINT NOT NULL DEFAULT 0 CHECK(payment_allowed=0), requires_order_confirmation TINYINT NOT NULL DEFAULT 1 CHECK(requires_order_confirmation=1), PRIMARY KEY(product_id,option_id), $owner, $colorOwner, FOREIGN KEY(product_id,catalog_id) REFERENCES rubizh_size_catalogs(product_id,catalog_id)");
    $table('rubizh_pim_batches',"batch_id VARCHAR(64) NOT NULL PRIMARY KEY, content_hash CHAR(64) NOT NULL, contract_version SMALLINT UNSIGNED NOT NULL, pricing_policy_version SMALLINT UNSIGNED NOT NULL, category_hash CHAR(64) NOT NULL, status VARCHAR(16) NOT NULL CHECK(status IN ('RECEIVED','VALIDATED','COMMITTED','REJECTED')), revision VARCHAR(64) NULL, summary_json JSON NULL, error_code VARCHAR(64) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL");
    $table('rubizh_pim_batch_chunks',"batch_id VARCHAR(64) NOT NULL, chunk_no INT UNSIGNED NOT NULL, content_hash CHAR(64) NOT NULL, private_payload MEDIUMTEXT NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(batch_id,chunk_no), FOREIGN KEY(batch_id) REFERENCES rubizh_pim_batches(batch_id)");
    $table('rubizh_pim_legacy_mappings',"mapping_id VARCHAR(64) NOT NULL PRIMARY KEY, legacy_product_id VARCHAR(64) NOT NULL, legacy_variant_id VARCHAR(64) NULL, legacy_sku VARCHAR(64) NULL, legacy_url VARCHAR(700) NULL, legacy_photo_id INT NULL, product_id VARCHAR(64) NULL, color_id VARCHAR(64) NULL, target_sku VARCHAR(64) NULL, mapping_status VARCHAR(16) NOT NULL CHECK(mapping_status IN ('UNKNOWN','CONFIRMED','NEEDS_DECISION')), proof_reference VARCHAR(255) NULL, source_revision VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL, CHECK(mapping_status<>'CONFIRMED' OR (product_id IS NOT NULL AND proof_reference IS NOT NULL)), KEY legacy_product(legacy_product_id), KEY legacy_sku(legacy_sku), $owner, $colorOwner, FOREIGN KEY(product_id,target_sku) REFERENCES variants(product_id,sku)");
    $table('rubizh_pim_history',"id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, batch_id VARCHAR(64) NULL, entity_type VARCHAR(32) NOT NULL, entity_id VARCHAR(128) NOT NULL, operation VARCHAR(32) NOT NULL, before_json JSON NULL, after_json JSON NULL, proof_reference VARCHAR(255) NULL, created_at DATETIME NOT NULL, KEY entity_history(entity_type,entity_id), FOREIGN KEY(batch_id) REFERENCES rubizh_pim_batches(batch_id)");
    $table('rubizh_order_request_selections',"order_id BIGINT UNSIGNED NOT NULL, line_no INT UNSIGNED NOT NULL, product_id VARCHAR(64) NOT NULL, option_id VARCHAR(64) NOT NULL, original_selection_json JSON NOT NULL, resolved_sku VARCHAR(64) NULL, resolution_revision VARCHAR(64) NULL, created_at DATETIME NOT NULL, PRIMARY KEY(order_id,line_no), FOREIGN KEY(order_id) REFERENCES rubizh_customer_orders(id), FOREIGN KEY(product_id,option_id) REFERENCES rubizh_size_options(product_id,option_id), FOREIGN KEY(product_id,resolved_sku) REFERENCES variants(product_id,sku)");
    $steps[]=['id'=>'variants.pim_color_owner','kind'=>'constraint','table'=>'variants','name'=>'pim_color_owner',
        'sql'=>'ALTER TABLE variants ADD CONSTRAINT pim_color_owner FOREIGN KEY(product_id,pim_color_id) REFERENCES rubizh_product_colors(product_id,color_id)'];
    // Ingestion additions, appended so earlier journal entries stay valid.
    $table('rubizh_pim_categories',"category_id VARCHAR(64) NOT NULL PRIMARY KEY, parent_id VARCHAR(64) NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(191) NOT NULL, path VARCHAR(600) NOT NULL, url_path VARCHAR(700) NOT NULL, sort_order INT NOT NULL DEFAULT 0, revision VARCHAR(64) NOT NULL, updated_at DATETIME NOT NULL, UNIQUE KEY pim_category_url(url_path(191))");
    $table('rubizh_pim_category_mappings',"legacy_category_id VARCHAR(64) NOT NULL PRIMARY KEY, pim_category_id VARCHAR(64) NULL, status VARCHAR(16) NOT NULL CHECK(status IN ('PROPOSED','CONFIRMED','REJECTED')), evidence VARCHAR(255) NOT NULL, decided_by VARCHAR(64) NULL, decided_at DATETIME NULL, CHECK(status<>'CONFIRMED' OR pim_category_id IS NOT NULL)");
    $index('variants','pim_submit','product_id,pim_active,pim_order_submission_allowed');
    $index('products','pim_contract_visible','pim_contract_version,visible');
    $index('photos','pim_usable','product_id,status');
    $column('products','pim_kit_slot',"VARCHAR(16) NULL DEFAULT NULL CHECK(pim_kit_slot IN ('head','body','legs','boots','armor','gear','med','small'))");
    $column('rubizh_customer_orders','pim_payment_state',"VARCHAR(24) NULL DEFAULT NULL CHECK(pim_payment_state IN ('UNPAID','PAYMENT_PENDING','PAID','PARTIALLY_REFUNDED','REFUNDED'))");
    return $steps;
}

function pimV3SchemaStepExists(PDO $db,array $step): bool {
    [$sql,$params]=match($step['kind']){
        'table'=>['SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[$step['table']]],
        'column'=>['SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[$step['table'],$step['name']]],
        'index'=>['SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',[$step['table'],$step['name']]],
        'constraint'=>['SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',[$step['table'],$step['name']]],
        default=>throw new LogicException('Unknown foundation step')};
    $q=$db->prepare($sql);$q->execute($params);return (int)$q->fetchColumn()>0;
}

function pimV3SchemaObjectHash(PDO $db,array $step): string {
    if($step['kind']==='table'){
        $row=$db->query('SHOW CREATE TABLE `'.$step['table'].'`')->fetch(PDO::FETCH_NUM);
        $value=preg_replace('/ AUTO_INCREMENT=\d+/','',(string)$row[1]);
    }else{
        [$sql,$params]=match($step['kind']){
            'column'=>['SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[$step['table'],$step['name']]],
            'index'=>['SELECT NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',[$step['table'],$step['name']]],
            'constraint'=>['SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? ORDER BY ORDINAL_POSITION',[$step['table'],$step['name']]],
            default=>throw new LogicException('Unknown foundation step')};
        $q=$db->prepare($sql);$q->execute($params);$value=json_encode($q->fetchAll(PDO::FETCH_ASSOC),JSON_THROW_ON_ERROR);
    }
    return hash('sha256',$value);
}

// Only the explicit isolated CLI/test runner calls this. No auto-migration entry point.
function pimV3ApplyFoundation(PDO $db,?string $approvedDatabase=null): array {
    $name=(string)$db->query('SELECT DATABASE()')->fetchColumn();
    // A named staging/production database is accepted only when the operator CLI passed the same name
    // after a verified backup; otherwise only isolated fixture schemas are allowed.
    if(!preg_match('/^fixture_pim_v3_[a-f0-9]{8,32}$/D',$name)&&($approvedDatabase===null||$approvedDatabase!==$name))throw new RuntimeException('Isolated fixture schema required');
    $version=(string)$db->query('SELECT VERSION()')->fetchColumn();
    if(str_contains($version,'MariaDB')?version_compare($version,'10.6','<'):version_compare($version,'8.0.16','<'))throw new RuntimeException('Enforced CHECK constraints required');
    foreach(['products','variants','photos','rubizh_customer_orders'] as $t)if(!pimV3SchemaStepExists($db,['kind'=>'table','table'=>$t]))throw new RuntimeException('Prepared legacy schema required');
    if($db->inTransaction())throw new RuntimeException('DDL cannot run inside a business transaction');
    $meta=$db->query("SELECT k,v FROM meta WHERE k IN ('schema','runtime_schema')")->fetchAll(PDO::FETCH_KEY_PAIR);
    if(($meta['schema']??'')!=='4'||($meta['runtime_schema']??'')!=='20261008-v1')throw new RuntimeException('Prepared pricing schema4 required');
    $defaultCollation=$db->query("SELECT DEFAULT_COLLATE_NAME FROM information_schema.CHARACTER_SETS WHERE CHARACTER_SET_NAME='utf8mb4'")->fetchColumn();
    $check=$db->prepare('SELECT COLUMN_TYPE,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');
    foreach(['products'=>['id'=>'varchar(64)','price_min'=>'decimal(14,2)','price_max'=>'decimal(14,2)'],
        'variants'=>['product_id'=>'varchar(64)','sku'=>'varchar(64)','price'=>'decimal(14,2)','kit_price'=>'decimal(14,2)'],
        'photos'=>['id'=>'int','product_id'=>'varchar(64)'],'rubizh_customer_orders'=>['id'=>'bigint unsigned','total'=>'decimal(12,2)']] as $t=>$columns){
        foreach($columns as $c=>$expected){$check->execute([$t,$c]);$actual=$check->fetch(PDO::FETCH_ASSOC);
            $type=$actual?preg_replace('/\((?:11|20)\)/','',$actual['COLUMN_TYPE']):'';
            if($type!==$expected||str_starts_with($expected,'varchar')&&$actual['COLLATION_NAME']!==$defaultCollation)throw new RuntimeException('Legacy type/collation preflight failed');
        }
    }
    $lock=$db->prepare('SELECT GET_LOCK(?,0)');$lock->execute([$name.':pim-v3-foundation']);
    if((int)$lock->fetchColumn()!==1)throw new RuntimeException('Foundation migration already running');
    try{
        $db->exec('CREATE TABLE IF NOT EXISTS rubizh_pim_foundation_journal (step_id VARCHAR(128) PRIMARY KEY, sql_hash CHAR(64) NOT NULL, object_hash CHAR(64) NOT NULL, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $read=$db->prepare('SELECT sql_hash,object_hash FROM rubizh_pim_foundation_journal WHERE step_id=?');
        $write=$db->prepare('INSERT INTO rubizh_pim_foundation_journal(step_id,sql_hash,object_hash,applied_at) VALUES(?,?,?,UTC_TIMESTAMP())');
        $applied=[];
        foreach(pimV3SchemaPlan() as $s){
            $hash=hash('sha256',$s['sql']);$read->execute([$s['id']]);$saved=$read->fetch(PDO::FETCH_ASSOC);$exists=pimV3SchemaStepExists($db,$s);
            if($saved!==false){if($saved['sql_hash']!==$hash||!$exists||$saved['object_hash']!==pimV3SchemaObjectHash($db,$s))throw new RuntimeException('Foundation journal/schema conflict: '.$s['id']);continue;}
            // Existing unjournaled objects may be from interrupted DDL: do not guess their definition.
            if($exists)throw new RuntimeException('Unjournaled foundation object requires explicit review: '.$s['id']);
            $db->exec($s['sql']);$write->execute([$s['id'],$hash,pimV3SchemaObjectHash($db,$s)]);$applied[]=$s['id'];
        }
        $db->exec("INSERT INTO meta(k,v) VALUES('pim_v3_schema','2') ON DUPLICATE KEY UPDATE v=VALUES(v)");
        return ['applied'=>$applied,'schema_version'=>'pim-v3-foundation-2','sync_enabled'=>false];
    }finally{$q=$db->prepare('SELECT RELEASE_LOCK(?)');$q->execute([$name.':pim-v3-foundation']);}
}
