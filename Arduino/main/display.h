#ifndef DISPLAY_H
#define DISPLAY_H

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h> // installed U8g2

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
    Wire.setClock(400000);

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
inline void DisplayHomeScreen(
    uint32_t steps,
    uint16_t heartRate,
    uint16_t bloodOxygen,
    float temperature)
{
    char value[20];

    oled.clearBuffer();

    // Header
    oled.setFont(u8g2_font_6x12_tr);
    oled.drawStr(0, 10, "FITNESS 31-8-26");

    // Divider under the header
    oled.drawHLine(0, 13, 128);

    // Steps
    oled.drawStr(2, 27, "Steps:");
    snprintf(value, sizeof(value), "%lu", (unsigned long)steps);
    DrawValueRight(27, value);

    // Heart rate
    oled.drawStr(2, 39, "Heart:");
    snprintf(value, sizeof(value), "%u bpm", heartRate);
    DrawValueRight(39, value);

    // Blood oxygen saturation
    oled.drawStr(2, 51, "SpO2:");
    snprintf(value, sizeof(value), "%u %%", bloodOxygen);
    DrawValueRight(51, value);

    // Temperature
    oled.drawStr(2, 63, "Temp:");
    snprintf(value, sizeof(value), "%.1f C", temperature);
    DrawValueRight(63, value);

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
    oled.drawStr(16, 12, "FITNESS 31-8-26");

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