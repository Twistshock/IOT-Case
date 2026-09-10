#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include "timeSync.h"

enum ScreenId
{
    HOME_SCREEN,
    LOADING_SCREEN,
    HEART_RATE_SCREEN
};

// There is deliberately no TIMESTAMP global here any more. It was initialised
// at static-init, before setup() had started the RTC, so it held the "unknown"
// placeholder for the rest of the run unless the phone happened to sync.
// Anything wanting the time calls GetClock() / GetDateTime() instead, which
// read the RTC.
inline String USERNAME = "there..";

// Step count and the calories derived from it. Written by movementReader,
// read by the display, the BLE replies and main.ino
inline uint32_t STEPS = 0;
inline float BURNED_KCAL = 0.0f;

// The screen currently being drawn; shared by every module
inline ScreenId ACTIVE_SCREEN = HOME_SCREEN;

#endif
