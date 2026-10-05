<?php
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
return [
    'noreply_password' => '', // пароль почтового ящика noreply@rubizh.shop
    // Add these entries to your EXISTING config.php. Keep the mailbox password.
    'google_enabled' => false,
    'google_client_id' => '',
    'google_client_secret' => '',
    // Exact Google authorized redirect URI: https://rubizh.shop/auth/google.php
    'sms_enabled' => false,
    'turbosms_token' => '',
    'turbosms_sender' => 'RUBIZH', // must be approved/active in your TurboSMS account
    'auth_secret' => '', // a NEW random secret, at least 40 characters; not a mailbox/PIM password
    'sms_daily_limit' => 100, // maximum SMS attempts across the store per rolling 24 hours
];
