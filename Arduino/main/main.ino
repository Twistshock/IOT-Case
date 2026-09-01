#include "config.h"
#include "acceleromete.h"
#include "display.h"
#include "heartRate.h"
#include "vibration.h"

void setup() {
    Serial.begin(115200);
    delay(1000);

    DisplayInit();
    AccelerometeInit();
    HeartRateInit();
    VibrationInit();

    ACTIVE_SCREEN = HOME_SCREEN;

    // Initial home-screen values
    DisplayHomeScreen(
        0,      // Steps
        0,      // Heart rate in BPM
        0,      // Blood oxygen in %
        0.0f    // Temperature in Celsius
    );
}


void loop() {
  AccelerometeLoop();
  HeartRateLoop();

  if (ACTIVE_SCREEN == HOME_SCREEN) {
    DisplayHomeScreen(
        STEPS,        // Steps
        HEART_RATE,   // Heart rate in BPM
        BLOOD_OXYGEN, // Blood oxygen in %
        TEMPERATURE   // Temperature in Celsius
    );
  }
  else if (ACTIVE_SCREEN == LOADING_SCREEN) {
    DisplayLoadingScreen("Keep your finger still..");
  }
}
