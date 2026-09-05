import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type PrayerLiveActivityProps = {
  startedAtMs: number;
  endsAtMs: number;
  prayerLabel: string;
  endedLabel: string;
  musicHint: string;
};

const PrayerLiveActivityLayout = (
  props: PrayerLiveActivityProps,
  environment: LiveActivityEnvironment,
) => {
  'widget';

  const timerColor = environment.isStale ? '#A89A85' : '#FFD9A0';
  const interval = {
    lower: new Date(props.startedAtMs),
    upper: new Date(props.endsAtMs),
  };

  return {
    banner: (
      <HStack spacing={14} modifiers={[padding({ all: 16 })]}>
        <Image systemName="flame.fill" color="#E6A23C" />
        <VStack alignment="leading" spacing={3}>
          <Text
            modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#C9A96E')]}
          >
            {props.prayerLabel}
          </Text>
          {environment.isStale ? (
            <Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(timerColor)]}>
              {props.endedLabel}
            </Text>
          ) : (
            <Text
              timerInterval={interval}
              countsDown
              modifiers={[
                font({ design: 'monospaced', size: 28, weight: 'semibold' }),
                foregroundStyle(timerColor),
              ]}
            />
          )}
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="flame.fill" color="#E6A23C" />,
    compactTrailing: environment.isStale ? (
      <Text modifiers={[foregroundStyle(timerColor)]}>0:00</Text>
    ) : (
      <Text timerInterval={interval} countsDown modifiers={[foregroundStyle(timerColor)]} />
    ),
    minimal: <Image systemName="flame.fill" color="#E6A23C" />,
    expandedLeading: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Image systemName="flame.fill" color="#E6A23C" />
        <Text
          modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle('#C9A96E')]}
        >
          {props.prayerLabel}
        </Text>
      </VStack>
    ),
    expandedTrailing: environment.isStale ? (
      <Text
        modifiers={[
          padding({ all: 12 }),
          font({ design: 'monospaced', size: 22, weight: 'semibold' }),
          foregroundStyle(timerColor),
        ]}
      >
        0:00
      </Text>
    ) : (
      <Text
        timerInterval={interval}
        countsDown
        modifiers={[
          padding({ all: 12 }),
          font({ design: 'monospaced', size: 22, weight: 'semibold' }),
          foregroundStyle(timerColor),
        ]}
      />
    ),
    expandedBottom: (
      <Text
        modifiers={[
          padding({ horizontal: 12, bottom: 12 }),
          font({ size: 12 }),
          foregroundStyle('#B9AA91'),
        ]}
      >
        {props.musicHint}
      </Text>
    ),
  };
};

export default createLiveActivity<PrayerLiveActivityProps>(
  'PrayerActivity',
  PrayerLiveActivityLayout,
);
