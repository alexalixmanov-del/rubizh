<?php
declare(strict_types=1);
// 5-3 (stage 5): the PDF invoice («Рахунок на оплату») for orders paid to the ФОП account. Generated on the server with
// no external service and no third-party library (architect decision 2026-10-16): a small PDF 1.4 writer with an embedded
// TrueType subset (shop/fonts, OFL), Identity-H glyph strings and a ToUnicode map, so the text can be copied and searched.
// The VAT line comes only from the owner's setting invoice_vat_note; while it is empty no PDF is produced.

final class ShopInvoiceUnavailable extends RuntimeException {}

/** Amount in Ukrainian words: «Одна тисяча двісті тридцять чотири гривні 56 копійок». */
function shopAmountInWordsUa(int $kopecks): string {
    if($kopecks<0)throw new InvalidArgumentException('amount');
    $uah=intdiv($kopecks,100);$kop=$kopecks%100;
    $form=function(int $n,array $f): string {$n%=100;if($n>=11&&$n<=14)return $f[2];return match($n%10){1=>$f[0],2,3,4=>$f[1],default=>$f[2]};};
    $triple=function(int $n,bool $feminine): array {
        $units=['','один','два','три','чотири','п’ять','шість','сім','вісім','дев’ять'];if($feminine){$units[1]='одна';$units[2]='дві';}
        $teens=['десять','одинадцять','дванадцять','тринадцять','чотирнадцять','п’ятнадцять','шістнадцять','сімнадцять','вісімнадцять','дев’ятнадцять'];
        $tens=['','','двадцять','тридцять','сорок','п’ятдесят','шістдесят','сімдесят','вісімдесят','дев’яносто'];
        $hundreds=['','сто','двісті','триста','чотириста','п’ятсот','шістсот','сімсот','вісімсот','дев’ятсот'];
        $w=[];if($n>=100)$w[]=$hundreds[intdiv($n,100)];$r=$n%100;
        if($r>=10&&$r<20)$w[]=$teens[$r-10];else{if($r>=20)$w[]=$tens[intdiv($r,10)];if($r%10)$w[]=$units[$r%10];}
        return $w;
    };
    $scales=[[1000000000,false,['мільярд','мільярди','мільярдів']],[1000000,false,['мільйон','мільйони','мільйонів']],[1000,true,['тисяча','тисячі','тисяч']]];
    $words=[];$n=$uah;
    foreach($scales as [$size,$fem,$names]){$part=intdiv($n,$size);$n%=$size;if($part){$words=array_merge($words,$triple($part,$fem));$words[]=$form($part,$names);}}
    if($n)$words=array_merge($words,$triple($n,true));
    if(!$words)$words=['нуль'];
    $text=implode(' ',$words).' '.$form($uah,['гривня','гривні','гривень']).' '.sprintf('%02d',$kop).' '.$form($kop,['копійка','копійки','копійок']);
    return mb_strtoupper(mb_substr($text,0,1)).mb_substr($text,1);
}

/** Money in kopecks as «1 234,56». */
function shopInvoiceMoney(int $kopecks): string {return number_format(intdiv($kopecks,100),0,',',' ').','.sprintf('%02d',$kopecks%100);}

