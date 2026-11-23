import React from 'react';
import { Composition } from 'remotion';
import { ProVideo, ProVideoProps } from './ProVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ProVideo"
      component={ProVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        videoUrl: '',
        formato: '9:16',
        durationInFrames: 450,
        words: [],
        cards: [],
        brolls: [],
      } as ProVideoProps}
      calculateMetadata={({ props }) => {
        const isVertical = props.formato === '9:16';
        return {
          durationInFrames: Math.max(30, props.durationInFrames || 450),
          width: isVertical ? 1080 : 1920,
          height: isVertical ? 1920 : 1080,
        };
      }}
    />
  );
};
