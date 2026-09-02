#ifndef CONFIG_H
#define CONFIG_H

enum ScreenId
{
    HOME_SCREEN,
    LOADING_SCREEN,
    HEART_RATE_SCREEN
};

// The screen currently being drawn; shared by every module
inline ScreenId ACTIVE_SCREEN = HOME_SCREEN;

#endif
