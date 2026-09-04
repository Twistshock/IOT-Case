#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

enum ScreenId
{
    HOME_SCREEN,
    LOADING_SCREEN,
    HEART_RATE_SCREEN
};

// Last sync time the phone sent. A String so it owns a copy of the text:
// the const char* from a JsonDocument dies with the document.
inline String TIMESTAMP = "31-8-26";
inline String USERNAME = "there!";

// Step count and the calories derived from it. Written by movementReader,
// read by the display, the BLE replies and main.ino
inline uint32_t STEPS = 0;
inline float BURNED_KCAL = 0.0f;

// The screen currently being drawn; shared by every module
inline ScreenId ACTIVE_SCREEN = HOME_SCREEN;

#endif
