"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Servidores STUN públicos de Google — suficientes para la mayoría de
// redes hogareñas/oficina. No hay servidor TURN (tiene costo), así que
// en redes muy restrictivas (NAT simétrico, algunos firewalls corporativos)
// la conexión directa puede fallar — si eso pasa seguido, se puede agregar
// un TURN de pago más adelante.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const LOCAL_KEY = "__local__";
const SPEAKING_THRESHOLD = 14;

export type VoiceParticipant = { userId: string; name: string; speaking: boolean };

type OfferPayload = { from: string; fromName: string; to: string; sdp: RTCSessionDescriptionInit };
type AnswerPayload = { from: string; to: string; sdp: RTCSessionDescriptionInit };
type IceCandidatePayload = { from: string; to: string; candidate: RTCIceCandidateInit };
type LeavePayload = { userId: string };

/** Llamada de voz en vivo estilo Discord — malla WebRTC (cada quien se
 * conecta directo con cada quien), con Supabase Realtime como servidor de
 * señalización (broadcast para offer/answer/ICE, presence para saber
 * quién está en la sala). Pensado para equipos chicos (hasta 6-8
 * personas) — con más gente, una malla completa empieza a pesar. */
export function useVoiceRoom(roomKey: string, userId: string, userName: string) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);

  const supabaseRef = useRef(createClient());
  const rtChannelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanupPeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    const audioEl = audioElsRef.current.get(peerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioElsRef.current.delete(peerId);
    }
    analysersRef.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.userId !== peerId));
  }, []);

  const attachAnalyser = useCallback((key: string, stream: MediaStream) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analysersRef.current.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
    } catch {
      // Detección de "quién habla" es cosmética — si falla, la llamada sigue igual.
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, peerName: string, channel: RealtimeChannel) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((t) => {
        if (localStreamRef.current) pc.addTrack(t, localStreamRef.current);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channel.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { from: userId, to: peerId, candidate: e.candidate.toJSON() } satisfies IceCandidatePayload,
          });
        }
      };
      pc.ontrack = (e) => {
        let audioEl = audioElsRef.current.get(peerId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          audioElsRef.current.set(peerId, audioEl);
        }
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(() => {});
        attachAnalyser(peerId, e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") cleanupPeer(peerId);
      };

      peersRef.current.set(peerId, pc);
      setParticipants((prev) =>
        prev.some((p) => p.userId === peerId) ? prev : [...prev, { userId: peerId, name: peerName, speaking: false }],
      );
      return pc;
    },
    [userId, attachAnalyser, cleanupPeer],
  );

  const leave = useCallback(() => {
    const channel = rtChannelRef.current;
    if (channel) {
      channel.send({ type: "broadcast", event: "leave", payload: { userId } satisfies LeavePayload });
      channel.untrack();
      supabaseRef.current.removeChannel(channel);
      rtChannelRef.current = null;
    }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audioElsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    audioElsRef.current.clear();
    analysersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setParticipants([]);
    setJoined(false);
    setMuted(false);
    setLocalSpeaking(false);
  }, [userId]);

  const join = useCallback(async () => {
    if (joined || connecting) return;
    setConnecting(true);
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No se pudo acceder al micrófono — revisa los permisos del navegador para este sitio.");
      setConnecting(false);
      return;
    }
    localStreamRef.current = stream;
    attachAnalyser(LOCAL_KEY, stream);

    const channel = supabaseRef.current.channel(`voice-room-${roomKey}`, {
      config: { presence: { key: userId } },
    });
    rtChannelRef.current = channel;

    channel.on("broadcast", { event: "offer" }, async ({ payload }: { payload: OfferPayload }) => {
      if (payload.to !== userId) return;
      const pc = createPeerConnection(payload.from, payload.fromName, channel);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({
        type: "broadcast",
        event: "answer",
        payload: { from: userId, to: payload.from, sdp: answer } satisfies AnswerPayload,
      });
    });

    channel.on("broadcast", { event: "answer" }, async ({ payload }: { payload: AnswerPayload }) => {
      if (payload.to !== userId) return;
      const pc = peersRef.current.get(payload.from);
      if (pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    channel.on("broadcast", { event: "ice-candidate" }, async ({ payload }: { payload: IceCandidatePayload }) => {
      if (payload.to !== userId) return;
      const pc = peersRef.current.get(payload.from);
      if (pc) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          // candidato tardío/inválido — no es fatal para la llamada.
        }
      }
    });

    channel.on("broadcast", { event: "leave" }, ({ payload }: { payload: LeavePayload }) => {
      if (payload?.userId) cleanupPeer(payload.userId);
    });

    channel.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
      cleanupPeer(key);
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({ userId, name: userName });
      setJoined(true);
      setConnecting(false);

      // Yo (el que llega) inicio la conexión hacia quienes ya estaban —
      // así ambos lados nunca se mandan oferta al mismo tiempo.
      const state = channel.presenceState<{ userId: string; name: string }>();
      for (const key of Object.keys(state)) {
        if (key === userId) continue;
        const presences = state[key];
        const peerName = presences?.[0]?.name ?? "Alguien";
        const pc = createPeerConnection(key, peerName, channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "offer",
          payload: { from: userId, fromName: userName, to: key, sdp: offer } satisfies OfferPayload,
        });
      }
    });
  }, [joined, connecting, roomKey, userId, userName, createPeerConnection, cleanupPeer, attachAnalyser]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  // Detección de "quién está hablando" — revisa el volumen de cada
  // analizador cada cierto rato mientras la llamada esté activa.
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => {
      const local = analysersRef.current.get(LOCAL_KEY);
      if (local) {
        local.analyser.getByteFrequencyData(local.data);
        const avg = local.data.reduce((s, v) => s + v, 0) / local.data.length;
        setLocalSpeaking(avg > SPEAKING_THRESHOLD && !muted);
      }
      setParticipants((prev) =>
        prev.map((p) => {
          const entry = analysersRef.current.get(p.userId);
          if (!entry) return p;
          entry.analyser.getByteFrequencyData(entry.data);
          const avg = entry.data.reduce((s, v) => s + v, 0) / entry.data.length;
          return { ...p, speaking: avg > SPEAKING_THRESHOLD };
        }),
      );
    }, 250);
    return () => clearInterval(interval);
  }, [joined, muted]);

  // Salir de la llamada si la persona cierra la pestaña o navega fuera.
  useEffect(() => {
    return () => {
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { joined, connecting, error, muted, localSpeaking, participants, join, leave, toggleMute };
}
