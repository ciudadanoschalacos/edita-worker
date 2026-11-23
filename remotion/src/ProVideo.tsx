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
  words,
  cards,
  brolls,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const isVertical = formato === '9:16';

  // Zoom suave cinematográfico
  const zoom = 1 + 0.035 * Math.sin((currentTime * Math.PI) / 6);

  // B-Roll activo (se mostrará en ventana flotante arriba, sin tapar al hablante)
  const activeBroll = brolls.find(
    (b) => currentTime >= b.start && currentTime <= b.start + 2.6
  );

  // Escena Motion Graphic activa
  const activeCard = cards.find(
    (c) => currentTime >= c.start && currentTime <= c.start + 3.2
  );

  // Bloque de 3 palabras para subtítulos tipo estudio
  const activeIdx = words.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end + 0.2
  );
  const chunkIndex = activeIdx >= 0 ? Math.floor(activeIdx / 3) : -1;
  const currentChunk =
    chunkIndex >= 0 ? words.slice(chunkIndex * 3, chunkIndex * 3 + 3) : [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#09090b', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Video Principal (A-Roll) */}
      {videoUrl && (
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
          <OffthreadVideo
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Viñeta sutil superior e inferior para legibilidad cinematográfica */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0) 26%, rgba(9,9,11,0) 68%, rgba(9,9,11,0.72) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* B-Roll en Ventana Flotante (Picture-in-Picture estilo estudio) */}
      {activeBroll && !activeCard && (() => {
        const localFrame = Math.max(0, Math.round((currentTime - activeBroll.start) * fps));
        const pop = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 150 } });
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
              top: isVertical ? 95 : 45,
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
                background: 'rgba(15, 23, 42, 0.8)',
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

      {/* Escenas Motion Graphics (Bien arriba para no tapar el rostro) */}
      {activeCard && (() => {
        const localFrame = Math.max(0, Math.round((currentTime - activeCard.start) * fps));
        const enter = spring({ frame: localFrame, fps, config: { damping: 13, stiffness: 145 } });
        const exit = interpolate(
          currentTime - activeCard.start,
          [2.8, 3.2],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const cardType = activeCard.type || 'card';

        // MODO 1: DATO NUMÉRICO GIGANTE (STAT)
        if (cardType === 'stat' && activeCard.statValue) {
          return (
            <div
              style={{
                position: 'absolute',
                top: isVertical ? 85 : 40,
                left: '50%',
                transform: `translate(-50%, ${(1 - enter) * -35}px) scale(${0.85 + 0.15 * enter})`,
                opacity: enter * exit,
                background: 'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.92) 100%)',
                backdropFilter: 'blur(14px)',
                border: '2px solid rgba(250, 204, 21, 0.8)',
                borderRadius: 28,
                padding: isVertical ? '20px 44px' : '14px 32px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.65), 0 0 35px rgba(250,204,21,0.25)',
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
                  textShadow: '0 4px 20px rgba(250,204,21,0.4)',
                }}
              >
                {activeCard.statValue}
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: isVertical ? 30 : 24,
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
                top: isVertical ? 80 : 38,
                left: '50%',
                transform: `translate(-50%, ${(1 - enter) * -35}px)`,
                opacity: enter * exit,
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(14px)',
                border: '2px solid rgba(56, 189, 248, 0.75)',
                borderRadius: 26,
                padding: isVertical ? '20px 32px' : '14px 24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
                width: isVertical ? '82%' : '52%',
              }}
            >
              <div
                style={{
                  color: '#38bdf8',
                  fontWeight: 900,
                  fontSize: isVertical ? 24 : 20,
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
                          fontSize: isVertical ? 28 : 22,
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
          currentTime - activeCard.start,
          [0, 3.0],
          [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        return (
          <div
            style={{
              position: 'absolute',
              top: isVertical ? 85 : 40,
              left: '50%',
              transform: `translate(-50%, ${(1 - enter) * -35}px) scale(${0.92 + 0.08 * enter})`,
              opacity: enter * exit,
              background: 'linear-gradient(145deg, rgba(15,23,42,0.92), rgba(24,24,27,0.92))',
              backdropFilter: 'blur(14px)',
              border: '2px solid rgba(56, 189, 248, 0.75)',
              borderRadius: 24,
              padding: isVertical ? '18px 32px' : '14px 26px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              maxWidth: isVertical ? '84%' : '55%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  background: '#38bdf8',
                  color: '#09090b',
                  fontWeight: 900,
                  fontSize: isVertical ? 18 : 15,
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
                fontSize: isVertical ? 40 : 30,
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
                  fontSize: isVertical ? 26 : 20,
                  marginTop: 6,
                }}
              >
                {activeCard.subtitle}
              </div>
            )}
            {/* Barra de progreso animada en la base */}
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

      {/* Subtítulos Estilo Estudio con Píldora Activa */}
      {currentChunk.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: isVertical ? 230 : 75,
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
            return (
              <span
                key={i}
                style={{
                  background: isActive ? '#38bdf8' : 'rgba(9, 9, 11, 0.65)',
                  color: isActive ? '#09090b' : '#ffffff',
                  fontWeight: 900,
                  fontSize: isVertical ? 54 : 42,
                  padding: '4px 16px',
                  borderRadius: 16,
                  textTransform: 'uppercase',
                  boxShadow: isActive
                    ? '0 8px 25px rgba(56, 189, 248, 0.5)'
                    : '0 4px 12px rgba(0, 0, 0, 0.6)',
                  transform: isActive ? 'scale(1.08) translateY(-3px)' : 'scale(1)',
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
