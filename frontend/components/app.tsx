'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { motion } from 'motion/react';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import { RpcHandlers } from '@/components/Rpc_Handler';
import { toastAlert } from '@/components/alert-toast';
import { SessionView } from '@/components/session-view';
import { Toaster } from '@/components/ui/sonner';
import { Welcome } from '@/components/welcome';
import useConnectionDetails, { ConnectionDetailsError } from '@/hooks/useConnectionDetails';
import { useCountdown, useSessionDuration } from '@/hooks/useSessionCountdown';
import type { AppConfig } from '@/lib/types';

const MotionWelcome = motion.create(Welcome);
const MotionSessionView = motion.create(SessionView);

interface AppProps {
  appConfig: AppConfig;
}

export function App({ appConfig }: AppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [accessCode, setAccessCode] = useState<string | undefined>(undefined);
  const [startError, setStartError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const sessionDuration = useSessionDuration();
  const { requiresAccessCode, refreshConnectionDetails, existingOrRefreshConnectionDetails } =
    useConnectionDetails();

  useEffect(() => {
    const onDisconnected = () => {
      setSessionStarted(false);
      refreshConnectionDetails(accessCode).catch(() => {});
    };
    const onMediaDevicesError = (error: Error) => {
      toastAlert({
        title: 'خطا در دسترسی به میکروفون یا دوربین',
        description: `${error.name}: ${error.message}`,
      });
    };
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails, accessCode]);

  useEffect(() => {
    let aborted = false;
    if (sessionStarted && room.state === 'disconnected') {
      Promise.all([
        room.localParticipant.setMicrophoneEnabled(true, undefined, {
          preConnectBuffer: appConfig.isPreConnectBufferEnabled,
        }),
        existingOrRefreshConnectionDetails(accessCode).then((connectionDetails) =>
          room.connect(connectionDetails.serverUrl, connectionDetails.participantToken)
        ),
      ]).catch((error) => {
        if (aborted) {
          // Once the effect has cleaned up after itself, drop any errors
          //
          // These errors are likely caused by this effect rerunning rapidly,
          // resulting in a previous run `disconnect` running in parallel with
          // a current run `connect`
          return;
        }

        // خطای کد دسترسی و محدودیت نرخ زیر خود فیلد نشان داده می‌شود،
        // نه به‌صورت یک توست عمومی که کاربر ربطش را نمی‌فهمد.
        if (error instanceof ConnectionDetailsError) {
          setStartError(error.message);
          setSessionStarted(false);
          return;
        }

        toastAlert({
          title: 'خطا در اتصال به دستیار',
          description: `${error.name}: ${error.message}`,
        });
      });
    }
    return () => {
      aborted = true;
      room.disconnect();
    };
  }, [room, sessionStarted, accessCode, appConfig.isPreConnectBufferEnabled]);

  const handleExpire = useCallback(() => {
    // این فقط برای تجربه‌ی کاربری است. اجرای واقعی مهلت سمت ایجنت انجام
    // می‌شود، چون هر کسی می‌تواند جاوااسکریپت مرورگر را دور بزند.
    setTimedOut(true);
    setSessionStarted(false);
  }, []);

  const remainingSeconds = useCountdown(sessionDuration, sessionStarted, handleExpire);

  const { startButtonText } = appConfig;

  return (
    <>
      <MotionWelcome
        key="welcome"
        startButtonText={startButtonText}
        requiresAccessCode={requiresAccessCode}
        errorMessage={startError}
        timedOut={timedOut}
        onStartCall={(code) => {
          setStartError(null);
          setTimedOut(false);
          setAccessCode(code);
          setSessionStarted(true);
        }}
        disabled={sessionStarted}
        initial={{ opacity: 0 }}
        animate={{ opacity: sessionStarted ? 0 : 1 }}
        transition={{ duration: 0.5, ease: 'linear', delay: sessionStarted ? 0 : 0.5 }}
      />

      <RoomContext.Provider value={room}>
        <RoomAudioRenderer />
        <StartAudio label="Start Audio" />
        {/* --- */}
        <MotionSessionView
          key="session-view"
          appConfig={appConfig}
          disabled={!sessionStarted}
          sessionStarted={sessionStarted}
          remainingSeconds={remainingSeconds}
          initial={{ opacity: 0 }}
          animate={{ opacity: sessionStarted ? 1 : 0 }}
          transition={{
            duration: 0.5,
            ease: 'linear',
            delay: sessionStarted ? 0.5 : 0,
          }}
        />
        <RpcHandlers />
      </RoomContext.Provider>

      <Toaster />
    </>
  );
}
