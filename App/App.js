import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { UserProvider } from './src/context/userContext';

import SplashScreen from './src/screens/SplashScreen';
import HomeScreen from './src/screens/HomeScreen';
import DeviceScreen from './src/screens/DeviceScreen';
import TabBar from './src/components/TabBar';
import { BleProvider } from './src/context/BleContext';
import { colors } from './src/constants/colors';


const TABS = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  {
    key: 'device',
    label: 'Device',
    icon: 'bluetooth-outline',
    activeIcon: 'bluetooth',
  },
];

export default function App() {
  // Show the splash screen first, then switch to the tabs.
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);

    // Clean up the timer if the app closes before it finishes.
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <>
        <StatusBar style="dark" />
        <SplashScreen />
      </>
    );
  }

  return (
    <UserProvider>
      <BleProvider>
        <StatusBar style="dark" />

      <View style={styles.root}>
        <View style={styles.screen}>
          {activeTab === 'home' ? <HomeScreen /> : <DeviceScreen />}
        </View>

        <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </BleProvider>
  </UserProvider>
);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
});
