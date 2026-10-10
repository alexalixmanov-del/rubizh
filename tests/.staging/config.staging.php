<?php // Staging only (isolated MySQL 8 with the production SITE dump). Never use in production.
return ['db_host'=>'localhost','db_name'=>'prodcopy','db_user'=>'root','db_pass'=>'','pim_key'=>'staging-pim-key-at-least-24-characters-long',
 'cache_dir'=>'/tmp/claude-0/staging/cache','media_dir'=>'/tmp/claude-0/staging/media','media_url'=>'/media',
 'environment'=>'staging','mono_mock'=>true,'staging_allow_loopback'=>true,'pim_v3_sync'=>true];
