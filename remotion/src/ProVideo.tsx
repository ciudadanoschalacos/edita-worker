import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

export interface WordItem {
  word: string;
  start: number;
  end: number;
}

export interface CardItem {
  start: number;
  duration?: number;
  type?: 'stat' | 'list' | 'card';
  badge?: string;
  title: string;
  subtitle?: string;
  statValue?: string;
  items?: string[];
}

export interface BrollItem {
  start: number;
  url: string;
}

export interface ProVideoProps {
  videoUrl: string;
  formato: '9:16' | '16:9';
  durationInFrames: number;
  words: WordItem[];
  cards: CardItem[];
  brolls: BrollItem[];
}

export const ProVideo: React.FC<ProVideoProps> = ({
  videoUrl,
  formato,
  durationInFrames,
  words,
  cards,
  brolls,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Compensación de 0.16s para clavar gráficos y subtítulos con el movimiento de labios
  const currentTime = Math.max(0, frame / fps - 0.16);
  const isVertical = formato === '9:16';

  // 1. Barra de progreso global (0% a 100%)
  const globalProgress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 2. Hook de Apertura usando solo las palabras iniciales (sin adelantar tarjetas futuras)
  const hookText = words
    .slice(0, 4)
    .map((w) => w.word.trim())
    .join(' ');
  const showHook = Boolean(hookText) && currentTime <= 2.2;
  const hookSpring = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const hookFade = interpolate(currentTime, [1.8, 2.2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // B-Roll activo en ventana flotante
  const activeBroll = brolls.find(
    (b) => currentTime >= b.start && currentTime <= b.start + 2.6
  );

  // Escena Motion Graphic activa respetando su duración dinámica
  const activeCard = cards.find((c) => {
    const dur = c.duration || 4.2;
    return c.start >= 2.2 && currentTime >= c.start && currentTime <= c.start + dur;
  });

  // Micro-golpe de cámara ("Punch Zoom") cuando entra una tarjeta o B-roll
  const eventStart = activeCard
    ? activeCard.start
    : activeBroll
    ? activeBroll.start
    : -1;
  const punchFrame =
    eventStart >= 0 ? Math.max(0, Math.round((currentTime - eventStart) * fps)) : -1;
  const punchBoost =
    punchFrame >= 0 && punchFrame < 14
      ? interpolate(punchFrame, [0, 4, 14], [0, 0.032, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  // Zoom base suave + golpe dinámico
  const baseZoom = 1 + 0.03 * Math.sin((currentTime * Math.PI) / 6) + punchBoost;

  // Bloque de 3 palabras para subtítulos tipo estudio
  const activeIdx = words.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end + 0.2
  );
  const chunkIndex = activeIdx >= 0 ? Math.floor(activeIdx / 3) : -1;
  const currentChunk =
    chunkIndex >= 0 ? words.slice(chunkIndex * 3, chunkIndex * 3 + 3) : [];

  // Detector de palabras de alto impacto (números, signos o palabras clave largas)
  const isPowerWord = (raw: string) => {
    const clean = raw.replace(/[.,!?¡¿"']/g, '').trim();
    return /\d|%|\+|\$/.test(clean) || clean.length >= 8;
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#09090b',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Video Principal (A-Roll) */}
      {videoUrl && (
        <AbsoluteFill style={{ transform: `scale(${baseZoom})` }}>
          <OffthreadVideo
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Viñeta cinematográfica superior e inferior */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(9,9,11,0.62) 0%, rgba(9,9,11,0) 27%, rgba(9,9,11,0) 66%, rgba(9,9,11,0.78) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Barra de Progreso Continua en el borde superior */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: isVertical ? 8 : 6,
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          zIndex: 50,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${globalProgress}%`,
            background: 'linear-gradient(90deg, #38bdf8 0%, #facc15 100%)',
            boxShadow: '0 0 14px rgba(56, 189, 248, 0.85)',
          }}
        />
      </div>

      {/* HOOK DE APERTURA (Primeros 2.2s con las palabras de arranque) */}
      {showHook && (
        <div
          style={{
            position: 'absolute',
            top: isVertical ? 85 : 42,
            left: '50%',
            transform: `translate(-50%, ${(1 - hookSpring) * -32}px) scale(${
              0.9 + 0.1 * hookSpring
            })`,
            opacity: hookSpring * hookFade,
            width: isVertical ? '86%' : '62%',
            background:
              'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(9, 9, 11, 0.92) 100%)',
            backdropFilter: 'blur(14px)',
            border: '2px solid rgba(250, 204, 21, 0.75)',
            borderRadius: 24,
            padding: isVertical ? '16px 28px' : '12px 24px',
            boxShadow: '0 22px 50px rgba(0, 0, 0, 0.7)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(250, 204, 21, 0.16)',
              color: '#facc15',
              fontSize: isVertical ? 16 : 14,
              fontWeight: 900,
              padding: '3px 12px',
              borderRadius: 999,
              letterSpacing: 1.4,
              marginBottom: 6,
            }}
          >
            ● EN ESTE VIDEO
          </div>
          <div
            style={{
              color: '#ffffff',
              fontWeight: 900,
              fontSize: isVertical ? 40 : 30,
              lineHeight: 1.12,
              letterSpacing: -0.5,
            }}
          >
            {hookText}
          </div>
        </div>
      )}

      {/* B-Roll en Ventana Flotante (Picture-in-Picture estilo estudio) */}
      {activeBroll && !activeCard && !showHook && (() => {
        const localFrame = Math.max(0, Math.round((currentTime - activeBroll.start) * fps));
        const pop = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 155 } });
        const fadeOut = interpolate(
          currentTime - activeBroll.start,
          [2.2, 2.6],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        return (
          <div
            style={{
              position: 'absolute',
              top: isVertical ? 90 : 42,
              left: '50%',
              transform: `translate(-50%, ${(1 - pop) * -30}px) scale(${0.88 + 0.12 * pop})`,
              opacity: pop * fadeOut,
              width: isVertical ? 640 : 480,
              height: isVertical ? 360 : 270,
              borderRadius: 26,
              overflow: 'hidden',
              border: '3px solid rgba(56, 189, 248, 0.85)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 30px rgba(56, 189, 248, 0.35)',
              backgroundColor: '#0f172a',
            }}
          >
            <OffthreadVideo
              src={activeBroll.url}
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 14,
                background: 'rgba(15, 23, 42, 0.82)',
                color: '#38bdf8',
                fontSize: 16,
                fontWeight: 800,
                padding: '4px 12px',
                borderRadius: 999,
                letterSpacing: 1,
              }}
            >
              ● EN CONTEXTO
            </div>
          </div>
        );
      })()}

      {/* Escenas Motion Graphics (Sincronizadas con duración dinámica del habla) */}
      {activeCard && (() => {
        const cardStart = activeCard.start;
        const cardDur = activeCard.duration || 4.2;
        const localFrame = Math.max(0, Math.round((currentTime - cardStart) * fps));
        const enter = spring({ frame: localFrame, fps, config: { damping: 13, stiffness: 145 } });
        const exit = interpolate(currentTime - cardStart, [cardDur - 0.4, cardDur], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const cardType = activeCard.type || 'card';

        // MODO 1: DATO NUMÉRICO GIGANTE (STAT)
        if (cardType === 'stat' && activeCard.statValue) {
          return (
            <div
              style={{
                position: 'absolute',
                top: isVertical ? 82 : 38,
                left: '50%',
                transform: `translate(-50%, ${(1 - enter) * -35}px) scale(${
                  0.85 + 0.15 * enter
                })`,
                opacity: enter * exit,
                background:
                  'linear-gradient(135deg, rgba(15,23,42,0.93) 0%, rgba(30,41,59,0.93) 100%)',
                backdropFilter: 'blur(14px)',
                border: '2px solid rgba(250, 204, 21, 0.85)',
                borderRadius: 28,
                padding: isVertical ? '18px 44px' : '14px 32px',
                boxShadow:
                  '0 20px 50px rgba(0,0,0,0.68), 0 0 35px rgba(250,204,21,0.28)',
                textAlign: 'center',
                minWidth: isVertical ? 460 : 360,
              }}
            >
              <div
                style={{
                  color: '#facc15',
                  fontWeight: 900,
                  fontSize: isVertical ? 76 : 56,
                  lineHeight: 1,
                  letterSpacing: -1,
                  textShadow: '0 4px 20px rgba(250,204,21,0.45)',
                }}
              >
                {activeCard.statValue}
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: isVertical ? 28 : 22,
                  marginTop: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {activeCard.title}
              </div>
            </div>
          );
        }

        // MODO 2: LISTA ANIMADA ÍTEM POR ÍTEM (LIST)
        if (cardType === 'list' && activeCard.items && activeCard.items.length > 0) {
          return (
            <div
              style={{
                position: 'absolute',
                top: isVertical ? 78 : 36,
                left: '50%',
                transform: `translate(-50%, ${(1 - enter) * -35}px)`,
                opacity: enter * exit,
                background: 'rgba(15, 23, 42, 0.93)',
                backdropFilter: 'blur(14px)',
                border: '2px solid rgba(56, 189, 248, 0.8)',
                borderRadius: 26,
                padding: isVertical ? '18px 30px' : '14px 24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.68)',
                width: isVertical ? '84%' : '54%',
              }}
            >
              <div
                style={{
                  color: '#38bdf8',
                  fontWeight: 900,
                  fontSize: isVertical ? 23 : 19,
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  marginBottom: 10,
                }}
              >
                {activeCard.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeCard.items.slice(0, 3).map((it, idx) => {
                  const itemSpring = spring({
                    frame: Math.max(0, localFrame - idx * 6),
                    fps,
                    config: { damping: 14, stiffness: 160 },
                  });
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        opacity: itemSpring,
                        transform: `translateX(${(1 - itemSpring) * -24}px)`,
                      }}
                    >
                      <span
                        style={{
                          background: '#38bdf8',
                          color: '#09090b',
                          fontWeight: 900,
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </span>
                      <span
                        style={{
                          color: '#f8fafc',
                          fontWeight: 700,
                          fontSize: isVertical ? 27 : 21,
                        }}
                      >
                        {it}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // MODO 3: TARJETA CRISTAL CON BARRA DE PROGRESO (CARD)
        const progressPct = interpolate(
          currentTime - cardStart,
          [0, Math.max(0.5, cardDur - 0.2)],
          [0, 100],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }
        );

        return (
          <div
            style={{
              position: 'absolute',
              top: isVertical ? 82 : 38,
              left: '50%',
              transform: `translate(-50%, ${(1 - enter) * -35}px) scale(${
                0.92 + 0.08 * enter
              })`,
              opacity: enter * exit,
              background:
                'linear-gradient(145deg, rgba(15,23,42,0.93), rgba(24,24,27,0.93))',
              backdropFilter: 'blur(14px)',
              border: '2px solid rgba(56, 189, 248, 0.8)',
              borderRadius: 24,
              padding: isVertical ? '16px 30px' : '12px 24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
              maxWidth: isVertical ? '84%' : '56%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  background: '#38bdf8',
                  color: '#09090b',
                  fontWeight: 900,
                  fontSize: isVertical ? 17 : 14,
                  padding: '3px 12px',
                  borderRadius: 999,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {activeCard.badge || 'IDEA CLAVE'}
              </span>
            </div>
            <div
              style={{
                color: '#ffffff',
                fontWeight: 900,
                fontSize: isVertical ? 38 : 28,
                lineHeight: 1.15,
              }}
            >
              {activeCard.title}
            </div>
            {activeCard.subtitle && (
              <div
                style={{
                  color: '#cbd5e1',
                  fontWeight: 500,
                  fontSize: isVertical ? 25 : 19,
                  marginTop: 6,
                }}
              >
                {activeCard.subtitle}
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: 4,
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #38bdf8, #facc15)',
              }}
            />
          </div>
        );
      })()}

      {/* Subtítulos Dinámicos con Énfasis Dorado en Palabras Clave */}
      {currentChunk.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: isVertical ? 220 : 70,
            left: 36,
            right: 36,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {currentChunk.map((w, i) => {
            const isActive = currentTime >= w.start && currentTime <= w.end + 0.14;
            const power = isPowerWord(w.word);

            const bg = isActive
              ? power
                ? '#facc15'
                : '#38bdf8'
              : 'rgba(9, 9, 11, 0.72)';

            const textColor = isActive
              ? '#09090b'
              : power
              ? '#facc15'
              : '#ffffff';

            const scale = isActive ? (power ? 1.16 : 1.08) : power ? 1.04 : 1;
            const rotate = isActive && power ? '-2deg' : '0deg';

            return (
              <span
                key={i}
                style={{
                  background: bg,
                  color: textColor,
                  fontWeight: 900,
                  fontSize: isVertical ? 54 : 42,
                  padding: '4px 16px',
                  borderRadius: 16,
                  textTransform: 'uppercase',
                  boxShadow: isActive
                    ? power
                      ? '0 8px 28px rgba(250, 204, 21, 0.55)'
                      : '0 8px 25px rgba(56, 189, 248, 0.5)'
                    : '0 4px 12px rgba(0, 0, 0, 0.65)',
                  transform: `scale(${scale}) rotate(${rotate}) translateY(${
                    isActive ? '-3px' : '0px'
                  })`,
                }}
              >
                {w.word.trim()}
              </span>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
