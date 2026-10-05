<?php
declare(strict_types=1);
function photoProgress(PDO $db): array {
 $r=$db->query("SELECT COUNT(*) total,COALESCE(SUM(status='ok'),0) ready,COALESCE(SUM(status='pending'),0) pending,COALESCE(SUM(status='error'),0) errors,MIN(CASE WHEN status<>'ok' THEN updated_at END) oldest_waiting FROM photos")->fetch(PDO::FETCH_ASSOC);
 $last=$db->query("SELECT v FROM meta WHERE k='photos_last_progress'")->fetchColumn();$time=$last?:($r['oldest_waiting']??null);$stalled=((int)$r['pending']+(int)$r['errors'])>0&&$time&&strtotime((string)$time.' UTC')<time()-86400;
 return ['total'=>(int)$r['total'],'ready'=>(int)$r['ready'],'pending'=>(int)$r['pending'],'errors'=>(int)$r['errors'],'percent'=>(int)$r['total']?round(100*(int)$r['ready']/(int)$r['total'],1):0,'last_progress'=>$last?:null,'stalled'=>(bool)$stalled];
}
