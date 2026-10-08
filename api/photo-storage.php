<?php
declare(strict_types=1);
// Only generated public product images receive public permissions. Private
// settings, logs, arbitrary media files and symlinks are never changed.
function photo_public_directory(string $dir): void {
    if (is_link($dir)) throw new RuntimeException('Неприпустима папка фото');
    if (!is_dir($dir) && !@mkdir($dir,0755,true)) throw new RuntimeException('Папка фото недоступна');
    if (!@chmod($dir,0755)) throw new RuntimeException('Права папки фото недоступні');
}
function photo_storage_directory(): string {
    $root=rtrim((string)cfg('media_dir'),'/');
    if($root===''||$root==='/')throw new RuntimeException('Неприпустима папка media');
    photo_public_directory($root);photo_public_directory($root.'/p');
    return $root.'/p';
}
function repair_photo_permissions(): array {
    $dir=photo_storage_directory();$fixed=0;$skipped=0;
    foreach(glob($dir.'/*',GLOB_ONLYDIR)?:[] as $sub){
        if(!preg_match('/^[a-f0-9]{2}$/D',basename($sub))||is_link($sub)){$skipped++;continue;}
        photo_public_directory($sub);
        foreach(glob($sub.'/*.webp')?:[] as $file){
            if(!preg_match('/^[a-f0-9]{40}(?:-t)?\.webp$/D',basename($file))||is_link($file)||!is_file($file)){$skipped++;continue;}
            if(!@chmod($file,0644))throw new RuntimeException('Права фото недоступні');
            $fixed++;
        }
    }
    return ['public_photo_files'=>$fixed,'skipped'=>$skipped];
}
function save_photo_webp(string $bin,string $hash,string $dir): array {
    if(!preg_match('/^[a-f0-9]{40}$/D',$hash))throw new RuntimeException('Неприпустимий ключ фото');
    $dimensions=@getimagesizefromstring($bin);
    if(!$dimensions||$dimensions[0]<1||$dimensions[1]<1||$dimensions[0]>12000||$dimensions[1]>12000||$dimensions[0]*$dimensions[1]>16000000)throw new RuntimeException('Неприпустимий розмір фото');
    $img=@imagecreatefromstring($bin);if(!$img)throw new RuntimeException('Це не картинка');
    $w=imagesx($img);$h=imagesy($img);$sub=substr($hash,0,2);
    photo_public_directory(dirname($dir));photo_public_directory($dir);photo_public_directory($dir.'/'.$sub);
    try{
        $save=function(int $max,string $suffix)use($img,$w,$h,$dir,$sub,$hash){
            $k=min(1,$max/max($w,$h));$nw=max(1,(int)round($w*$k));$nh=max(1,(int)round($h*$k));
            $dst=imagecreatetruecolor($nw,$nh);imagealphablending($dst,false);imagesavealpha($dst,true);
            imagefill($dst,0,0,imagecolorallocatealpha($dst,255,255,255,127));
            imagecopyresampled($dst,$img,0,0,0,0,$nw,$nh,$w,$h);
            $rel="p/$sub/$hash$suffix.webp";$target=dirname($dir).'/'.$rel;
            if(is_link($target))throw new RuntimeException('Неприпустимий файл фото');
            $temp=$target.'.'.bin2hex(random_bytes(8)).'.tmp';
            try{
                if(!imagewebp($dst,$temp,max(50,min(90,(int)(cfg('webp_quality')?:82))))||!chmod($temp,0644)||!rename($temp,$target))throw new RuntimeException('Фото не збережено');
            }finally{imagedestroy($dst);if(is_file($temp))@unlink($temp);}
            clearstatcache(true,$target);return [$rel,$nw,$nh];
        };
        [$file,$fw,$fh]=$save(max(480,min(2400,(int)(cfg('photo_max')?:1600))),'');
        [$thumb]=$save(max(240,min(640,(int)(cfg('thumb_max')?:480))),'-t');
        return [$file,$thumb,$fw,$fh];
    }finally{imagedestroy($img);}
}
