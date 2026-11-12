'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ArrowLeft, Camera, Check, ChevronUp, ImagePlus, Mic, Pause, Play, Send, Timer, X } from 'lucide-react';
import { getBrowserRealtime } from '@/lib/supabase-browser';
import { EphemeralMediaTransport, MEDIA_SIGNAL_EVENT, type MediaKind, type PhotoDuration } from '@/lib/peer-media';
import type { ChatMessage, Member } from '@/lib/types';
import PixelCoin from './pixel-coin';

type MediaMessage = {
  kind: MediaKind;
  id: string;
  fromId: string;
  sentAt: number;
  url?: string;
  duration?: PhotoDuration;
  viewed?: boolean;
};
type DisplayMessage = ChatMessage | MediaMessage;
type PendingPhoto = { blob: Blob; url: string };
const MAX_RECORDING_MS = 60_000;

function clockTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image.');
  if (file.size > 24 * 1024 * 1024) throw new Error('Image is too large. Choose a file under 24 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not open that image.'));
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Image processing is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    // Clear the pixel buffer promptly; photo data is not stored on disk by PXL.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('Could not compress photo sufficiently.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

function recordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type));
}

function VoiceBubble({ url }: { url?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  if (!url) return <span className="audio-note">Voice unavailable</span>;
  return <div className="voice-bubble">
    <button type="button" className="voice-play" aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      onClick={() => { const el = ref.current; if (!el) return; if (el.paused) void el.play().catch(() => setPlaying(false)); else el.pause(); }}>
      {playing ? <Pause size={15}/> : <Play size={16}/>}</button>
    <div className="voice-waves" aria-hidden="true">{Array.from({ length: 22 }, (_, i) =>
      <span key={i} style={{ height: `${6 + ((i * 13 + 7) % 18)}px` }}/>)}</div>
    <span className="voice-duration">{Math.floor(seconds / 60)}:{String(Math.floor(seconds % 60)).padStart(2, '0')}</span>
    <audio ref={ref} preload="metadata" src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration || 0)} />
  </div>;
}

