#ifndef DISPLAY_H
#define DISPLAY_H

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h> // installed U8g2
#include "config.h"

#define OLED_SDA 21
#define OLED_SCK 22

// 1.3-inch 128x64 SH1106 OLED
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(
    U8G2_R0,
    U8X8_PIN_NONE
);

// Start the OLED display
inline void DisplayInit()
{
    Wire.begin(OLED_SDA, OLED_SCK);
    // Attempt standard 100 kHz i2C, see if it works. We can always try 400 kHz again if it does not.
    // Should reduce power draw.
    Wire.setClock(100000);

    oled.begin();
    oled.clearBuffer();

    oled.setFont(u8g2_font_6x12_tr);
    oled.drawStr(17, 28, "Fitness Tracker");
    oled.drawStr(35, 45, "Starting...");

    oled.sendBuffer();

    Serial.println("Fitness Tracker initialized!");
}

// Draw a value right-aligned against the display edge
inline void DrawValueRight(int baselineY, const char *value)
{
    constexpr int RIGHT_MARGIN = 2;

    int x = 128 - RIGHT_MARGIN - oled.getStrWidth(value);
    oled.drawStr(x, baselineY, value);
}

// Display the fitness tracker home screen
// Parameters follow the order the rows are drawn in
inline void DisplayHomeScreen(
    uint32_t steps,
    float bruned_kcal = 0,
    uint16_t heartRate = 0,
    uint16_t bloodOxygen = 0,
    float temperature = 0.0f)
{
    char value[20];

    oled.clearBuffer();

    // Header: the name on the left, the date and clock hard against the right.
    //
    // Read live rather than from a cached string. It used to draw the
    // TIMESTAMP global, which was filled in once at static-init - before the
    // RTC was even started - and then only rewritten when the phone synced.
    // So after a power cycle it showed "--/--/-- --:--:--" no matter what the
    // RTC held, and between syncs it never ticked.
    //
    // Drawn in 4x6 rather than the 6x12 the rest of the screen uses, because
    // "dd/mm/yyyy HH:MM:SS" is 19 characters: 114px at 6px per character, which
    // leaves nothing for the name on a 128px panel. At 4px it is 76px and a
    // name of up to 11 characters still fits beside it.
    oled.setFont(u8g2_font_4x6_tr);

    const String stamp = GetDateTime();

    DrawValueRight(10, stamp.c_str());

    // Gap so the name never butts up against the date
    constexpr int HEADER_GAP = 4;

    const int nameWidth =
        128 - 2 - oled.getStrWidth(stamp.c_str()) - HEADER_GAP;

    char name[24];
    snprintf(name, sizeof(name), "%s", USERNAME.c_str());

    // Trimmed a character at a time, measured rather than assumed, so the name
    // gives way to the timestamp instead of pushing it off the edge. U8g2 drops
    // whatever runs past the panel silently, and it is always the tail that
    // goes - which is how the time came to be invisible before.
    while (name[0] != '\0' && oled.getStrWidth(name) > nameWidth)
        name[strlen(name) - 1] = '\0';

    oled.drawStr(0, 10, name);

    // Back to the body font for everything below the divider
    oled.setFont(u8g2_font_6x12_tr);

    // Divider under the header
    oled.drawHLine(0, 13, 128);

    // Steps
    oled.drawStr(2, 25, "Steps:");
    snprintf(value, sizeof(value), "%lu", (unsigned long)steps);
    DrawValueRight(25, value);

    // Burned Kcal
    oled.drawStr(2, 36, "Burned kcal:");
    snprintf(value, sizeof(value), "%.1f", bruned_kcal);
    DrawValueRight(36, value);

    // Heart rate and blood oxygen share one line
    if (heartRate > 0)
        snprintf(value, sizeof(value), "HR:%u bpm", heartRate);
    else
        snprintf(value, sizeof(value), "HR:-- bpm");

    oled.drawStr(2, 47, value);

    if (bloodOxygen > 0)
        snprintf(value, sizeof(value), "SpO2:%u%%", bloodOxygen);
    else
        snprintf(value, sizeof(value), "SpO2:--%%");

    DrawValueRight(47, value);

    // Divider above the temperature
    oled.drawHLine(0, 51, 128);

    // Temperature
    oled.drawStr(2, 62, "Temp:");
    snprintf(value, sizeof(value), "%.1f C", temperature);
    DrawValueRight(62, value);

    oled.sendBuffer();
}


// Draw a small heart made of two lobes and a point
inline void DrawHeartIcon(int centerX, int centerY, int radius)
{
    oled.drawDisc(centerX - radius + 1, centerY, radius);
    oled.drawDisc(centerX + radius - 1, centerY, radius);

    oled.drawTriangle(
        centerX - (radius * 2) + 1, centerY,
        centerX + (radius * 2) - 1, centerY,
        centerX, centerY + (radius * 2)
    );
}

