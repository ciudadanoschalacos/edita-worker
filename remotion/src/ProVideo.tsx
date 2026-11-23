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
  title: string;
  subtitle?: string;
  badge?: string;
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

  // Zoom suave cinematográfico continuo
  const zoom = 1 + 0.04 * Math.sin((currentTime * Math.PI) / 6);

  // B-Roll activo
  const activeBroll = brolls.find(
    (b) => currentTime >= b.start && currentTime <= b.start + 2.4
  );

  // Tarjeta gráfica activa (con físicas spring tipo Remotion)
  const activeCard = cards.find(
    (c) => currentTime >= c.start && currentTime <= c.start + 3.0
  );

  // Bloque de 3 palabras para subtítulos dinámicos
  const chunkIndex = Math.floor(
    words.findIndex((w) => currentTime >= w.start && currentTime <= w.end + 0.2) / 3
  );
  const currentChunk =
    chunkIndex >= 0 ? words.slice(chunkIndex * 3, chunkIndex * 3 + 3) : [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#09090b', fontFamily: 'sans-serif' }}>
      {/* Video Principal (A-Roll) */}
      {videoUrl && (
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
          <OffthreadVideo
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* B-Roll con entrada suave */}
      {activeBroll && (
        <AbsoluteFill
          style={{
            opacity: interpolate(
              currentTime - activeBroll.start,
              [0, 0.2, 2.2, 2.4],
              [0, 1, 1, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
          }}
        >
          <OffthreadVideo
            src={activeBroll.url}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Motion Graphic Card (Estilo Agencia con Spring) */}
      {activeCard && (() => {
        const localFrame = Math.max(0, Math.round((currentTime - activeCard.start) * fps));
        const enter = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 140 } });
        const exit = interpolate(
          currentTime - activeCard.start,
          [2.6, 3.0],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        return (
          <div
            style={{
              position: 'absolute',
              top: isVertical ? 180 : 70,
              left: '50%',
              transform: `translate(-50%, ${(1 - enter) * -40}px) scale(${0.9 + 0.1 * enter})`,
              opacity: enter * exit,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(12px)',
              border: '2px solid rgba(56, 189, 248, 0.7)',
              borderRadius: 24,
              padding: isVertical ? '24px 36px' : '18px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
              maxWidth: isVertical ? '84%' : '60%',
              textAlign: 'center',
            }}
          >
            {activeCard.badge && (
              <div
                style={{
                  display: 'inline-block',
                  background: '#38bdf8',
                  color: '#09090b',
                  fontWeight: 800,
                  fontSize: isVertical ? 22 : 18,
                  padding: '4px 14px',
                  borderRadius: 999,
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {activeCard.badge}
              </div>
            )}
            <div
              style={{
                color: '#ffffff',
                fontWeight: 900,
                fontSize: isVertical ? 44 : 34,
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
                  fontSize: isVertical ? 28 : 22,
                  marginTop: 8,
                }}
              >
                {activeCard.subtitle}
              </div>
            )}
          </div>
        );
      })()}

      {/* Subtítulos Dinámicos Palabra por Palabra */}
      {currentChunk.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: isVertical ? 260 : 85,
            left: 40,
            right: 40,
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          {currentChunk.map((w, i) => {
            const isActive = currentTime >= w.start && currentTime <= w.end + 0.12;
            return (
              <span
                key={i}
                style={{
                  color: isActive ? '#38bdf8' : '#ffffff',
                  fontWeight: 900,
                  fontSize: isVertical ? 64 : 50,
                  textTransform: 'uppercase',
                  textShadow: '0 6px 20px rgba(0,0,0,0.9)',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.08s ease',
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