export default function EphemeralChat({ current, peer, online, onBack, onInteraction, onInvite }: {
  current: Member;
  peer: Member;
  online: boolean;
  onBack: () => void;
  onInteraction: (id: string) => void;
  onInvite: (peer: Member) => void;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState('');
  const [roomReady, setRoomReady] = useState(false);
  const [peerReady, setPeerReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [duration, setDuration] = useState<PhotoDuration>(10);
  const [timerMenu, setTimerMenu] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; url: string; expiresAt: number } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const room = useRef<RealtimeChannel | null>(null);
  const transport = useRef<EphemeralMediaTransport | null>(null);
  const urls = useRef<Set<string>>(new Set());
  const photoRef = useRef<PendingPhoto | null>(null);
  const viewingRef = useRef<{ id: string; url: string; expiresAt: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingStarted = useRef(0);
  const recordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRecording = useRef(false);
  const touchOrigin = useRef<number | null>(null);
  const touchHeld = useRef(false);
  const startingRecorder = useRef(false);
  const suppressClick = useRef(false);
  const alive = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const cameraVideo = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraBusyRef = useRef(false);

  const revoke = useCallback((url: string | undefined) => {
    if (url && urls.current.has(url)) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }, []);

  const append = useCallback((message: DisplayMessage) => {
    setMessages((list) => [...list, message].slice(-80));
  }, []);

  const expirePhoto = useCallback((id: string, notify: boolean) => {
    setMessages((list) => list.filter((msg) => {
      if (msg.id !== id) return true;
      if ('kind' in msg && msg.kind === 'photo') revoke(msg.url);
      return false;
    }));
    if (viewingRef.current?.id === id) {
      viewingRef.current = null;
      setViewing(null);
      // Close only the photo's history entry; never navigate away from the chat.
      if (window.location.hash === '#photo' && window.history.state?.pxlOverlay === 'photo') {
        window.history.back();
      }
    }
    if (notify) transport.current?.notifyExpired(id);
  }, [revoke]);

  const sendMedia = useCallback(async (kind: MediaKind, blob: Blob, chosenDuration?: PhotoDuration) => {
    if (!transport.current?.ready()) { setError('Media connection unavailable. Keep both chats open and try again.'); return false; }
    setSending(true); setError('');
    try {
      const id = await transport.current.send(kind, blob, chosenDuration);
      if (!alive.current) return false;
      const url = kind === 'voice' ? URL.createObjectURL(blob) : undefined;
      if (url) urls.current.add(url);
      append({ id, kind, fromId: current.id, url, duration: chosenDuration, sentAt: Date.now() });
      onInteraction(peer.id);
      return true;
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Could not send attachment.');
      return false;
    } finally { if (alive.current) setSending(false); }
  }, [append, current.id, onInteraction, peer.id]);

  useEffect(() => {
    alive.current = true;
    const db = getBrowserRealtime();
    const ids = [current.id, peer.id].sort();
    const channel = db.channel(`the-collection:dm:v1:${ids.join(':')}`, {
      config: { presence: { key: current.id }, broadcast: { ack: true, self: false } }
    });
    room.current = channel;
    const p2p = new EphemeralMediaTransport(channel, current.id, peer.id,
      (ready) => { if (alive.current) setMediaReady(ready); },
      (received) => {
        if (!alive.current) return;
        const url = URL.createObjectURL(received.blob);
        urls.current.add(url);
        append({ id: received.id, kind: received.kind, fromId: peer.id,
          url, duration: received.duration, sentAt: Date.now() });
        onInteraction(peer.id);
      },
      (id) => { if (alive.current) expirePhoto(id, false); }
    );
    transport.current = p2p;

    channel.on('broadcast', { event: MEDIA_SIGNAL_EVENT }, ({ payload }) => {
      if (alive.current) void p2p.handleSignal(payload);
    });
    channel.on('presence', { event: 'sync' }, () => {
      if (!alive.current) return;
      const joined = Object.keys(channel.presenceState()).includes(peer.id);
      setPeerReady(joined);
      if (joined) void p2p.maybeConnect();
      else p2p.peerLeft();
    });
    channel.on('broadcast', { event: 'message' }, ({ payload: rawPayload }) => {
      const msg = rawPayload as Partial<ChatMessage> | undefined;
      if (!alive.current || msg?.fromId !== peer.id || typeof msg.text !== 'string' || msg.text.length === 0 ||
        msg.text.length > 2000 || typeof msg.id !== 'string') return;
      append({ id: msg.id, fromId: peer.id, text: msg.text, sentAt: typeof msg.sentAt === 'number' ? msg.sentAt : Date.now() });
      onInteraction(peer.id);
    });
    channel.subscribe(async (status) => {
      if (!alive.current) return;
      if (status === 'SUBSCRIBED') {
        setRoomReady(true);
        await channel.track({ memberId: current.id });
        onInvite(peer);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRoomReady(false);
        setPeerReady(false);
        setMediaReady(false);
      }
    });
    return () => {
      alive.current = false;
      transport.current = null;
      p2p.close();
      room.current = null;
      if (recorderRef.current?.state === 'recording') {
        cancelRecording.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
      if (cameraVideo.current) cameraVideo.current.srcObject = null;
      if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
      photoRef.current && URL.revokeObjectURL(photoRef.current.url);
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
      void db.removeChannel(channel);
    };
  // A new component instance is mounted for each peer. This cleanup is the no-history boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, peer.id]);

  // Purge Object URLs for messages that fell out of the bounded in-memory timeline.
  useEffect(() => {
    const retained = new Set(messages.flatMap((message) => 'kind' in message && message.url ? [message.url] : []));
    if (viewing?.url) retained.add(viewing.url);
    for (const url of urls.current) if (!retained.has(url)) revoke(url);
  }, [messages, viewing, revoke]);

  // Opening and closing the photo is a modal-only navigation state. A mobile
  // swipe-back from #photo must expire the image, not clear the conversation.
  useEffect(() => {
    const onPhotoHistoryBack = () => {
      if (viewingRef.current && window.location.hash !== '#photo') {
        expirePhoto(viewingRef.current.id, true);
      }
    };
    window.addEventListener('popstate', onPhotoHistoryBack);
    return () => window.removeEventListener('popstate', onPhotoHistoryBack);
  }, [expirePhoto]);

  // Video preview is attached after camera permission is granted and the dialog mounts.
  useEffect(() => {
    if (!cameraOpen || !cameraStream.current || !cameraVideo.current) return;
    cameraVideo.current.srcObject = cameraStream.current;
    void cameraVideo.current.play().catch(() => setError('Could not start the camera preview.'));
  }, [cameraOpen]);

  useEffect(() => { photoRef.current = photo; }, [photo]);
  useEffect(() => { viewingRef.current = viewing; }, [viewing]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  useEffect(() => {
    if (!viewing) return;
    const tick = () => {
      const left = viewing.expiresAt - Date.now();
      setRemaining(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) expirePhoto(viewing.id, true);
    };
    tick();
    const interval = setInterval(tick, 150);
    const onHide = () => {
      if (document.visibilityState === 'hidden') expirePhoto(viewing.id, true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onHide); };
  }, [viewing, expirePhoto]);

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setRecordSeconds(Math.floor((Date.now() - recordingStarted.current) / 1000)), 200);
    return () => clearInterval(interval);
  }, [recording]);

  const sendText = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || !room.current || !roomReady || !peerReady || !online || sending) return;
    setSending(true); setError('');
    const message: ChatMessage = { id: crypto.randomUUID(), fromId: current.id, text: body, sentAt: Date.now() };
    try {
      const result = await room.current.send({ type: 'broadcast', event: 'message', payload: message });
      if (result !== 'ok' || !alive.current) throw new Error('Could not send message.');
      append(message);
      setText('');
      onInteraction(peer.id);
    } catch { if (alive.current) setError('Message was not sent. Check your connection.'); }
    finally { if (alive.current) setSending(false); }
  };

  const closeCamera = () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (cameraVideo.current) cameraVideo.current.srcObject = null;
    setCameraOpen(false);
    setCameraBusy(false);
    cameraBusyRef.current = false;
  };

  const openCamera = async (facing: 'environment' | 'user' = 'environment') => {
    if (cameraBusyRef.current) return;
    setAttachmentMenu(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera requires HTTPS and a browser that supports camera access.');
      return;
    }
    cameraBusyRef.current = true;
    setCameraBusy(true);
    // Release a previous camera track before switching between front and back.
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    try {
      // This is called directly by the user's Take Photo button: browser asks permission here.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } });
      if (!alive.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStream.current = stream;
      setCameraFacing(facing);
      setCameraOpen(true);
      setError('');
      if (cameraVideo.current) {
        cameraVideo.current.srcObject = stream;
        await cameraVideo.current.play().catch(() => {});
      }
    } catch (err) {
      if (alive.current) setError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow Camera for PXL in your browser settings.'
        : 'Camera unavailable. Check browser permissions, HTTPS and camera access.');
      setCameraOpen(false);
    } finally {
      cameraBusyRef.current = false;
      if (alive.current) setCameraBusy(false);
    }
  };

  const takePhoto = async () => {
    const video = cameraVideo.current;
    if (!video || !video.videoWidth || !video.videoHeight || !cameraStream.current) {
      setError('Camera is still starting. Try again.'); return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { setError('Camera capture is unavailable.'); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size > 3 * 1024 * 1024) { setError('Photo could not be captured.'); return; }
    if (!alive.current) return;
    closeCamera();
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    const url = URL.createObjectURL(blob);
    photoRef.current = { blob, url };
    setPhoto({ blob, url });
    setDuration(10);
    setTimerMenu(false);
    setError('');
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const blob = await compressPhoto(file);
      if (!alive.current) return;
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
      const url = URL.createObjectURL(blob);
      photoRef.current = { blob, url };
      setPhoto({ blob, url });
      setDuration(10);
      setTimerMenu(false);
      setError('');
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Could not open photo.'); }
  };
  const dismissPhoto = () => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    photoRef.current = null;
    setPhoto(null);
    setTimerMenu(false);
  };
  const sendPhoto = async () => {
    if (!photo || sending) return;
    const sent = await sendMedia('photo', photo.blob, duration);
    // Keep the preview open after a failed send so the user can retry.
    if (sent && alive.current) dismissPhoto();
  };

  const finishRecording = useCallback((discard = false) => {
    cancelRecording.current = discard;
    if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (recorderRef.current || startingRecorder.current || !roomReady || !peerReady || !online) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported by this browser.'); return;
    }
    startingRecorder.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || !transport.current?.ready()) {
        stream.getTracks().forEach((track) => track.stop());
        if (alive.current) setError('Media connection unavailable. Try again when both chats are open.');
        return;
      }
      const mime = recordingMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunks.current = [];
      cancelRecording.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunks.current.push(event.data); };
      recorder.onerror = () => { setError('Recording failed.'); finishRecording(true); };
      recorder.onstop = () => {
        const discard = cancelRecording.current;
        const chunks = recordingChunks.current.splice(0);
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
        if (alive.current) setRecording(false);
        if (!discard && alive.current && chunks.length) {
          const voice = new Blob(chunks, { type });
          if (voice.size) void sendMedia('voice', voice);
        }
      };
      recordingStarted.current = Date.now();
      recorder.start(250);
      setRecordSeconds(0);
      setRecording(true);
      setError('');
      recordingTimeout.current = setTimeout(() => finishRecording(), MAX_RECORDING_MS);
    } catch (err) { if (alive.current) setError(err instanceof DOMException && err.name === 'NotAllowedError'
      ? 'Microphone permission denied. Allow Microphone for PXL in browser settings.'
      : 'Microphone unavailable. Check browser permissions and HTTPS.'); }
    finally { startingRecorder.current = false; }
  }, [finishRecording, online, peerReady, roomReady, sendMedia]);

  const micDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse') {
      touchOrigin.current = event.clientX;
      touchHeld.current = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      void startRecording();
    }
  };
  const micMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (touchOrigin.current !== null && event.clientX < touchOrigin.current - 75) cancelRecording.current = true;
  };
  const micUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' && touchOrigin.current !== null) {
      touchOrigin.current = null;
      touchHeld.current = false;
      finishRecording(cancelRecording.current);
    }
  };
  const micClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (recording) finishRecording(); else void startRecording();
  };

  const openPhoto = (message: MediaMessage) => {
    if (message.kind !== 'photo' || !message.url || message.viewed || message.fromId === current.id) return;
    const active = { id: message.id, url: message.url, expiresAt: Date.now() + (message.duration ?? 10) * 1000 };
    viewingRef.current = active;
    // Adds a history entry without loading a new document or losing the chat.
    if (window.location.hash === '#chat') window.history.pushState({ pxlOverlay: 'photo' }, '', '#photo');
    setViewing(active);
    setMessages((list) => list.map((item) => item.id === message.id && 'kind' in item ? { ...item, viewed: true } : item));
  };

  const connected = roomReady && peerReady && online;
  return <main className="chat-page">
    <header className="chat-desktop-header"><button type="button" className="chat-return" onClick={onBack}><ArrowLeft size={18}/> BACK TO PXL</button><div className="chat-top-brand">PXL <span>✦</span></div></header>
    <div className="chat-stage"><div className="chat-phone">
      <header className="phone-header">
        <button type="button" className="phone-back" onClick={onBack} aria-label="Back to collection"><ArrowLeft size={21}/></button>
        <div className="phone-avatar"><PixelCoin username={peer.username}/></div>
        <div className="phone-peer"><strong>{peer.username}</strong><span>{connected ? 'here with you' : online ? 'connecting…' : 'not available right now'}</span></div>
        <span className={`header-presence ${online ? 'green' : ''}`} aria-label={online ? 'Active' : 'Inactive'}/>
      </header>
      <div className="phone-chat-history">
        {messages.length === 0 && <div className="chat-placeholder"><div className="chat-placeholder-coin"><PixelCoin username={peer.username} size="large"/></div><h2>{peer.username}</h2><p>{connected ? 'Say hello.' : 'Waiting for the other character…'}</p><div className="sparkle-line">✦ &nbsp; ✧ &nbsp; ✦</div></div>}
        <div className="bubbles" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`message-row ${message.fromId === current.id ? 'sent' : 'received'}`}>
            <div className={`message-bubble${'kind' in message ? ' message-media' : ''}`}>
              {'kind' in message ? message.kind === 'photo' ?
                (message.fromId === current.id
                  ? <span className="photo-token"><Camera size={16}/> Photo · {message.duration}s</span>
                  : <button type="button" className="photo-token" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openPhoto(message); }} disabled={!message.url || message.viewed}>
                    <Camera size={16}/> {message.viewed ? 'Viewed' : `View photo · ${message.duration}s`}</button>)
                : <VoiceBubble url={message.url}/>
                : <span className="message-text">{message.text}</span>}
              <time>{clockTime(message.sentAt)}</time>
            </div>
          </div>)}
          <div ref={bottom}/>
        </div>
      </div>
      <div className="chat-compose-zone">
        {error && <p className="chat-error" role="alert">{error}</p>}
        {recording && <div className="record-status"><span className="record-dot"/> Recording {recordSeconds}s / 60s · slide left to cancel <button type="button" onClick={() => finishRecording(true)}>Cancel</button></div>}
        <form className="compose-row" onSubmit={sendText}>
          <input ref={picker} className="hidden-file" type="file" accept="image/*" aria-label="Upload photo from gallery" onChange={(event) => { void choosePhoto(event); }}/>
          <div className="compose-attachment-wrap">
            <button type="button" className="compose-attach" disabled={!connected || sending} onClick={() => setAttachmentMenu((open) => !open)} aria-label="Photo options" aria-expanded={attachmentMenu}><ImagePlus size={19}/></button>
            {attachmentMenu && <div className="attach-menu" role="group" aria-label="Photo options">
              <button type="button" disabled={cameraBusy} onClick={() => { void openCamera(); }}><Camera size={17}/> Take Photo</button>
              <button type="button" onClick={() => { setAttachmentMenu(false); picker.current?.click(); }}><ImagePlus size={17}/> Upload Photo</button>
            </div>}
          </div>
          <input aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} placeholder={connected ? 'Message…' : 'Waiting for connection…'} maxLength={2000} disabled={!connected || sending || recording} autoComplete="off" />
          {text.trim()
            ? <button type="submit" className="compose-send" aria-label="Send message" disabled={!connected || sending}><Send size={18}/></button>
            : <button type="button" className={`compose-mic${recording ? ' is-recording' : ''}`} aria-label={recording ? 'Stop and send voice recording' : 'Record voice message'} title="Hold to record on phone; tap to start/stop on desktop"
                disabled={!connected || sending} onPointerDown={micDown} onPointerMove={micMove} onPointerUp={micUp} onPointerCancel={() => { touchOrigin.current = null; touchHeld.current = false; finishRecording(true); }} onClick={micClick}><Mic size={19}/></button>}
        </form>
      </div>
    </div></div>

    {cameraOpen && <div className="camera-capture-overlay" role="dialog" aria-modal="true" aria-label="Take photo">
      <div className="camera-capture-shell">
        <div className="camera-capture-top"><button type="button" aria-label="Cancel camera" onClick={closeCamera}><X size={22}/></button><strong>Take Photo</strong><span/></div>
        <video ref={cameraVideo} className="camera-capture-video" autoPlay playsInline muted aria-label="Live camera preview"/>
        <div className="camera-capture-actions">
          <button type="button" className="camera-switch-button" onClick={() => { void openCamera(cameraFacing === 'environment' ? 'user' : 'environment'); }} disabled={cameraBusy} aria-label="Switch camera">Flip camera</button>
          <button type="button" className="camera-shutter-button" onClick={() => { void takePhoto(); }} aria-label="Capture photo"><span/></button>
          <span className="camera-action-spacer"/>
        </div>
      </div>
    </div>}

    {photo && <div className="photo-preview-overlay" role="dialog" aria-modal="true" aria-label="Photo preview">
      <div className="photo-preview-shell">
        <div className="photo-preview-top"><button type="button" aria-label="Cancel photo" onClick={dismissPhoto}><X size={21}/></button><span>Preview</span><span/></div>
        {/* blob: object URLs exist only in browser memory and are revoked on exit. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo-preview-image" src={photo.url} alt="Selected photo preview" />
        <div className="photo-preview-actions">
          <div className="photo-timer-control">
            <button type="button" className="photo-timer-button" onClick={() => setTimerMenu((open) => !open)} aria-label="Select photo view time" aria-expanded={timerMenu}>
              <Timer size={15}/> {duration}s <ChevronUp size={13}/></button>
            {timerMenu && <div className="photo-duration-menu" role="group" aria-label="Photo duration">
              {([3, 10, 20] as const).map((value) => <button key={value} type="button" onClick={() => { setDuration(value); setTimerMenu(false); }}>
                {value}s {duration === value && <Check size={14}/>}</button>)}
            </div>}
          </div>
          <button type="button" className="photo-send-button" disabled={!mediaReady || sending} onClick={() => { void sendPhoto(); }}>
            {sending ? 'Sending…' : !mediaReady ? 'Connecting…' : 'Send'} <Send size={17}/></button>
        </div>
      </div>
    </div>}

    {viewing && <div className="photo-viewer-overlay" role="dialog" aria-modal="true" aria-label="Disappearing photo">
      <div className="photo-viewer-top"><span><Timer size={17}/> {remaining}s</span><button type="button" aria-label="Close and expire photo" onClick={() => expirePhoto(viewing.id, true)}><X size={21}/></button></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={viewing.url} alt="Temporary photo" draggable={false}/>
    </div>}
  </main>;
}
