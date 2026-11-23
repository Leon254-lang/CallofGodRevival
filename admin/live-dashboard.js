import { createLocalTracks, Room, RoomEvent } from 'livekit-client';
import { io as createSocket } from 'socket.io-client';

(() => {
  const startButton = document.querySelector('#start-live-button');
  if (!startButton) return;

  const status = document.querySelector('#admin-live-status');
  const viewerCount = document.querySelector('#admin-live-viewers');
  const recording = document.querySelector('#admin-live-recording');
  const preview = document.querySelector('#admin-live-preview');
  const stopButton = document.querySelector('#stop-live-button');
  const microphoneButton = document.querySelector('#toggle-live-microphone');
  const cameraButton = document.querySelector('#toggle-live-camera');
  const chatList = document.querySelector('#admin-live-chat');
  const socket = createSocket({ autoConnect: false });
  let csrfToken = '';
  let room;
  let localTracks = [];
  let microphoneEnabled = true;
  let cameraEnabled = true;
  let stopping = false;

  async function api(url, method = 'GET') {
    const headers = {};
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrfToken;
    }
    const response = await fetch(url, { method, headers, credentials: 'same-origin', cache: 'no-store' });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || `The live dashboard request failed (${response.status}).`);
    return data;
  }

  function setViewerCount(count) {
    const viewers = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    viewerCount.textContent = `${viewers} ${viewers === 1 ? 'viewer' : 'viewers'}`;
  }

  function appendAdminMessage(message) {
    const row = document.createElement('li');
    row.dataset.messageId = message.id;
    const author = document.createElement('strong');
    author.textContent = `${message.name}: `;
    const text = document.createElement('span');
    text.textContent = message.text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove message from ${message.name}`);
    remove.addEventListener('click', () => socket.emit('live:chat:delete', message.id));
    row.append(author, text, remove);
    chatList.append(row);
    while (chatList.children.length > 100) chatList.firstElementChild.remove();
    chatList.scrollTop = chatList.scrollHeight;
  }

  function showState(data) {
    status.textContent = data.isLive ? 'Broadcast is live.' : 'No broadcast is live.';
    startButton.disabled = Boolean(data.isLive);
    stopButton.disabled = !data.isLive;
    setViewerCount(data.viewerCount);
    const descriptions = {
      recording: 'Recording is in progress.',
      finalizing: 'LiveKit is finalizing and uploading the MP4 recording.',
      complete: 'Recording upload completed.',
      failed: 'Recording finalization failed. Check LiveKit Egress and S3 credentials.',
      idle: 'Recordings are saved to the configured S3-compatible bucket.',
    };
    recording.textContent = data.recordingObjectKey
      ? `${descriptions[data.recordingStatus] || 'Recording status unavailable'} S3 object: ${data.recordingObjectKey}`
      : descriptions[data.recordingStatus] || 'Recordings are saved to the configured S3-compatible bucket.';
  }

  function setPublishingControls(enabled) {
    microphoneButton.disabled = !enabled;
    cameraButton.disabled = !enabled;
    stopButton.disabled = !enabled;
  }

  async function refreshStatus() {
    const data = await api('/api/admin/live/status');
    showState(data);
    return data;
  }

  async function discardLocalBroadcast() {
    const broadcastRoom = room;
    room = null;
    if (broadcastRoom) await broadcastRoom.disconnect();
    for (const track of localTracks) track.stop();
    localTracks = [];
    preview.srcObject = null;
    preview.hidden = true;
    microphoneEnabled = true;
    cameraEnabled = true;
    microphoneButton.textContent = 'Mute microphone';
    cameraButton.textContent = 'Turn camera off';
    setPublishingControls(false);
  }

  async function startBroadcast() {
    startButton.disabled = true;
    status.textContent = 'Preparing camera and microphone…';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Broadcasting requires this website to be open over HTTPS.');
      }
      const credentials = await api('/api/admin/live/token', 'POST');
      const broadcastRoom = new Room({ adaptiveStream: true, dynacast: true });
      room = broadcastRoom;
      broadcastRoom.on(RoomEvent.Disconnected, () => {
        if (room === broadcastRoom && !stopping) {
          status.textContent = 'The broadcaster disconnected. End the broadcast and reconnect.';
        }
      });

      localTracks = await createLocalTracks({
        audio: true,
        video: { facingMode: 'user', resolution: { width: 1280, height: 720 } },
      });
      const cameraTrack = localTracks.find((track) => track.kind === 'video');
      if (cameraTrack) {
        cameraTrack.attach(preview);
        preview.hidden = false;
      }
      await broadcastRoom.connect(credentials.serverUrl, credentials.token);
      await Promise.all(localTracks.map((track) => broadcastRoom.localParticipant.publishTrack(track)));

      const result = await api('/api/admin/live/start', 'POST');
      setPublishingControls(true);
      showState({ ...result, viewerCount: 0 });
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: 'Broadcast started. Sending live email alerts to confirmed subscribers.' },
      }));
    } catch (error) {
      await discardLocalBroadcast();
      status.textContent = 'Broadcast could not be started.';
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: error.message, type: 'error' },
      }));
      startButton.disabled = false;
    }
  }

  async function stopBroadcast() {
    if (stopping) return;
    stopping = true;
    stopButton.disabled = true;
    status.textContent = 'Ending broadcast and finalizing the recording…';
    try {
      const result = await api('/api/admin/live/stop', 'POST');
      await discardLocalBroadcast();
      showState({ ...result, viewerCount: 0 });
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: {
          message: result.recordingStatus === 'failed'
            ? 'The broadcast ended, but the recording could not be finalized. Check LiveKit Egress and S3 credentials.'
            : 'Broadcast ended. The recording is being finalized and uploaded to S3.',
          type: result.recordingStatus === 'failed' ? 'error' : 'success',
        },
      }));
      await refreshStatus();
      const state = await api('/api/admin/live/status');
      if (state.recordingStatus === 'finalizing') {
        const poll = window.setInterval(async () => {
          try {
            const current = await refreshStatus();
            if (current.recordingStatus !== 'finalizing') window.clearInterval(poll);
          } catch (error) {
            window.clearInterval(poll);
            recording.textContent = `Recording status could not be refreshed: ${error.message}`;
          }
        }, 5000);
      }
    } catch (error) {
      status.textContent = 'The broadcast could not be stopped from the server. Retry ending the broadcast.';
      stopButton.disabled = false;
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: error.message, type: 'error' },
      }));
    } finally {
      stopping = false;
    }
  }

  window.stopLiveBroadcastBeforeLogout = async () => {
    if (!room) return true;
    if (!window.confirm('End the live broadcast and finalize its recording before signing out?')) return false;
    try {
      await api('/api/admin/live/stop', 'POST');
      await discardLocalBroadcast();
      return true;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: error.message, type: 'error' },
      }));
      return false;
    }
  };

  startButton.addEventListener('click', startBroadcast);
  stopButton.addEventListener('click', stopBroadcast);
  microphoneButton.addEventListener('click', async () => {
    if (!room) return;
    microphoneEnabled = !microphoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(microphoneEnabled);
      microphoneButton.textContent = microphoneEnabled ? 'Mute microphone' : 'Unmute microphone';
    } catch (error) {
      microphoneEnabled = !microphoneEnabled;
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: `Microphone control failed: ${error.message}`, type: 'error' },
      }));
    }
  });
  cameraButton.addEventListener('click', async () => {
    if (!room) return;
    cameraEnabled = !cameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(cameraEnabled);
      cameraButton.textContent = cameraEnabled ? 'Turn camera off' : 'Turn camera on';
      preview.hidden = !cameraEnabled;
    } catch (error) {
      cameraEnabled = !cameraEnabled;
      window.dispatchEvent(new CustomEvent('admin:live-notice', {
        detail: { message: `Camera control failed: ${error.message}`, type: 'error' },
      }));
    }
  });

  socket.on('connect', () => socket.emit('live:admin:join', csrfToken));
  socket.on('live:state', showState);
  socket.on('live:viewer-count', setViewerCount);
  socket.on('live:chat:history', (messages) => {
    chatList.replaceChildren();
    for (const message of messages) appendAdminMessage(message);
  });
  socket.on('live:chat:message', appendAdminMessage);
  socket.on('live:chat:deleted', (id) => {
    chatList.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.remove();
  });
  socket.on('live:error', (message) => {
    status.textContent = message;
  });
  socket.on('live:notification-result', (result) => {
    window.dispatchEvent(new CustomEvent('admin:live-notice', {
      detail: {
        message: result.failed
          ? `Broadcast is live, but email alerts failed for ${result.failed} subscriber(s). Check the SMTP configuration.`
          : `Broadcast is live. ${result.sent} live email alert(s) sent.`,
        type: result.failed ? 'error' : 'success',
      },
    }));
  });

  window.addEventListener('admin:live-ready', async (event) => {
    csrfToken = event.detail.csrfToken;
    if (!socket.connected) socket.connect();
    else socket.emit('live:admin:join', csrfToken);
    try {
      await refreshStatus();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  window.addEventListener('admin:live-logout', () => {
    socket.disconnect();
    void discardLocalBroadcast();
  });
  window.addEventListener('admin:live-notice', (event) => {
    const notice = document.querySelector('#notice');
    notice.textContent = event.detail.message;
    notice.className = `notice${event.detail.type === 'error' ? ' error' : ''}`;
    notice.hidden = false;
  });
})();
