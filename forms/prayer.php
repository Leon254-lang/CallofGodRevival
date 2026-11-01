<?php
declare(strict_types=1);

$returnUrl = '../starter-page.html#prayer-request-form';
require_once __DIR__ . '/form-utils.php';
cgrmStartSecurePost($returnUrl);

if (cgrmPostString('website') !== '') {
  cgrmShowFormError(400, 'The form could not be accepted. Please return to the form and try again.', $returnUrl);
}
cgrmCheckRateLimit('last_prayer_request', $returnUrl);

$name = cgrmPostString('name');
$email = cgrmPostString('email');
$phone = cgrmPostString('phone');
$message = cgrmPostString('message');
$consent = cgrmPostString('consent') === 'yes';

if (
  strlen($name) > 120 ||
  strlen($email) > 254 ||
  strlen($phone) > 40 ||
  strlen($message) < 2 ||
  strlen($message) > 5000 ||
  ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) ||
  !$consent
) {
  cgrmShowFormError(400, 'Please check the message, contact details, and email consent, then try again.', $returnUrl);
}

$recipient = 'callofgodrevivalministry@gmail.com';
$subject = 'Prayer request from the church website';
$body = "A prayer request was submitted through the church website.\n\n";
if ($name !== '') {
  $body .= "Name: {$name}\n";
}
if ($email !== '') {
  $body .= "Email: {$email}\n";
}
if ($phone !== '') {
  $body .= "Phone: {$phone}\n";
}
$body .= "\nPrayer request:\n{$message}\n";
if (!cgrmSendEmail($recipient, $subject, $body, $email)) {
  cgrmShowFormError(503, 'The email service could not accept your request, and the website did not save it. Please call +254 726 046000 or try again later.', $returnUrl);
}

$_SESSION['last_prayer_request'] = time();
header('Location: ../starter-page.html?prayer=sent#prayer-request-form', true, 303);
exit;
