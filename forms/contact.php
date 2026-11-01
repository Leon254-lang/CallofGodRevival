<?php
declare(strict_types=1);

$returnUrl = '../contact.html#contact';
require_once __DIR__ . '/form-utils.php';
cgrmStartSecurePost($returnUrl);

if (cgrmPostString('website') !== '') {
  cgrmShowFormError(400, 'The form could not be accepted. Please return to the form and try again.', $returnUrl);
}
cgrmCheckRateLimit('last_contact_message', $returnUrl);

$name = cgrmPostString('name');
$email = cgrmPostString('email');
$subject = cgrmPostString('subject');
$message = cgrmPostString('message');

if (
  $name === '' ||
  strlen($name) > 120 ||
  strlen($email) > 254 ||
  filter_var($email, FILTER_VALIDATE_EMAIL) === false ||
  $subject === '' ||
  strlen($subject) > 160 ||
  preg_match('/[\r\n]/', $subject) === 1 ||
  strlen($message) < 2 ||
  strlen($message) > 8000
) {
  cgrmShowFormError(400, 'Please check your name, email, subject, and message, then try again.', $returnUrl);
}

$body = "A message was submitted through the church website.\n\n";
$body .= "Name: {$name}\nEmail: {$email}\nSubject: {$subject}\n\nMessage:\n{$message}\n";
if (!cgrmSendEmail('callofgodrevivalministry@gmail.com', 'Website contact message', $body, $email)) {
  cgrmShowFormError(503, 'The email service could not accept your message. The website did not save it. Please call +254 726 046000 or email the ministry directly.', $returnUrl);
}

$_SESSION['last_contact_message'] = time();
header('Location: ../contact.html?message=sent#contact', true, 303);
exit;
?>