/** A TrueType font for the PDF writer: glyph ids, advance widths and the metrics the font descriptor needs. */
final class RzPdfFont {
    public string $data;public int $units;public array $cmap=[];public array $advance=[];public array $bbox;public int $ascent;public int $descent;public int $capHeight;public array $used=[];
    public function __construct(public string $name,string $file){
        $this->data=(string)file_get_contents($file);$d=$this->data;$t=[];
        $n=unpack('n',$d,4)[1];for($i=0;$i<$n;$i++){$r=unpack('a4tag/Nsum/Noff/Nlen',$d,12+16*$i);$t[$r['tag']]=$r['off'];}
        foreach(['head','hhea','hmtx','cmap','maxp'] as $need)if(!isset($t[$need]))throw new RuntimeException('Font table '.$need.' missing');
        $s16=fn(int $o)=>($v=unpack('n',$d,$o)[1])>=0x8000?$v-0x10000:$v;
        $this->units=unpack('n',$d,$t['head']+18)[1];
        $this->bbox=[$s16($t['head']+36),$s16($t['head']+38),$s16($t['head']+40),$s16($t['head']+42)];
        $this->ascent=$s16($t['hhea']+4);$this->descent=$s16($t['hhea']+6);$this->capHeight=isset($t['OS/2'])&&unpack('n',$d,$t['OS/2'])[1]>=2?$s16($t['OS/2']+88):$this->ascent;
        $metrics=unpack('n',$d,$t['hhea']+34)[1];$glyphs=unpack('n',$d,$t['maxp']+4)[1];$last=0;
        for($g=0;$g<$glyphs;$g++){if($g<$metrics)$last=unpack('n',$d,$t['hmtx']+4*$g)[1];$this->advance[$g]=$last;}
        $this->readCmap($t['cmap']);
    }
    private function readCmap(int $base): void {
        $d=$this->data;$count=unpack('n',$d,$base+2)[1];$best=null;
        for($i=0;$i<$count;$i++){$r=unpack('nplat/nenc/Noff',$d,$base+4+8*$i);$fmt=unpack('n',$d,$base+$r['off'])[1];
            if($r['plat']===3&&$r['enc']===10&&$fmt===12)$best=[$base+$r['off'],12];elseif($r['plat']===3&&$r['enc']===1&&$fmt===4&&$best===null)$best=[$base+$r['off'],4];}
        if($best===null)throw new RuntimeException('Unicode cmap missing');[$o,$fmt]=$best;
        if($fmt===12){$groups=unpack('N',$d,$o+12)[1];for($i=0;$i<$groups;$i++){$g=unpack('Nstart/Nend/Ngid',$d,$o+16+12*$i);for($c=$g['start'];$c<=$g['end'];$c++)$this->cmap[$c]=$g['gid']+$c-$g['start'];}return;}
        $seg=unpack('n',$d,$o+6)[1]>>1;$ends=$o+14;$starts=$ends+2*$seg+2;$deltas=$starts+2*$seg;$ranges=$deltas+2*$seg;
        for($i=0;$i<$seg;$i++){
            $end=unpack('n',$d,$ends+2*$i)[1];$start=unpack('n',$d,$starts+2*$i)[1];$delta=unpack('n',$d,$deltas+2*$i)[1];$range=unpack('n',$d,$ranges+2*$i)[1];
            for($c=$start;$c<=$end&&$c<0xFFFF;$c++){
                if($range===0)$gid=($c+$delta)&0xFFFF;else{$gid=unpack('n',$d,$ranges+2*$i+$range+2*($c-$start))[1];if($gid)$gid=($gid+$delta)&0xFFFF;}
                if($gid)$this->cmap[$c]=$gid;
            }
        }
    }
    /** Glyph ids for a UTF-8 string; a character outside the font becomes «?» (never a broken glyph). */
    public function glyphs(string $s): array {
        $out=[];foreach(mb_str_split(self::normalize($s),1,'UTF-8') as $ch){$cp=mb_ord($ch,'UTF-8');if(!isset($this->cmap[$cp]))$cp=63;$gid=$this->cmap[$cp]??0;$this->used[$gid]=$cp;$out[]=$gid;}
        return $out;
    }
    public function width(string $s,float $size): float {$w=0;foreach(mb_str_split(self::normalize($s),1,'UTF-8') as $ch){$gid=$this->cmap[mb_ord($ch,'UTF-8')]??$this->cmap[63]??0;$w+=$this->advance[$gid]??0;}return $w*$size/$this->units;}
    public static function normalize(string $s): string {return (string)preg_replace('/[\x{200B}-\x{200F}\x{2060}\x{FE0E}\x{FE0F}]/u','',strtr($s,["\u{02BC}"=>'’',"\u{00A0}"=>' ',"\u{202F}"=>' ',"\t"=>' ']));}
    public function scale(int $v): int {return (int)round($v*1000/$this->units);}
}