// Live heart-rate screen, drawn while the sensor runs continuously
inline void DisplayHeartRateScreen(
    uint16_t heartRate,
    uint16_t bloodOxygen,
    float temperature,
    bool fingerDetected)
{
    static unsigned long lastRefreshTime = 0;
    static unsigned long lastPulseTime = 0;
    static bool pulseExpanded = false;

    constexpr unsigned long REFRESH_INTERVAL = 100;
    constexpr unsigned long PULSE_INTERVAL = 400;

    // Keep the I2C bus free between redraws
    if (millis() - lastRefreshTime < REFRESH_INTERVAL)
        return;

    lastRefreshTime = millis();

    // The heart only beats once a reading is coming in
    if (heartRate > 0 && millis() - lastPulseTime >= PULSE_INTERVAL)
    {
        lastPulseTime = millis();
        pulseExpanded = !pulseExpanded;
    }

    char value[20];

    oled.clearBuffer();

    // Header
    oled.setFont(u8g2_font_6x12_tr);

    const char *title = "HEART RATE";
    oled.drawStr((128 - oled.getStrWidth(title)) / 2, 10, title);

    // Divider under the header
    oled.drawHLine(0, 13, 128);

    // Reading, or placeholders until the sensor locks on
    if (heartRate > 0)
        snprintf(value, sizeof(value), "%u", heartRate);
    else
        snprintf(value, sizeof(value), "--");

    oled.setFont(u8g2_font_ncenB14_tr);
    int valueWidth = oled.getStrWidth(value);

    oled.setFont(u8g2_font_6x12_tr);
    int unitWidth = oled.getStrWidth("bpm");

    constexpr int HEART_BLOCK = 20;
    constexpr int GAP = 6;

    int blockWidth = HEART_BLOCK + GAP + valueWidth + 4 + unitWidth;
    int blockX = (128 - blockWidth) / 2;

    if (blockX < 0)
        blockX = 0;

    // Beating heart on the left of the reading
    int radius = (heartRate > 0 && pulseExpanded) ? 5 : 4;
    DrawHeartIcon(blockX + (HEART_BLOCK / 2), 31, radius);

    int valueX = blockX + HEART_BLOCK + GAP;

    oled.setFont(u8g2_font_ncenB14_tr);
    oled.drawStr(valueX, 40, value);

    oled.setFont(u8g2_font_6x12_tr);
    oled.drawStr(valueX + valueWidth + 4, 40, "bpm");

    // Divider above the footer
    oled.drawHLine(0, 48, 128);

    // Prompt while there is nothing on the sensor
    if (!fingerDetected)
    {
        const char *hint = "Place your finger";
        oled.drawStr((128 - oled.getStrWidth(hint)) / 2, 61, hint);

        oled.sendBuffer();
        return;
    }

    // Supporting values once the finger is on the sensor
    if (bloodOxygen > 0)
        snprintf(value, sizeof(value), "SpO2:%u%%", bloodOxygen);
    else
        snprintf(value, sizeof(value), "SpO2:--");

    oled.drawStr(2, 61, value);

    snprintf(value, sizeof(value), "%.1f C", temperature);
    DrawValueRight(61, value);

    oled.sendBuffer();
}


inline void DisplayLoadingScreen(const char *text)
{
    static unsigned long lastAnimationTime = 0;
    static uint8_t animationFrame = 0;

    constexpr unsigned long ANIMATION_INTERVAL = 150;

    if (millis() - lastAnimationTime < ANIMATION_INTERVAL)
        return;

    lastAnimationTime = millis();
    animationFrame++;

    oled.clearBuffer();

    // Title
    oled.setFont(u8g2_font_6x12_tr);
    oled.drawStr(16, 12, "FITNESS");

    // Divider
    oled.drawHLine(0, 15, 128);

    // Animated spinner
    const char spinner[] = {'|', '/', '-', '\\'};

    char spinnerText[2];
    spinnerText[0] = spinner[animationFrame % 4];
    spinnerText[1] = '\0';

    oled.setFont(u8g2_font_ncenB14_tr);

    int spinnerWidth = oled.getStrWidth(spinnerText);
    oled.drawStr(
        (128 - spinnerWidth) / 2,
        35,
        spinnerText
    );

    // Loading message
    oled.setFont(u8g2_font_6x12_tr);

    if (text == nullptr)
        text = "Loading...";

    int textWidth = oled.getStrWidth(text);
    int textX = (128 - textWidth) / 2;

    // Prevent a negative position for long text
    if (textX < 0)
        textX = 0;

    oled.drawStr(textX, 49, text);

    // Progress-bar outline
    oled.drawFrame(14, 54, 100, 8);

    // Animated section inside the progress bar
    const uint8_t barWidth = 22;
    const uint8_t availableWidth = 96 - barWidth;
    uint8_t barPosition =
        (animationFrame * 4) % availableWidth;

    oled.drawBox(
        16 + barPosition,
        56,
        barWidth,
        4
    );

    oled.sendBuffer();
}

#endif