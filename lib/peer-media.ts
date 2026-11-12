/*
 * Ephemeral binary media over an encrypted WebRTC DataChannel.
 * Supabase Broadcast carries ONLY ephemeral SDP/ICE signaling (no media bytes).
 * There is intentionally no persistence, IndexedDB, caches, or upload endpoint.
 * TURN is not configured: strict/symmetric NATs may prevent P2P connectivity.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

export type PhotoDuration = 3 | 10 | 20;
export type MediaKind = 'photo' | 'voice';
export type ReceivedMedia = {
  id: string;
  kind: MediaKind;
  mime: string;
  blob: Blob;
  duration?: PhotoDuration;
};
export type MediaSignal = {
  to?: string;
  from?: string;
  signal?: 'offer' | 'answer' | 'ice';
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const MAX_TRANSFER_BYTES = 3 * 1024 * 1024;
const CHUNK_BYTES = 16 * 1024;
const BUFFER_LIMIT = 256 * 1024;
const SIGNAL_EVENT = 'pxl-media-signal';
const ALLOWED_MIME = /^(image\/(jpeg|png|webp)|audio\/(webm|mp4|ogg|mpeg|x-m4a))(;.*)?$/i;

interface TransferHeader {
  type: 'begin';
  id: string;
  kind: MediaKind;
  size: number;
  mime: string;
  duration?: PhotoDuration;
}

type IncomingTransfer = { header: TransferHeader; chunks: ArrayBuffer[]; size: number };

export function validPhotoDuration(value: unknown): value is PhotoDuration {
  return value === 3 || value === 10 || value === 20;
}

export function validTransferHeader(value: unknown): value is TransferHeader {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<TransferHeader>;
  return v.type === 'begin' && typeof v.id === 'string' && /^[0-9a-f-]{36}$/i.test(v.id)
    && (v.kind === 'photo' || v.kind === 'voice') && typeof v.size === 'number'
    && Number.isSafeInteger(v.size) && v.size > 0 && v.size <= MAX_TRANSFER_BYTES
    && typeof v.mime === 'string' && v.mime.length <= 100 && ALLOWED_MIME.test(v.mime)
    && (v.kind === 'photo' ? validPhotoDuration(v.duration) && v.mime.startsWith('image/')
      : v.mime.startsWith('audio/'));
}

function waitForRoomBuffer(channel: RTCDataChannel, isClosed: () => boolean): Promise<void> {
  if (channel.readyState !== 'open' || isClosed()) return Promise.reject(new Error('Media channel closed.'));
  if (channel.bufferedAmount < BUFFER_LIMIT) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Media transfer timed out.')), 20_000);
    function finish(error?: Error) {
      clearTimeout(timeout);
      channel.removeEventListener('bufferedamountlow', onLow);
      channel.removeEventListener('close', onClose);
      if (error) reject(error);
      else resolve();
    }
    function onLow() { finish(isClosed() ? new Error('Chat closed.') : undefined); }
    function onClose() { finish(new Error('Media channel closed.')); }
    channel.bufferedAmountLowThreshold = BUFFER_LIMIT / 2;
    channel.addEventListener('bufferedamountlow', onLow, { once: true });
    channel.addEventListener('close', onClose, { once: true });
    // Close the race between the threshold check and listener registration.
    if (channel.bufferedAmount < BUFFER_LIMIT / 2) onLow();
  });
}

export class EphemeralMediaTransport {
  private pc: RTCPeerConnection | null = null;
  private wire: RTCDataChannel | null = null;
  private incoming: IncomingTransfer | null = null;
  private queuedIce: RTCIceCandidateInit[] = [];
  private closed = false;
  private sending = false;

  constructor(
    private readonly signaling: RealtimeChannel,
    private readonly ownId: string,
    private readonly peerId: string,
    private readonly onReady: (ready: boolean) => void,
    private readonly onReceive: (file: ReceivedMedia) => void,
    private readonly onExpired: (id: string) => void,
  ) {}

  private async broadcast(payload: Omit<MediaSignal, 'from' | 'to'>) {
    if (this.closed) return;
    await this.signaling.send({
      type: 'broadcast', event: SIGNAL_EVENT,
      payload: { ...payload, from: this.ownId, to: this.peerId },
    });
  }

  private attachWire(wire: RTCDataChannel) {
    this.wire = wire;
    wire.binaryType = 'arraybuffer';
    wire.onopen = () => { if (!this.closed) this.onReady(true); };
    wire.onclose = () => { if (!this.closed) this.onReady(false); };
    wire.onerror = () => { if (!this.closed) this.onReady(false); };
    wire.onmessage = (event: MessageEvent) => {
      if (this.closed) return;
      if (typeof event.data === 'string') {
        let header: unknown;
        try { header = JSON.parse(event.data); } catch { return; }
        if (validTransferHeader(header)) {
          this.incoming = { header, chunks: [], size: 0 };
        } else if (header && typeof header === 'object') {
          const msg = header as { type?: string; id?: string };
          if (msg.type === 'expired' && typeof msg.id === 'string' && /^[0-9a-f-]{36}$/i.test(msg.id)) {
            this.onExpired(msg.id);
          }
        }
        return;
      }
      const transfer = this.incoming;
      if (!transfer || !(event.data instanceof ArrayBuffer)) return;
      const next = new Uint8Array(event.data);
      if (!next.byteLength || next.byteLength > CHUNK_BYTES || transfer.size + next.byteLength > transfer.header.size) {
        this.incoming = null;
        return;
      }
      transfer.chunks.push(event.data);
      transfer.size += next.byteLength;
      if (transfer.size === transfer.header.size) {
        this.incoming = null;
        const { header, chunks } = transfer;
        const blob = new Blob(chunks, { type: header.mime });
        this.onReceive({ id: header.id, kind: header.kind, duration: header.duration, mime: header.mime, blob });
      }
    };
  }

  private createConnection() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.pc = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) void this.broadcast({ signal: 'ice', candidate: event.candidate.toJSON() });
    };
    pc.ondatachannel = (event) => this.attachWire(event.channel);
    pc.onconnectionstatechange = () => {
      if (!this.closed && (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected')) {
        this.onReady(false);
      }
    };
    return pc;
  }

  // Exactly one side originates the offer, preventing glare.
  async maybeConnect() {
    if (this.closed || this.ownId >= this.peerId || this.pc) return;
    try {
      const pc = this.createConnection();
      this.attachWire(pc.createDataChannel('pxl-media-v1', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.broadcast({ signal: 'offer', description: pc.localDescription?.toJSON() });
    } catch { this.onReady(false); }
  }

  async handleSignal(value: unknown) {
    if (this.closed || !value || typeof value !== 'object') return;
    const msg = value as MediaSignal;
    if (msg.to !== this.ownId || msg.from !== this.peerId) return;
    try {
      if (msg.signal === 'offer' && msg.description?.type === 'offer' && this.ownId > this.peerId) {
        if (this.pc) this.resetConnection();
        const pc = this.createConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(msg.description));
        await this.flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.broadcast({ signal: 'answer', description: pc.localDescription?.toJSON() });
      } else if (msg.signal === 'answer' && msg.description?.type === 'answer' && this.pc && this.ownId < this.peerId) {
        if (this.pc.signalingState !== 'have-local-offer') return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.description));
        await this.flushIce(this.pc);
      } else if (msg.signal === 'ice' && msg.candidate && typeof msg.candidate.candidate === 'string') {
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(msg.candidate);
        else if (this.queuedIce.length < 40) this.queuedIce.push(msg.candidate);
      }
    } catch { this.onReady(false); }
  }

  private async flushIce(pc: RTCPeerConnection) {
    const pending = this.queuedIce.splice(0);
    for (const candidate of pending) {
      try { await pc.addIceCandidate(candidate); } catch { /* remote candidates may have gone stale */ }
    }
  }

  private resetConnection() {
    this.incoming = null;
    this.wire?.close();
    this.pc?.close();
    this.pc = null;
    this.wire = null;
    this.onReady(false);
  }

  async send(kind: MediaKind, blob: Blob, duration?: PhotoDuration): Promise<string> {
    const wire = this.wire;
    if (this.closed || !wire || wire.readyState !== 'open') throw new Error('Both characters must have an active media connection.');
    if (this.sending) throw new Error('Another attachment is being sent.');
    if (!blob.size || blob.size > MAX_TRANSFER_BYTES || !ALLOWED_MIME.test(blob.type)) throw new Error('This file cannot be sent.');
    if (kind === 'photo' && !validPhotoDuration(duration)) throw new Error('Choose a valid photo timer.');
    if (kind === 'voice' && !blob.type.startsWith('audio/')) throw new Error('Invalid audio format.');
    if (kind === 'photo' && !blob.type.startsWith('image/')) throw new Error('Invalid image format.');
    const id = crypto.randomUUID();
    this.sending = true;
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (this.closed || wire.readyState !== 'open') throw new Error('Chat closed.');
      wire.send(JSON.stringify({ type: 'begin', id, kind, size: data.byteLength, mime: blob.type, duration } satisfies TransferHeader));
      for (let i = 0; i < data.length; i += CHUNK_BYTES) {
        await waitForRoomBuffer(wire, () => this.closed);
        wire.send(data.subarray(i, Math.min(i + CHUNK_BYTES, data.length)));
      }
      return id;
    } finally { this.sending = false; }
  }

  notifyExpired(id: string) {
    if (!this.closed && this.wire?.readyState === 'open') {
      this.wire.send(JSON.stringify({ type: 'expired', id }));
    }
  }

  peerLeft() {
    if (!this.closed) {
      this.resetConnection();
      this.queuedIce = [];
    }
  }

  ready() { return !this.closed && this.wire?.readyState === 'open'; }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.resetConnection();
    this.queuedIce = [];
  }
}

export const MEDIA_SIGNAL_EVENT = SIGNAL_EVENT;