/** Minimal PDF 1.4 writer: A4 pages, two fonts, text, lines and filled rectangles. */
final class RzPdf {
    public const W=595.28,H=841.89;
    private array $pages=[];private int $page=-1;private array $fonts;
    public function __construct(){$dir=__DIR__.'/fonts/';$this->fonts=['R'=>new RzPdfFont('RubizhInvoiceSans-Regular',$dir.'RubizhInvoiceSans-Regular.ttf'),'B'=>new RzPdfFont('RubizhInvoiceSans-SemiBold',$dir.'RubizhInvoiceSans-SemiBold.ttf')];}
    public function addPage(): void {$this->pages[]='';$this->page=count($this->pages)-1;}
    public function width(string $s,string $font,float $size): float {return $this->fonts[$font]->width($s,$size);}
    public function text(float $x,float $y,string $s,string $font='R',float $size=10): void {
        if($s==='')return;$hex='';foreach($this->fonts[$font]->glyphs($s) as $g)$hex.=sprintf('%04X',$g);
        $this->pages[$this->page].=sprintf("BT /F%s %.2F Tf %.2F %.2F Td <%s> Tj ET\n",$font,$size,$x,$y,$hex);
    }
    public function textRight(float $right,float $y,string $s,string $font='R',float $size=10): void {$this->text($right-$this->width($s,$font,$size),$y,$s,$font,$size);}
    /** Splits text into lines no wider than $width (long words are cut). */
    public function wrap(string $s,float $width,string $font='R',float $size=10): array {
        $lines=[];$line='';
        foreach(preg_split('/\s+/u',trim($s))?:[] as $word){
            while($this->width($word,$font,$size)>$width&&mb_strlen($word)>1){$cut=mb_strlen($word);while($cut>1&&$this->width(mb_substr($word,0,$cut),$font,$size)>$width)$cut--;if($line!==''){$lines[]=$line;$line='';}$lines[]=mb_substr($word,0,$cut);$word=mb_substr($word,$cut);}
            $try=$line===''?$word:$line.' '.$word;if($this->width($try,$font,$size)<=$width)$line=$try;else{$lines[]=$line;$line=$word;}
        }
        if($line!==''||!$lines)$lines[]=$line;return $lines;
    }
    public function line(float $x1,float $y1,float $x2,float $y2,float $w=0.5): void {$this->pages[$this->page].=sprintf("%.2F w %.2F %.2F m %.2F %.2F l S\n",$w,$x1,$y1,$x2,$y2);}
    public function fill(float $x,float $y,float $w,float $h,float $gray): void {$this->pages[$this->page].=sprintf("q %.2F g %.2F %.2F %.2F %.2F re f Q\n",$gray,$x,$y,$w,$h);}
    /** The PDF bytes; $footer(pdf, page, pages) adds the page footer once the page count is known. */
    public function output(string $title,?callable $footer=null): string {
        if($footer)foreach(array_keys($this->pages) as $i){$this->page=$i;$footer($this,$i+1,count($this->pages));}
        $objects=[];$add=function(string $body)use(&$objects): int {$objects[]=$body;return count($objects);};
        $stream=function(string $data,string $extra='')use($add): int {$z=gzcompress($data,9);return $add('<< /Length '.strlen($z).' /Filter /FlateDecode'.$extra." >>\nstream\n".$z."\nendstream");};
        $catalog=$add('');$pagesId=$add('');$fontRefs=[];
        foreach($this->fonts as $key=>$f){
            $tag='RZINV'.($key==='R'?'A':'B').'+'.$f->name;
            $file=$stream($f->data,' /Length1 '.strlen($f->data));
            $desc=$add(sprintf('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent %d /Descent %d /CapHeight %d /StemV %d /FontFile2 %d 0 R >>',$tag,$f->scale($f->bbox[0]),$f->scale($f->bbox[1]),$f->scale($f->bbox[2]),$f->scale($f->bbox[3]),$f->scale($f->ascent),$f->scale($f->descent),$f->scale($f->capHeight),$key==='B'?120:80,$file));
            ksort($f->used);$w='';foreach($f->used as $gid=>$cp)$w.=$gid.' ['.$f->scale($f->advance[$gid]??0).'] ';
            $cid=$add(sprintf('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /CIDToGIDMap /Identity /DW 500 /W [%s] >>',$tag,$desc,trim($w)));
            $map='';foreach(array_chunk($f->used,100,true) as $chunk){$map.=count($chunk)." beginbfchar\n";foreach($chunk as $gid=>$cp)$map.=sprintf("<%04X> <%s>\n",$gid,strtoupper(bin2hex(mb_convert_encoding(mb_chr($cp,'UTF-8'),'UTF-16BE','UTF-8'))));$map.="endbfchar\n";}
            $cmap=$stream("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n".$map."endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend");
            $fontRefs[$key]=$add(sprintf('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>',$tag,$cid,$cmap));
        }
        $kids=[];foreach($this->pages as $content){$c=$stream($content);$kids[]=$add(sprintf('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /FR %d 0 R /FB %d 0 R >> >> /Contents %d 0 R >>',$pagesId,self::W,self::H,$fontRefs['R'],$fontRefs['B'],$c));}
        $objects[$catalog-1]=sprintf('<< /Type /Catalog /Pages %d 0 R >>',$pagesId);
        $objects[$pagesId-1]=sprintf('<< /Type /Pages /Kids [%s] /Count %d >>',implode(' ',array_map(fn($k)=>$k.' 0 R',$kids)),count($kids));
        $info=$add('<< /Title <FEFF'.strtoupper(bin2hex(mb_convert_encoding($title,'UTF-16BE','UTF-8'))).'> /Producer (RUBIZH) >>');
        $pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";$offsets=[];
        foreach($objects as $i=>$body){$offsets[]=strlen($pdf);$pdf.=($i+1)." 0 obj\n".$body."\nendobj\n";}
        $xref=strlen($pdf);$pdf.="xref\n0 ".(count($objects)+1)."\n0000000000 65535 f \n";foreach($offsets as $o)$pdf.=sprintf("%010d 00000 n \n",$o);
        return $pdf.sprintf("trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n",count($objects)+1,$catalog,$info,$xref);
    }
}

