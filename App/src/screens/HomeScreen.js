import React, { useState, useContext, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useBleMessages } from '../hooks/useBleMessage';

import HealthCard from '../components/HealthCard';
import { healthData, PLACEHOLDER } from '../data/healthData';
import { parseTrackerStats } from '../utils/trackerStats';
import { colors } from '../constants/colors';
import { UserContext } from '../context/userContext';
import { SaveBpm, getStepsFromESP32 } from '../services/dashbroad';


const PAGE_PADDING = 20; // space on the left and right of the screen
const GAP = 16; // space between two cards in the same row
const MAX_CONTENT_WIDTH = 600; // keeps the layout tidy on tablets

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { user } = useContext(UserContext);


  // Two cards per row on normal phones, one card per row on very small screens.
  const columns = width >= 340 ? 2 : 1;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const cardWidth =
    (contentWidth - PAGE_PADDING * 2 - GAP * (columns - 1)) / columns;

  // Newest reading from the tracker, or null before the first one arrives.
  const [stats, setStats] = useState(null);
  const [currentSteps, setCurrentSteps] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [currentSpo2, setCurrentSpo2] = useState(0);
  const [currentTemp, setCurrentTemp] = useState(0);


  // Every line that arrives, JSON or not - the same text the device screen
  // shows in its log, so anything the tracker sends is visible here too.
  const { isConnected, send, lastMessage } = useBleMessages(async (text) => {
    if (!isConnected) return;
    const parsed = parseTrackerStats(text);

    // Only a stats packet refreshes the cards; other lines are left alone so
    if (parsed && parsed.type === 'steps' || parsed.type === "bpm") {
      setStats({
        steps: parsed.steps == null ? currentSteps : parsed.steps,
        bpm: parsed.bpm == null ? currentBpm : parsed.bpm,
        spo2: parsed.spo2 == null ? currentSpo2 : parsed.spo2,
        temp: parsed.temp == null ? currentTemp : parsed.temp,
      });
      setCurrentSteps(parsed.steps == null ? currentSteps : parsed.steps);
      setCurrentBpm(parsed.bpm == null ? currentBpm : parsed.bpm);
      setCurrentSpo2(parsed.spo2 == null ? currentSpo2 : parsed.spo2);
      setCurrentTemp(parsed.temp == null ? currentTemp : parsed.temp);


      // Fire and forget: a failed upload must not interrupt the live cards,
      // but the rejection still needs a handler or RN logs it as unhandled.
      if(parsed.bpm != null || parsed.spo2 != null || parsed.temp != null) {
        await SaveBpm(parsed);
      }
    }

    console.log('From tracker:', text, '-> stats:', parsed);
  });

  // Ask for the step count once the tracker is actually there; the answer
  // comes back through the handler above, not from getSteps itself.
  useEffect(() => {
    if (!isConnected) {
      return;
    }
    getStepsFromESP32(send).catch((e) => console.warn(e.message));
  }, [isConnected, send]);
  

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {user?.username || 'User'}!</Text>
          <Text style={styles.heading}>Today's Summary</Text>
          <Text style={styles.status}>
            {isConnected
              ? stats
                ? 'Live from your tracker'
                : 'Connected - waiting for the first reading'
              : 'Tracker not connected'}
          </Text>

          {/* {lastMessage && (
            <Text style={styles.lastMessage} numberOfLines={2}>
              Last message: {lastMessage.text === '' ? '(empty)' : lastMessage.text}
            </Text>
          )} */}
        </View>

        <View style={styles.cardsRow}>
          {healthData.map((item, index) => {
            const value = cardValue(item, stats);

            return (
              <HealthCard
                key={item.id}
                title={item.title}
                value={value}
                unit={item.unit}
                icon={item.icon}
                color={item.color}
                background={item.background}
                width={cardWidth}
                index={index}
                isLive={value !== PLACEHOLDER}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** The text for one card: the live reading, or a dash until there is one. */
function cardValue(card, stats) {
  const value = stats?.[card.key];

  if (typeof value !== 'number') return PLACEHOLDER;
  if (card.isValid && !card.isValid(value)) return PLACEHOLDER;

  return card.format(value);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginTop: 32,
    marginBottom: 24,
  },
  greeting: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 4,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.title,
  },
  status: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  lastMessage: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
