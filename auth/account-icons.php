<?php
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
function rubizhAccountIcon(string $name): string {
    $paths = [
        'orders'=>'<path d="M4 8h16v12H4zM3 8l3-4h12l3 4M9 8v4h6V8"/>',
        'favorites'=>'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
        'delivery'=>'<path d="M2 5h12v13H2zM14 10h4l4 4v4h-8M14 14h8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
        'profile'=>'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
        'donations'=>'<path d="M12 3v17M7 5v11l5 4 5-4V5M3 7v10l9 5 9-5V7"/>',
        'support'=>'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v7h4v-7ZM20 12h2v7h-4v-7ZM20 19c0 3-3 3-6 3"/>',
        'phone'=>'<path d="m5 3 4 5-2 3a17 17 0 0 0 6 6l3-2 5 4-2 3C10 23 1 14 2 5Z"/>',
        'logout'=>'<path d="M9 4H3v16h6M8 12h13m-4-4 4 4-4 4"/>',
    ];
    return '<svg class="account-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'.($paths[$name] ?? $paths['profile']).'</svg>';
}