/**
 * The invoice PDF. $invoice: number, date (d.m.Y), seller{name,tax_id,iban,bank,mfo,address,phone,email},
 * buyer{name,code,address}, lines[{name,unit,qty,price_kop,sum_kop}], subtotal_kop, discount_kop, total_kop,
 * vat_note (owner's wording, required), due (text), purpose.
 */
function shopInvoicePdf(array $invoice): string {
    if(trim((string)($invoice['vat_note']??''))==='')throw new ShopInvoiceUnavailable('VAT_NOTE_MISSING');
    $pdf=new RzPdf();$pdf->addPage();$L=40.0;$R=RzPdf::W-40.0;$y=RzPdf::H-56.0;
    $title='Рахунок на оплату № '.$invoice['number'].' від '.$invoice['date'];
    $pdf->text($L,$y,$title,'B',15);$y-=26;
    $block=function(string $label,array $rows)use($pdf,$L,$R,&$y){$pdf->text($L,$y,$label,'B',10);foreach($rows as $row){if(trim((string)$row)==='')continue;foreach($pdf->wrap((string)$row,$R-$L-110) as $part){$pdf->text($L+110,$y,$part,'R',10);$y-=13;}}$y-=8;};
    $s=$invoice['seller'];$b=$invoice['buyer'];
    $block('Постачальник:',[$s['name'],'РНОКПП '.$s['tax_id'],'IBAN '.$s['iban'],'Банк '.$s['bank'].($s['mfo']!==''?', МФО '.$s['mfo']:''),$s['address'],trim($s['phone'].' · '.$s['email'],' ·')]);
    $block('Платник:',[$b['name'],$b['code']!==''?(strlen($b['code'])===8?'ЄДРПОУ ':'РНОКПП ').$b['code']:'',$b['address']]);
    // Lines table: №, name, quantity, unit, price, sum.
    $cols=[$L,$L+24,$R-200,$R-150,$R-110,$R];$size=9.5;
    $header=function()use($pdf,$cols,$L,$R,&$y,$size){$pdf->fill($L,$y-5,$R-$L,18,0.92);$pdf->text($cols[0]+4,$y,'№','B',$size);$pdf->text($cols[1]+4,$y,'Товар','B',$size);$pdf->textRight($cols[3]-4,$y,'Кількість','B',$size);$pdf->text($cols[3]+4,$y,'Од.','B',$size);$pdf->textRight($cols[5]-70,$y,'Ціна, грн','B',$size);$pdf->textRight($cols[5]-4,$y,'Сума, грн','B',$size);$y-=20;};
    $header();
    foreach($invoice['lines'] as $i=>$l){
        $name=$pdf->wrap($l['name'],$cols[2]-$cols[1]-8,'R',$size);$h=13*count($name)+4;
        if($y-$h<90){$pdf->addPage();$y=RzPdf::H-56.0;$header();}
        $pdf->text($cols[0]+4,$y,(string)($i+1),'R',$size);foreach($name as $k=>$part)$pdf->text($cols[1]+4,$y-13*$k,$part,'R',$size);
        $pdf->textRight($cols[3]-4,$y,(string)$l['qty'],'R',$size);$pdf->text($cols[3]+4,$y,$l['unit'],'R',$size);
        $pdf->textRight($cols[5]-70,$y,shopInvoiceMoney($l['price_kop']),'R',$size);$pdf->textRight($cols[5]-4,$y,shopInvoiceMoney($l['sum_kop']),'R',$size);
        $y-=$h;$pdf->line($L,$y+9,$R,$y+9,0.3);
    }
    // The totals block moves to a new page as a whole when it would reach the footer (height measured, not guessed).
    $words=$pdf->wrap('Всього на суму: '.shopAmountInWordsUa($invoice['total_kop']),$R-$L,'B',10);$tail=array_merge($pdf->wrap('Сплатити до: '.$invoice['due'],$R-$L,'R',10),$pdf->wrap('Призначення платежу: '.$invoice['purpose'],$R-$L,'R',10));
    $need=6+(($invoice['discount_kop']??0)>0?28:0)+16+22+14*count($words)+6+14*count($tail);
    if($y-$need<70){$pdf->addPage();$y=RzPdf::H-56.0;}
    $y-=6;
    if(($invoice['discount_kop']??0)>0){$pdf->textRight($R-110,$y,'Сума товарів:','R',10);$pdf->textRight($R-4,$y,shopInvoiceMoney($invoice['subtotal_kop']),'R',10);$y-=14;$pdf->textRight($R-110,$y,'Знижка:','R',10);$pdf->textRight($R-4,$y,'-'.shopInvoiceMoney($invoice['discount_kop']),'R',10);$y-=14;}
    $pdf->textRight($R-110,$y,'Разом до сплати:','B',11);$pdf->textRight($R-4,$y,shopInvoiceMoney($invoice['total_kop']).' грн','B',11);$y-=16;
    $pdf->textRight($R-4,$y,trim((string)$invoice['vat_note']),'R',10);$y-=22;
    foreach($words as $part){$pdf->text($L,$y,$part,'B',10);$y-=14;}
    $y-=6;
    foreach($tail as $part){$pdf->text($L,$y,$part,'R',10);$y-=14;}
    return $pdf->output($title,function(RzPdf $p,int $n,int $total)use($L,$R,$invoice){$p->line($L,48,$R,48,0.3);$p->text($L,34,'Рахунок № '.$invoice['number'],'R',8);$p->textRight($R,34,'Сторінка '.$n.' з '.$total,'R',8);});
}

