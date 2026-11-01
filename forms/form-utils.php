<?php
declare(strict_types=1);

function cgrmShowFormError(int $status, string $message, string $returnUrl): void
{
  http_response_code($status);
  header('Content-Type: text/html; charset=UTF-8');
  $safeMessage = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
  $safeReturnUrl = htmlspecialchars($returnUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
  echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message not sent</title><body><main><h1>Message not sent</h1><p>' . $safeMessage . '</p><p><a href="' . $safeReturnUrl . '">Return to the form</a></p><p>For help, call <a href="tel:+254726046000">+254 726 046000</a>.</p></main></body></html>';
  exit;
}

function cgrmStartSecurePost(string $returnUrl): void
{
  header('Cache-Control: no-store');
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    cgrmShowFormError(405, 'This endpoint only accepts messages submitted from the church website.', $returnUrl);
  }

  if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    cgrmShowFormError(400, 'Messages can only be sent over a secure HTTPS connection. Please call the ministry instead.', $returnUrl);
  }

  $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
  $originParts = parse_url($requestOrigin);
  $siteParts = parse_url('https://' . ($_SERVER['HTTP_HOST'] ?? ''));
  $originPort = is_array($originParts) ? ($originParts['port'] ?? 443) : 0;
  $sitePort = is_array($siteParts) ? ($siteParts['port'] ?? 443) : -1;
  if (
    !is_array($originParts) ||
    !is_array($siteParts) ||
    strtolower($originParts['scheme'] ?? '') !== 'https' ||
    strtolower($originParts['host'] ?? '') !== strtolower($siteParts['host'] ?? '') ||
    $originPort !== $sitePort
  ) {
    cgrmShowFormError(403, 'The request could not be verified. Please return to the church website and try again.', $returnUrl);
  }

  session_set_cookie_params([
    'httponly' => true,
    'secure' => true,
    'samesite' => 'Strict',
  ]);
  session_start();
}

function cgrmPostString(string $field): string
{
  $value = $_POST[$field] ?? '';
  return is_string($value) ? trim(str_replace("\0", '', $value)) : '';
}

function cgrmCheckRateLimit(string $key, string $returnUrl): void
{
  $lastRequest = $_SESSION[$key] ?? 0;
  if (is_int($lastRequest) && time() - $lastRequest < 60) {
    cgrmShowFormError(429, 'Please wait a minute before sending another message. If you need support now, call the ministry.', $returnUrl);
  }
}

function cgrmSendEmail(string $recipient, string $subject, string $body, string $replyTo = ''): bool
{
  if (!function_exists('mail')) {
    return false;
  }

  $headers = [
    'From: Call of God website <callofgodrevivalministry@gmail.com>',
    'Content-Type: text/plain; charset=UTF-8',
  ];
  if ($replyTo !== '') {
    if (filter_var($replyTo, FILTER_VALIDATE_EMAIL) === false) {
      return false;
    }
    $headers[] = "Reply-To: {$replyTo}";
  }

  return mail($recipient, $subject, $body, implode("\r\n", $headers));
}
