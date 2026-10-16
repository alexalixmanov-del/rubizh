# Invoice PDF fonts

`RubizhInvoiceSans-{Regular,SemiBold}.ttf` are subsets (Latin, Cyrillic incl. Ґґ, ’, №, ₴, «», dashes) of
IBM Plex Sans 1.1.0 (`@ibm/plex-sans`, SIL Open Font License 1.1, see `OFL.txt`), made with fonttools 4.55.3
`pyftsubset --no-hinting --layout-features=''`. As modified versions they are renamed (the Reserved Font Name
«Plex» is not used). Used only by `shop/invoice-pdf.php` (embedded whole into the invoice PDF).