/** Payer requisites from the checkout (optional, invoice orders only). OPSEC: no military unit numbers, no names of servicemen. */
function shopInvoicePayer(array $contact): array {
    $f=fn(string $k)=>is_string($contact[$k]??null)?trim((string)preg_replace('/[\x00-\x1f\x7f]+/u',' ',$contact[$k])):'';
    $name=$f('payer_name');$code=$f('payer_code');$address=$f('payer_address');
    if(mb_strlen($name)>200||mb_strlen($address)>240||strlen($code)>20)throw new RuntimeException('Перевірте дані платника: занадто довгий текст.');
    $code=(string)preg_replace('/\D/','',$code);
    require_once __DIR__.'/wholesale-lib.php';
    if($code!==''&&!(strlen($code)===8&&wholesaleEdrpouValid($code)||strlen($code)===10&&wholesaleRnokppValid($code)))throw new RuntimeException('Перевірте ЄДРПОУ (8 цифр) або РНОКПП (10 цифр): контрольна цифра не збігається.');
    foreach([$name,$address] as $text)if(preg_match('~(?:в\s*[/.]\s*ч|(?<![\p{L}])вч(?![\p{L}])|військов\w*\s+частин\w*|(?<![\p{L}\d])[АA]\s?\d{4}(?![\p{L}\d])|(?<![\p{L}])ч\.?\s*\d{3,5}(?![\d]))~iu',$text))throw new RuntimeException('Не вказуйте номер військової частини в даних платника.');
    return array_filter(['payer_name'=>$name,'payer_code'=>$code,'payer_address'=>$address],fn($v)=>$v!=='');
}

