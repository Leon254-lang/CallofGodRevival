import { Room, RoomEvent } from 'livekit-client';
import { io as createSocket } from 'socket.io-client';
import { getNextService } from './live-schedule.js';

(() => {
  const section = document.querySelector('#live-stream');
  if (!section || window.top !== window.self) return;

  const status = section.querySelector('#live-stream-status');
  const player = section.querySelector('#live-stream-player');
  const providerFrame = section.querySelector('#live-stream-provider-frame');
  const providerPlayer = section.querySelector('#live-stream-provider-player');
  const nextService = section.querySelector('#live-stream-next-service');
  const viewerCount = section.querySelector('#live-viewer-count');
  const fallbackMessage = section.querySelector('#live-stream-fallback');
  const fallbackLink = section.querySelector('#live-stream-fallback-link');
  const watchLink = section.querySelector('#live-stream-watch');
  const channelLink = section.querySelector('#live-stream-channel');
  const chatPanel = section.querySelector('#live-chat-panel');
  const chatMessages = section.querySelector('#live-chat-messages');
  const chatForm = section.querySelector('#live-chat-form');
  const chatStatus = section.querySelector('#live-chat-status');
  const emailForm = section.querySelector('#live-email-form');
  const emailStatus = section.querySelector('#live-email-status');
  const socket = createSocket();
  let liveState = { isLive: false, viewerCount: 0 };
  let viewerRoom;
  let connectingViewer;
  let joinedLiveRoom = false;

  function displaySchedule(schedule, timeZone) {
    try {
      const next = getNextService(schedule, timeZone);
      nextService.textContent = next
        ? new Intl.DateTimeFormat('en', {
          timeZone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(next)
        : 'Please check the church service schedule.';
    } catch (error) {
      console.error('The configured live-stream service schedule could not be displayed:', error);
      nextService.textContent = 'Please check the church service schedule.';
    }
  }

  function setViewerCount(count) {
    const viewers = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    viewerCount.textContent = `${viewers} ${viewers === 1 ? 'viewer' : 'viewers'} watching`;
  }

  function addChatMessage(message) {
    const row = document.createElement('li');
    row.dataset.messageId = message.id;
    const author = document.createElement('strong');
    author.textContent = `${message.name}: `;
    const text = document.createElement('span');
    text.textContent = message.text;
    row.append(author, text);
    chatMessages.append(row);
    while (chatMessages.children.length > 100) chatMessages.firstElementChild.remove();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderState(state) {
    liveState = { ...liveState, ...state };
    setViewerCount(liveState.viewerCount);
    channelLink.href = liveState.channelUrl || '#';
    channelLink.hidden = !liveState.channelUrl;
    fallbackLink.href = liveState.channelUrl || '#';
    fallbackLink.hidden = !liveState.channelUrl;
    const externalLive = Boolean(liveState.streamLive && liveState.streamEmbedUrl);
    const isLive = Boolean(liveState.isLive || externalLive);
    watchLink.hidden = !isLive;
    chatPanel.hidden = !liveState.isLive;
    viewerCount.hidden = externalLive && !liveState.isLive;
    providerFrame.hidden = !externalLive;
    fallbackMessage.hidden = !externalLive;
    if (externalLive) {
      if (providerPlayer.getAttribute('src') !== liveState.streamEmbedUrl) {
        providerPlayer.src = liveState.streamEmbedUrl;
      }
    } else {
      providerPlayer.removeAttribute('src');
    }

    if (isLive) {
      status.textContent = 'We’re live now. Join the service below.';
      nextService.textContent = '';
      player.hidden = !liveState.isLive || externalLive;
      watchLink.href = externalLive ? '#live-stream-provider-frame' : '#live-stream-player';
      watchLink.removeAttribute('target');
      if (liveState.isLive && socket.connected && !joinedLiveRoom) {
        joinedLiveRoom = true;
        socket.emit('live:join');
      }
      if (liveState.isLive && !externalLive) void connectViewer();
      else void disconnectViewer();
    } else {
      status.textContent = 'We’re offline now. Please return for the next service:';
      displaySchedule(liveState.serviceSchedule, liveState.serviceTimeZone);
      player.hidden = true;
      providerFrame.hidden = true;
      joinedLiveRoom = false;
      socket.emit('live:leave');
      void disconnectViewer();
      chatMessages.replaceChildren();
    }
  }

  async function connectViewer() {
    if (viewerRoom) return;
    if (connectingViewer) return connectingViewer;
    connectingViewer = (async () => {
      const response = await fetch('/api/public/live/token', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The live stream could not be joined (${response.status}).`);
      if (!liveState.isLive) return;

      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        const element = track.attach();
        if (element instanceof HTMLVideoElement) {
          element.controls = true;
          element.playsInline = true;
          element.setAttribute('aria-label', 'Live church service video');
        } else if (element instanceof HTMLAudioElement) {
          element.controls = true;
          element.setAttribute('aria-label', 'Live church service audio');
        }
        player.append(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const element of track.detach()) element.remove();
      });
      await room.connect(data.serverUrl, data.token);
      if (!liveState.isLive) {
        await room.disconnect();
        return;
      }
      viewerRoom = room;
    })().catch((error) => {
      console.error('The live service could not be joined:', error);
      status.textContent = 'The live player could not connect. Please refresh or use the church channel link.';
    }).finally(() => {
      connectingViewer = null;
    });
    return connectingViewer;
  }

  async function disconnectViewer() {
    if (!viewerRoom) return;
    const room = viewerRoom;
    viewerRoom = null;
    await room.disconnect();
    player.replaceChildren();
  }

  socket.on('connect', () => {
    if (liveState.isLive) {
      joinedLiveRoom = true;
      socket.emit('live:join');
    }
  });
  socket.on('live:state', renderState);
  socket.on('live:viewer-count', setViewerCount);
  socket.on('live:chat:history', (messages) => {
    chatMessages.replaceChildren();
    for (const message of messages) addChatMessage(message);
  });
  socket.on('live:chat:message', addChatMessage);
  socket.on('live:chat:deleted', (id) => {
    chatMessages.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.remove();
  });
  socket.on('live:chat:error', (message) => {
    chatStatus.textContent = message;
  });
  socket.on('live:error', (message) => {
    status.textContent = message;
  });

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.elements.message.value.trim();
    if (!socket.connected || !liveState.isLive || !message) {
      chatStatus.textContent = 'Chat is available while the service is live.';
      return;
    }
    socket.emit('live:chat:send', {
      name: form.elements.name.value.trim() || 'Viewer',
      text: message,
    });
    form.elements.message.value = '';
    form.elements.message.focus();
    chatStatus.textContent = '';
  });

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = emailForm.querySelector('button[type="submit"]');
    button.disabled = true;
    emailStatus.textContent = 'Submitting your subscription…';
    try {
      const response = await fetch('/api/public/live/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.fromEntries(new FormData(emailForm))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The subscription could not be submitted (${response.status}).`);
      emailStatus.textContent = data.message;
      emailForm.reset();
    } catch (error) {
      emailStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const emailResult = new URLSearchParams(window.location.search).get('liveEmail');
  if (emailResult) {
    emailStatus.textContent = {
      confirmed: 'Success! Your email is confirmed. You’ll receive an alert when the next live service begins.',
      unsubscribed: 'You have been unsubscribed from live service email alerts.',
      invalid: 'That confirmation or unsubscribe link is invalid or has expired.',
    }[emailResult] || '';
    window.history.replaceState(null, '', `${window.location.pathname}#live-stream`);
  }

  fetch('/api/public/live/status', { credentials: 'same-origin', cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The live stream status could not be loaded (${response.status}).`);
      renderState(data);
    })
    .catch((error) => {
      console.error('Live stream status could not be loaded:', error);
      status.textContent = 'Live stream status is temporarily unavailable.';
    });
})();
