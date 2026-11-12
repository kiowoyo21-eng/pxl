'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp, Compass, LogOut, RefreshCw, Send, Shield, Sparkles, X } from 'lucide-react';
import { getBrowserRealtime } from '@/lib/supabase-browser';
import type { ChatMessage, Member } from '@/lib/types';
import PixelCoin from './pixel-coin';
import PwaInstallButton from './pwa-install-button';

type UiStage = 'name' | 'pin-login' | 'pin-register';
type InvitePayload = { to: string; from: string };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Please try again.');
  return result as T;
}

export default function CollectionApp() {
  const [current, setCurrent] = useState<Member | null>(null);
  const [booting, setBooting] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [connection, setConnection] = useState<'joining' | 'connected' | 'disconnected'>('joining');
  const [activePeer, setActivePeer] = useState<Member | null>(null);
  const [invitation, setInvitation] = useState<Member | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reorderVersion, setReorderVersion] = useState(0);
  const interactionCounts = useRef<Map<string, number>>(new Map());
  const membersRef = useRef<Member[]>([]);
  const currentRef = useRef<Member | null>(null);
  const activePeerRef = useRef<Member | null>(null);
  const lobbyRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { activePeerRef.current = activePeer; }, [activePeer]);

  const loadMembers = useCallback(async () => {
    const result = await getJson<{ members: Member[] }>('/api/members');
    setMembers(result.members);
  }, []);

  useEffect(() => {
    let alive = true;
    if (window.location.hash === '#chat') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    getJson<{ member: Member }>('/api/me')
      .then(({ member }) => { if (alive) setCurrent(member); })
      .catch(() => { if (alive) setCurrent(null); })
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    loadMembers().catch(() => { if (!cancelled) setConnection('disconnected'); });
    const timer = window.setInterval(() => { loadMembers().catch(() => {}); }, 45_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [current, loadMembers]);

  useEffect(() => {
    if (!current) return;
    let db;
    try { db = getBrowserRealtime(); }
    catch { setConnection('disconnected'); return; }

    let alive = true;
    let joined = false;
    const lobby = db.channel('the-collection:lobby:v1', {
      config: { presence: { key: current.id }, broadcast: { ack: true, self: false } }
    });
    lobbyRef.current = lobby;
    setConnection('joining');

    lobby.on('presence', { event: 'sync' }, () => {
      if (!alive) return;
      setOnlineIds(new Set(Object.keys(lobby.presenceState())));
    });
    lobby.on('broadcast', { event: 'invite' }, ({ payload }) => {
      const invite = payload as Partial<InvitePayload> | undefined;
      if (!alive || invite?.to !== current.id || activePeerRef.current?.id === invite.from) return;
      const sender = membersRef.current.find((m) => m.id === invite.from);
      if (sender && sender.id !== current.id && Object.keys(lobby.presenceState()).includes(sender.id)) {
        setInvitation(sender);
      }
    });
    lobby.on('broadcast', { event: 'roster-change' }, () => {
      if (alive) loadMembers().catch(() => {});
    });
    lobby.subscribe(async (status) => {
      if (!alive) return;
      if (status === 'SUBSCRIBED') {
        joined = true;
        setConnection('connected');
        if (document.visibilityState === 'visible') {
          await lobby.track({ memberId: current.id });
        }
        // Refresh any collections already open after this member logs in/registers.
        await lobby.send({ type: 'broadcast', event: 'roster-change', payload: {} });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        joined = false;
        setConnection('disconnected');
        setOnlineIds(new Set());
      }
    });

    const visibility = () => {
      if (!alive || !joined) return;
      if (document.visibilityState === 'hidden') void lobby.untrack();
      else void lobby.track({ memberId: current.id });
    };
    const pagehide = () => { void lobby.untrack(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      if (lobbyRef.current === lobby) lobbyRef.current = null;
      void db.removeChannel(lobby);
    };
  }, [current, loadMembers]);

  useEffect(() => {
    const onPop = () => { setActivePeer(null); setInvitation(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const sorted = useMemo(() => {
    return members.slice().sort((a, b) => {
      const diff = (interactionCounts.current.get(b.id) || 0) - (interactionCounts.current.get(a.id) || 0);
      if (diff !== 0) return diff;
      return a.created_at.localeCompare(b.created_at) || a.username.localeCompare(b.username);
    });
    // Re-evaluate only on wall return, not with every message; collection coins never jump mid-browse.
  }, [members, reorderVersion]);

  const choosePeer = (member: Member) => {
    if (!current || member.id === current.id || !onlineIds.has(member.id)) return;
    setInvitation(null);
    setActivePeer(member);
    if (window.location.hash !== '#chat') window.history.pushState({ collectionChat: true }, '', '#chat');
  };

  const closeChat = () => {
    setActivePeer(null); // Unmounts chat immediately; all content leaves React memory.
    setReorderVersion((v) => v + 1);
    if (window.location.hash === '#chat') window.history.back();
  };

  const countInteraction = useCallback((id: string) => {
    interactionCounts.current.set(id, (interactionCounts.current.get(id) ?? 0) + 1);
  }, []);

  const sendInvite = useCallback((peer: Member) => {
    const lobby = lobbyRef.current;
    if (lobby) void lobby.send({ type: 'broadcast', event: 'invite', payload: { to: peer.id, from: currentRef.current?.id } });
  }, []);

  const logOut = async () => {
    try {
      await getJson('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setActivePeer(null);
      setCurrent(null);
      setMembers([]);
      setOnlineIds(new Set());
      interactionCounts.current.clear();
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch { window.alert('Could not sign out. Please retry.'); }
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    try { await loadMembers(); } catch { window.alert('Could not refresh the collection.'); }
    finally { setRefreshing(false); }
  };

  if (booting) return <div className="boot-screen"><div className="loading-orb" /><span>OPENING PXL</span></div>;
  if (!current) return <SignIn onSuccess={setCurrent} />;

  if (activePeer) {
    return <ChatView key={activePeer.id} current={current} peer={activePeer}
      online={onlineIds.has(activePeer.id)} onBack={closeChat} onInteraction={countInteraction}
      onInvite={sendInvite} />;
  }

  const onlineCount = members.filter((m) => onlineIds.has(m.id)).length;
  return <main className="app-shell">
    <header className="main-nav">
      <div className="brand-row">
        <div className="brand-emblem"><span>✦</span></div>
        <div><div className="brand-title">PXL<span className="brand-point">.</span></div>
          <div className="brand-caption">CHARACTER ARCHIVE / VOL. 01</div></div>
      </div>
      <div className="nav-actions">
        <PwaInstallButton />
        <span className="nav-you" title="Current character">COLLECTOR <strong>{current.username}</strong></span>
        <button type="button" className="icon-action" aria-label="Refresh collection" title="Refresh collection" onClick={manualRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''}/></button>
        <button type="button" className="icon-action" aria-label="Log out" title="Log out" onClick={logOut}><LogOut size={17}/></button>
      </div>
    </header>

    <section className="collection-content">
      <div className="eyebrow"><span className="eyebrow-line"/> A SMALL UNIVERSE OF CHARACTERS <span className="eyebrow-line"/></div>
      <h1 className="collection-title">Choose your <em>character.</em></h1>
      <p className="collection-subtitle">Every token holds a story. Find a familiar face.</p>
      <div className="collection-meta">
        <span><Compass size={14}/> {members.length} COLLECTED</span>
        <span className="meta-separator"/>
        <span><span className="tiny-dot green"/>{connection === 'connected' ? `${onlineCount} PRESENT` : 'CONNECTING'}</span>
      </div>

      {connection === 'disconnected' && <div className="connection-warning" role="alert">Realtime connection unavailable. Status dots and chats may not work until reconnected.</div>}

      <div className="roster-grid" aria-label="Character collection">
        {sorted.map((member, index) => {
          const isSelf = member.id === current.id;
          const active = onlineIds.has(member.id);
          return <button type="button" key={member.id}
            className={`character-slot${isSelf ? ' character-self' : ''}${active && !isSelf ? ' can-select' : ''}`}
            disabled={isSelf || !active} onClick={() => choosePeer(member)}
            aria-label={isSelf ? `${member.username}, your character` : `${member.username}, ${active ? 'available to chat' : 'not available'}`}>
            <div className="slot-index">{String(index + 1).padStart(2, '0')}<span> / TOKEN</span></div>
            <PixelCoin username={member.username} online={active}/>
            <div className="coin-name">{member.username}</div>
            <div className="coin-subline">{isSelf ? 'YOUR TOKEN' : 'CHARACTER TOKEN'}</div>
            {isSelf && <span className="self-marker">YOU</span>}
          </button>;
        })}
      </div>
      {members.length === 0 && <div className="empty-state">Your collection is loading… <button onClick={manualRefresh}>Try again</button></div>}
      <footer className="collection-footer"><span>EST. 2026 · A LITTLE CORNER OF THE INTERNET</span><span><Shield size={13}/> NO CHAT HISTORY</span></footer>
    </section>

    {invitation && <div className="invite-overlay" role="dialog" aria-modal="true" aria-label="Character invitation">
      <div className="invite-card">
        <button className="invite-dismiss" onClick={() => setInvitation(null)} aria-label="Dismiss invite"><X size={18}/></button>
        <div className="invite-mini"><PixelCoin username={invitation.username} online={true}/></div>
        <span className="section-label">ANOTHER CHARACTER IS HERE</span>
        <h2>{invitation.username} wants to connect.</h2>
        <p>A temporary conversation. Nothing is saved in your chat history.</p>
        <div className="invite-actions"><button onClick={() => setInvitation(null)} className="btn-quiet">Not now</button><button className="btn-primary" onClick={() => choosePeer(invitation)}>Open chat <ArrowRight size={16}/></button></div>
      </div>
    </div>}
  </main>;
}

function SignIn({ onSuccess }: { onSuccess: (member: Member) => void }) {
  const [stage, setStage] = useState<UiStage>('name');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const isRegistration = stage === 'pin-register';

  const checkName = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(name)) { setError('Choose 1–3 letters, A to Z.'); return; }
    setWorking(true); setError('');
    try {
      const result = await getJson<{ exists: boolean }>('/api/auth/identity?username=' + encodeURIComponent(name));
      setUsername(name); setStage(result.exists ? 'pin-login' : 'pin-register');
    } catch (err) { setError((err as Error).message); }
    finally { setWorking(false); }
  };

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setError('Your PIN must contain exactly 6 digits.'); return; }
    if (isRegistration && pin !== confirm) { setError('PINs do not match.'); return; }
    setWorking(true); setError('');
    try {
      const result = await getJson<{ member: Member }>(`/api/auth/${isRegistration ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin })
      });
      setPin(''); setConfirm(''); onSuccess(result.member);
    } catch (err) {
      setPin(''); setConfirm(''); setError((err as Error).message);
    } finally { setWorking(false); }
  };

  const reset = () => { setStage('name'); setPin(''); setConfirm(''); setError(''); };

  return <main className="auth-page">
    <section className="auth-art">
      <div className="auth-art-top"><div className="brand-emblem small">✦</div><span>PXL / VOLUME 01</span></div>
      <div className="auth-art-main">
        <div className="hero-star hero-star-a">✦</div><div className="hero-star hero-star-b">✧</div>
        <div className="coin-hero coin-hero-left"><PixelCoin username="ACE" size="large"/></div>
        <div className="coin-hero coin-hero-main"><PixelCoin username={username || 'YOU'} size="large" /></div>
        <div className="coin-hero coin-hero-right"><PixelCoin username="XY" size="large"/></div>
        <div className="auth-art-tag">01 / PXL CHARACTER ARCHIVE</div>
      </div>
      <div className="auth-art-bottom"><h1>A little<br/>world of <i>characters.</i></h1><p>Not another inbox. Just your own corner of the universe.</p></div>
    </section>

    <section className="auth-pane">
      <div className="auth-install-action"><PwaInstallButton /></div>
      <div className="auth-top-mobile"><div className="brand-emblem small">✦</div><span>PXL</span></div>
      <div className="auth-form-wrap">
        <div className="section-label">WELCOME TO THE ARCHIVE</div>
        <h2>{stage === 'name' ? 'Claim your character.' : isRegistration ? 'Make it yours.' : 'Welcome back.'}</h2>
        <p>{stage === 'name' ? 'Every character starts with a name. What should we call yours?' : isRegistration ? `A new character called ${username}. Secure it with a 6-digit PIN.` : `Found ${username} in the collection. Enter your PIN to continue.`}</p>

        {stage === 'name' ? <form onSubmit={checkName} noValidate>
          <label className="field-label" htmlFor="character-name">CHARACTER NAME</label>
          <div className="name-field"><span>@</span><input id="character-name" aria-label="Character name" autoComplete="off" autoCapitalize="characters" maxLength={3} placeholder="ABC" value={username} onChange={e => { setUsername(e.target.value.replace(/[^a-z]/gi, '').toUpperCase()); setError(''); }} autoFocus/></div>
          <div className="field-hint">1–3 letters · case-insensitive · unique to you</div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="big-button" type="submit" disabled={working || !username}>{working ? 'Checking…' : 'Continue'}<ArrowRight size={18}/></button>
        </form> : <form onSubmit={submitPin} noValidate>
          <div className="chosen-name"><span>CHARACTER ID</span><strong>{username}</strong><button type="button" onClick={reset}>Change</button></div>
          <label className="field-label" htmlFor="character-pin">{isRegistration ? 'CREATE YOUR SIX-DIGIT PIN' : 'YOUR SIX-DIGIT PIN'}</label>
          <input className="pin-field" id="character-pin" type="password" inputMode="numeric" autoComplete={isRegistration ? 'new-password' : 'current-password'} maxLength={6} placeholder="••••••" value={pin} onChange={e => {setPin(e.target.value.replace(/\D/g, ''));setError('');}} autoFocus/>
          {isRegistration && <><label className="field-label second-label" htmlFor="confirm-pin">CONFIRM PIN</label><input className="pin-field" id="confirm-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="••••••" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}/></>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="big-button" type="submit" disabled={working || pin.length !== 6 || (isRegistration && confirm.length !== 6)}>{working ? 'Just a moment…' : isRegistration ? 'Create character' : 'Enter collection'}<ArrowRight size={18}/></button>
          <div className="auth-pinfo"><CircleHelp size={14}/>{isRegistration ? 'Remember your PIN. Only an administrator can reset it.' : 'Forgot your PIN? Ask the administrator for a reset.'}</div>
        </form>}
        <div className="auth-footnote"><Sparkles size={14}/> A COLLECTION OF PEOPLE, NOT MESSAGES.</div>
      </div>
      <div className="auth-copyright">© PXL · PRIVATE SPACE</div>
    </section>
  </main>;
}

function ChatView({ current, peer, online, onBack, onInteraction, onInvite }: {
  current: Member;
  peer: Member;
  online: boolean;
  onBack: () => void;
  onInteraction: (id: string) => void;
  onInvite: (peer: Member) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [peerReady, setPeerReady] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef<RealtimeChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(true);

  useEffect(() => {
    const db = getBrowserRealtime();
    const ids = [current.id, peer.id].sort();
    const channel = db.channel(`the-collection:dm:v1:${ids.join(':')}`, {
      config: { presence: { key: current.id }, broadcast: { ack: true, self: false } }
    });
    liveRef.current = true;
    roomRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      if (liveRef.current) setPeerReady(Object.keys(channel.presenceState()).includes(peer.id));
    });
    channel.on('broadcast', { event: 'message' }, ({ payload: rawPayload }) => {
      const payload = rawPayload as Partial<ChatMessage> | undefined;
      if (!liveRef.current || payload?.fromId !== peer.id || typeof payload.text !== 'string'
        || payload.text.length === 0 || payload.text.length > 2000 || typeof payload.id !== 'string') return;
      setMessages((prev) => [...prev, {
        id: payload.id!, fromId: peer.id, text: payload.text!,
        sentAt: typeof payload.sentAt === 'number' ? payload.sentAt : Date.now()
      }].slice(-150));
      onInteraction(peer.id);
    });
    channel.subscribe(async (status) => {
      if (!liveRef.current) return;
      if (status === 'SUBSCRIBED') {
        setRoomReady(true);
        await channel.track({ memberId: current.id });
        onInvite(peer);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRoomReady(false);
        setPeerReady(false);
      }
    });
    return () => {
      liveRef.current = false;
      roomRef.current = null;
      // Unmount disposes all chat state; never persist or log messages.
      void db.removeChannel(channel);
    };
  }, [current.id, peer.id, onInteraction, onInvite]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || body.length > 2000 || !roomReady || !peerReady || !online || sending || !roomRef.current) return;
    setSending(true); setError('');
    const message: ChatMessage = { id: crypto.randomUUID(), fromId: current.id, text: body, sentAt: Date.now() };
    try {
      const ack = await roomRef.current.send({ type: 'broadcast', event: 'message', payload: message });
      if (ack !== 'ok' || !liveRef.current) throw new Error('Could not send. Try again.');
      setMessages((prev) => [...prev, message].slice(-150));
      setText('');
      onInteraction(peer.id);
    } catch { if (liveRef.current) setError('Message was not sent. Check your connection.'); }
    finally { if (liveRef.current) setSending(false); }
  };

  const connected = peerReady && roomReady && online;
  return <main className="chat-page">
    <header className="chat-desktop-header"><button className="chat-return" onClick={onBack}><ArrowLeft size={18}/> BACK TO PXL</button><div className="chat-top-brand">PXL <span>✦</span></div><span className="chat-header-right">TEMPORARY CHANNEL</span></header>
    <div className="chat-stage"><div className="chat-phone">
      <header className="phone-header">
        <button type="button" className="phone-back" onClick={onBack} aria-label="Back to collection"><ArrowLeft size={21}/></button>
        <div className="phone-avatar"><PixelCoin username={peer.username}/></div>
        <div className="phone-peer"><strong>{peer.username}</strong><span>{connected ? 'here with you' : online ? 'waiting to connect…' : 'not available right now'}</span></div>
        <span className={`header-presence ${online ? 'green' : ''}`} aria-label={online ? 'Active' : 'Inactive'} />
      </header>
      <div className="phone-chat-history">
        <div className="privacy-toast"><Shield size={14}/><span>Ephemeral conversation. Messages are never saved to the app database.</span></div>
        {messages.length === 0 && <div className="chat-placeholder"><div className="chat-placeholder-coin"><PixelCoin username={peer.username} size="large"/></div><h2>{peer.username}</h2><p>{connected ? 'Your conversation starts here. Say hello.' : 'Waiting for both characters to join this channel.'}</p><div className="sparkle-line">✦ &nbsp; ✧ &nbsp; ✦</div></div>}
        <div className="bubbles" aria-live="polite">
          {messages.map((message) => <div className={`message-row ${message.fromId === current.id ? 'sent' : 'received'}`} key={message.id}>
            <div className="message-bubble"><span className="message-text">{message.text}</span><time>{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
          </div>)}
          <div ref={bottomRef}/>
        </div>
      </div>
      <div className="chat-compose-zone">
        {error && <p className="chat-error" role="alert">{error}</p>}
        <form className="compose-row" onSubmit={sendMessage}>
          <input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder={connected ? 'Message…' : 'Waiting for connection…'} maxLength={2000} disabled={!connected || sending} autoComplete="off" />
          <button type="submit" aria-label="Send message" disabled={!text.trim() || !connected || sending}><Send size={19}/></button>
        </form>
        <div className="compose-foot">LEAVE THIS CHAT TO ERASE ITS MESSAGES <ChevronRight size={11}/></div>
      </div>
    </div></div>
  </main>;
}