/** Owner's VAT wording for invoices (settings invoice_vat_note); '' = not filled. */
function shopInvoiceVatNote(): string {return trim((string)(cfg('invoice_vat_note')??''));}

/** Invoice data of an order, or ShopInvoiceUnavailable (NOT_INVOICE, NOT_READY, CANCELLED, VAT_NOTE_MISSING). */
function shopInvoiceData(PDO $db,int $orderId,bool $write=true): array {
    require_once __DIR__.'/../api/seller.php';require_once __DIR__.'/np-fulfillment.php';
    $o=npOrder($db,$orderId);$c=$o['contact'];
    if(($c['payment']??'')!=='invoice')throw new ShopInvoiceUnavailable('NOT_INVOICE');
    if($o['status']==='cancelled')throw new ShopInvoiceUnavailable('CANCELLED');
    if(!shopPaymentReady($o)&&!in_array($o['payment_status'],['paid','refunded'],true))throw new ShopInvoiceUnavailable('NOT_READY');
    $vat=shopInvoiceVatNote();if($vat==='')throw new ShopInvoiceUnavailable('VAT_NOTE_MISSING');
    // The CRM card only looks (no write on a read path); the download creates the timing row when it is missing.
    if($write)$timing=shopEnsureTiming($db,$o);else{$q=$db->prepare('SELECT * FROM rubizh_order_timing WHERE order_id=?');$q->execute([$orderId]);$timing=$q->fetch(PDO::FETCH_ASSOC);if(!$timing)throw new ShopInvoiceUnavailable('NOT_READY');}
    $kyiv=new DateTimeZone('Europe/Kyiv');
    $date=(new DateTimeImmutable((string)$o['created_at'],new DateTimeZone('UTC')))->setTimezone($kyiv);
    $due=(new DateTimeImmutable((string)$timing['payment_due'],new DateTimeZone('UTC')))->setTimezone($kyiv);
    $s=rubizhSeller();$lines=[];
    foreach($o['items'] as $l){$unit=($l['sale_unit']??'piece')==='m2'?'м²':'шт.';$name=trim(($l['name']??'').(($l['variant']??'')!==''?' · '.$l['variant']:'').(($l['sku']??'')!==''?' · '.$l['sku']:''));
        $lines[]=['name'=>$name,'unit'=>$unit,'qty'=>is_int($l['qty'])?$l['qty']:rtrim(rtrim(number_format((float)$l['qty'],2,',',''),'0'),','),'price_kop'=>shopMoney($l['price']),'sum_kop'=>isset($l['amount'])?shopMoney($l['amount']):shopLineMoney(shopMoney($l['price']),$l['qty'])];}
    return ['number'=>$o['order_number'],'date'=>$date->format('d.m.Y'),
        'seller'=>['name'=>(string)$s['name'],'tax_id'=>(string)$s['tax_id'],'iban'=>(string)$s['iban'],'bank'=>(string)$s['bank'],'mfo'=>(string)$s['mfo'],'address'=>(string)$s['address'],'phone'=>(string)$s['phone_label'],'email'=>(string)$s['email']],
        'buyer'=>['name'=>(string)(($c['payer_name']??'')?:(($c['recipient']??'')?:$c['name'])),'code'=>(string)($c['payer_code']??''),'address'=>(string)($c['payer_address']??'')],
        'lines'=>$lines,'subtotal_kop'=>shopMoney($o['subtotal']??$o['total']),'discount_kop'=>shopMoney($o['discount_amount']??0),'total_kop'=>shopMoney($o['total']),
        'vat_note'=>$vat,'due'=>$due->format('d.m.Y, H:i').' (за київським часом)','purpose'=>'оплата замовлення '.$o['order_number']];
}

/** Sends the PDF of an order (the caller has checked who may read it). */
function shopInvoiceSend(PDO $db,int $orderId): never {
    $data=shopInvoiceData($db,$orderId);$pdf=shopInvoicePdf($data);
    header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="rakhunok-'.preg_replace('/[^A-Za-z0-9-]/','',$data['number']).'.pdf"');
    header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');header('Content-Length: '.strlen($pdf));echo $pdf;exit;
}
