import React, { useContext, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { UserProvider, UserContext } from './src/context/userContext';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import DeviceScreen from './src/screens/DeviceScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TabBar from './src/components/TabBar';
import { BleProvider } from './src/context/BleContext';
import { TrackerProvider } from './src/context/TrackerContext';
import { restoreSession } from './src/services/auth';
import { colors } from './src/constants/colors';


const TABS = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  {
    key: 'device',
    label: 'Device',
    icon: 'bluetooth-outline',
    activeIcon: 'bluetooth',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'settings-outline',
    activeIcon: 'settings',
  },
];

const SPLASH_MS = 2000;

function Root() {
  const { setUser } = useContext(UserContext);

  // Show the splash screen first, then either the auth screens or the tabs.
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authScreen, setAuthScreen] = useState('login');
  const [activeTab, setActiveTab] = useState('home');

  // The settings tab has one screen underneath it: 'settings' or 'profile'.
  const [settingsScreen, setSettingsScreen] = useState('settings');

  // Logging out (or deleting the account) drops everything back to a fresh
  // login screen, so the next person does not land in someone else's tabs.
  const handleSignedOut = () => {
    setIsSignedIn(false);
    setAuthScreen('login');
    setActiveTab('home');
    setSettingsScreen('settings');
  };

  useEffect(() => {
    let isMounted = true;

    // Look for a session from an earlier run while the splash is up, so
    // someone who signed in before does not see the login screen again.
    const start = Date.now();
    const restore = restoreSession()
      .then((session) => {
        if (!isMounted || !session) return;

        setUser(session.user ?? {});
        setIsSignedIn(true);
      })
      .catch(() => {
        // No stored session we can read - fall through to the login screen.
      });

    restore.then(() => {
      const remaining = Math.max(0, SPLASH_MS - (Date.now() - start));
      setTimeout(() => {
        if (isMounted) setIsLoading(false);
      }, remaining);
    });

    // Stop touching state if the app closes before the splash finishes.
    return () => {
      isMounted = false;
    };
  }, [setUser]);

  if (isLoading) {
    return (
      <>
        <StatusBar style="dark" />
        <SplashScreen />
      </>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <StatusBar style="dark" />

        {authScreen === 'login' ? (
          <LoginScreen
            onSuccess={() => setIsSignedIn(true)}
            onSignup={() => setAuthScreen('signup')}
          />
        ) : (
          <SignupScreen
            // A backend that returns a token signs the user straight in;
            // otherwise they land on the login screen to sign in themselves.
            onSuccess={(session) =>
              session?.token ? setIsSignedIn(true) : setAuthScreen('login')
            }
            onLogin={() => setAuthScreen('login')}
          />
        )}
      </>
    );
  }

  return (
    <BleProvider>
      {/* Above the tabs, so tracker readings keep being parsed and uploaded
          while the user is on a screen that does not show them. */}
      <TrackerProvider>
        <StatusBar style="dark" />

        <View style={styles.root}>
          <View style={styles.screen}>
            {activeTab === 'home' && <HomeScreen />}
            {activeTab === 'device' && <DeviceScreen />}

            {activeTab === 'settings' &&
              (settingsScreen === 'profile' ? (
                <ProfileScreen onBack={() => setSettingsScreen('settings')} />
              ) : (
                <SettingsScreen
                  onOpenProfile={() => setSettingsScreen('profile')}
                  onSignedOut={handleSignedOut}
                />
              ))}
          </View>

          <TabBar
            tabs={TABS}
            activeTab={activeTab}
            onChange={(key) => {
              // Leaving and coming back to settings starts at the top level.
              if (key !== 'settings') setSettingsScreen('settings');
              setActiveTab(key);
            }}
          />
        </View>
      </TrackerProvider>
    </BleProvider>
  );
}

export default function App() {
  return (
    <UserProvider>
      <Root />
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
