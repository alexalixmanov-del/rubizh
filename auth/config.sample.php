<?php
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
return [
    'noreply_password' => '', // пароль почтового ящика noreply@rubizh.shop
    // Add these entries to your EXISTING config.php. Keep the mailbox password.
    // Environment overrides: RUBIZH_TURBOSMS_TOKEN, RUBIZH_TURBOSMS_SENDER,
    // RUBIZH_AUTH_SECRET, RUBIZH_SMS_ENABLED, RUBIZH_GOOGLE_CLIENT_ID,
    // RUBIZH_GOOGLE_CLIENT_SECRET, RUBIZH_GOOGLE_ENABLED, RUBIZH_NOREPLY_PASSWORD.
    'google_enabled' => false,
    'google_client_id' => '902816475074-2g3v6aapqugcpdktjgsf4s3mfnosree3.apps.googleusercontent.com',
    'google_client_secret' => '',
    // Exact Google authorized redirect URI: https://rubizh.shop/auth/google.php
    'sms_enabled' => false,
    'turbosms_token' => '',
    'turbosms_sender' => 'RUBIZH', // passed TurboSMS moderation; operators temporarily substitute a general sender
    'auth_secret' => '', // a NEW random secret, at least 40 characters; not a mailbox/PIM password
    'sms_daily_limit' => 100, // maximum SMS attempts across the store per rolling 24 hours
];
