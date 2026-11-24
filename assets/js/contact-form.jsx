import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function ContactForm() {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  async function submitMessage(event) {
    event.preventDefault();
    setSending(true);
    setStatus(null);

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch('/api/public/contact', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.message !== 'string') {
        throw new Error(result?.error || 'Your message could not be sent. Please try again or contact the ministry directly.');
      }

      setStatus({
        message: result.message,
        type: result.notificationSent === false ? 'warning' : 'success',
      });
      form.reset();
    } catch (error) {
      setStatus({
        message: error instanceof Error
          ? error.message
          : 'Your message could not be sent. Please try again or contact the ministry directly.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={submitMessage}>
      <div className="row gy-4">
        <div className="col-md-6">
          <label className="visually-hidden" htmlFor="contact-name">Your name</label>
          <input id="contact-name" type="text" name="name" className="form-control" placeholder="Your name" maxLength="120" autoComplete="name" required />
        </div>
        <div className="col-md-6">
          <label className="visually-hidden" htmlFor="contact-email">Your email</label>
          <input id="contact-email" type="email" name="email" className="form-control" placeholder="Your email" maxLength="254" autoComplete="email" required />
        </div>
        <div className="col-md-12">
          <label className="visually-hidden" htmlFor="contact-subject">Subject</label>
          <input id="contact-subject" type="text" name="subject" className="form-control" placeholder="What can we help with?" maxLength="160" required />
        </div>
        <div className="col-md-12">
          <label className="visually-hidden" htmlFor="contact-message">Your message</label>
          <textarea id="contact-message" name="message" className="form-control" rows="6" placeholder="Your message" maxLength="8000" required />
        </div>
        <div className="col-12" aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="contact-website">Leave this field empty</label>
          <input id="contact-website" type="text" name="website" tabIndex="-1" autoComplete="off" />
        </div>
        {status && (
          <div className={`col-12 alert alert-${status.type === 'error' ? 'danger' : status.type}`} role="status" aria-live="polite">
            {status.message}
          </div>
        )}
        <div className="col-md-12 text-center">
          {sending && <div className="loading d-block" role="status">Sending</div>}
          <button type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>
    </form>
  );
}

const rootElement = document.querySelector('#contact-form-root');
if (rootElement) createRoot(rootElement).render(<ContactForm />);
