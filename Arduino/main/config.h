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
inline String TIMETAMP = "31-8-26";

// The screen currently being drawn; shared by every module
inline ScreenId ACTIVE_SCREEN = HOME_SCREEN;

#endif
