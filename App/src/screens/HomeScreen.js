import React, { useState, useContext, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBleMessages } from '../hooks/useBleMessage';
import StepGoalModal from '../components/StepGoalModal';
import MeasurementsHistoryModal from '../components/MeasurementsHistoryModal';

import HealthCard from '../components/HealthCard';
import StepGoalCard from '../components/StepGoalCard';
import { healthData, PLACEHOLDER } from '../data/healthData';
import { parseTrackerStats } from '../utils/trackerStats';
import { colors } from '../constants/colors';
import { UserContext } from '../context/userContext';
import { SaveBpm, SaveStepGoal,  getStepsFromESP32, getStepsFromDB, getMeasurementsDB } from '../services/dashbroad';


const PAGE_PADDING = 20; // space on the left and right of the screen
const GAP = 16; // space between two cards in the same row
const MAX_CONTENT_WIDTH = 600; // keeps the layout tidy on tablets

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { user } = useContext(UserContext);
  const [showStepGoalModal, setShowStepGoalModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Two cards per row on normal phones, one card per row on very small screens.
  const columns = width >= 340 ? 2 : 1;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const cardWidth =
    (contentWidth - PAGE_PADDING * 2 - GAP * (columns - 1)) / columns;

  // Newest reading from the tracker, or null before the first one arrives.
  const [stats, setStats] = useState(null);
  const [currentSteps, setCurrentSteps] = useState(0);
  const [stepGoal, setStepGoal] = useState(0);
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
      console.log('Not connected to tracker, fetching data from database instead.');
    }
    else{
      getStepsFromESP32(send).catch((e) => console.warn(e.message));
    }
    checkStepGoal();
  }, [isConnected, send]);
  
  // check if the step goal has been set in the database, if not show the modal to set it
  const checkStepGoal = async () => {
    if(stepGoal !== 0) {
      return;
    }
    const steps = await getStepsFromDB();
    if(steps.length !== 0) {
      console.log('Receiver steps from database:', steps);
      const stepGoalToday = steps[0].goal;
      setStepGoal(stepGoalToday);
      const stepsCount = steps[0].steps;
      if(stepsCount === 0) {
        setShowStepGoalModal(true);
      }

      // if app is not connected to the tracker, set the current steps to the steps from the database
      if(!isConnected) {
        console.log('Not connected to tracker, setting current steps to the steps from the database:', stepsCount);
        setCurrentSteps(stepsCount);
        setStats({
          steps: stepsCount ?? currentSteps,
          bpm: currentBpm,
          spo2: currentSpo2 ?? null,
          temp: currentTemp ?? null,
        });

        await fetchMeasurements();
      }
      return;
    }

    setShowStepGoalModal(true);
  };

  const handleSetStepGoal = async (goal) => {
    console.log('Step goal set to', goal);
    const date = new Date().toISOString().split('T')[0];
    const save = await SaveStepGoal(goal, date, currentSteps);
    if(save?.ok){
      console.log('Saved step goal successfully', date);
    }
    // Show the new goal straight away instead of waiting for the next fetch.
    setStepGoal(goal);
    setShowStepGoalModal(false);
  }


  // get measurements from database, for the current day. The tracker may not be connected, so this is the fallback.
  const fetchMeasurements = async () => {
    const measurements = await getMeasurementsDB();
    if(measurements.length !== 0) {
      console.log('Receiver measurements from database:', measurements);
      const data = measurements[0];
      setStats({
        steps: data.steps ?? currentSteps,
        bpm: data.bpm ?? currentBpm,
        spo2: data.spo2 ?? currentSpo2,
        temp: data.temperature_c ?? currentTemp,
      });
      setCurrentSteps(data.steps ?? currentSteps);
      setCurrentBpm(data.bpm ?? currentBpm);
      setCurrentSpo2(data.spo2 ?? currentSpo2);
      setCurrentTemp(data.temp ?? currentTemp);
    }
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {user?.username || 'User'}!</Text>

          <View style={styles.headingRow}>
            <Text style={styles.heading}>Today's Summary</Text>

            {/* Opens on today's readings; the modal handles other days. */}
            <Pressable
              onPress={() => setShowHistoryModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Measurement history"
              hitSlop={8}
              style={({ pressed }) => [
                styles.historyButton,
                pressed && styles.historyPressed,
              ]}
            >
              <Ionicons name="time-outline" size={16} color={colors.blue} />
              <Text style={styles.historyText}>History</Text>
            </Pressable>
          </View>

          <Text style={styles.status}>
            {isConnected
              ? stats
                ? 'Live from your tracker'
                : 'Connected - waiting for the first reading'
              : 'Tracker not connected'}
          </Text>
        </View>

        <MeasurementsHistoryModal
          visible={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />

        <StepGoalModal
          visible={showStepGoalModal}
          initialGoal={stepGoal || undefined}
          onClose={() => setShowStepGoalModal(false)}
          onSubmit={handleSetStepGoal}
        />

        {/* Today's goal and how much of it is still left, above the cards. */}
        <StepGoalCard
          steps={currentSteps}
          goal={stepGoal}
          width={contentWidth - PAGE_PADDING * 2}
          onEditGoal={() => setShowStepGoalModal(true)}
        />

        <View style={styles.cardsRow}>
          {healthData.map((item, index) => {
            const value = cardValue(item, stats);
            const isLive = value !== PLACEHOLDER;

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
                index={index + 1}
                isLive={isLive}
                alert={isLive ? cardAlert(item, stats) : null}
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

/**
 * The warning for one card, or null when the reading is in range. Only called
 * for cards that show a real value, so "--" never raises an alert.
 */
function cardAlert(card, stats) {
  const value = stats?.[card.key];

  if (typeof value !== 'number' || !card.getAlert) return null;

  return card.getAlert(value);
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
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.title,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyPressed: {
    opacity: 0.6,
  },
  historyText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blue,
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
