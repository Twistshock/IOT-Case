#include "config.h"
#include "acceleromete.h"
#include "display.h"
#include "heartRate.h"
#include "vibration.h"
#include "ble.h"
#include "messageHandler.h"
#include "sdCard.h"
#include "multiTask.h"

void setup() {
    Serial.begin(115200);
    delay(1000);

    DisplayInit();
    AccelerometeInit();
    HeartRateInit();
    VibrationInit();
    BLEDeviceInit();
    MultitaskInit();
    SdCardSetup();

    ACTIVE_SCREEN = HOME_SCREEN;

    // Initial home-screen values
    DisplayHomeScreen(
        0,      // Steps
        0.0f,   // Burned kcal
        0,      // Heart rate in bpm
        0,      // SpO2 percentage
        0.0f    // Temperature in Celsius
    );
}


void loop() {
  AccelerometeLoop();
  HeartRateLoop();

  // Messages arrive on the BLE task; they are parsed here instead so the
  // handlers touch Serial, the display and the globals from one task only.
  String incoming;

  if (BLEReadMessage(incoming))
      messageHandler(incoming.c_str());

  if (ACTIVE_SCREEN == HOME_SCREEN) {
    DisplayHomeScreen(
        STEPS,         // Steps
        BURNED_KCAL,   // Burned kcal
        HEART_RATE,    // Heart rate in bpm
        BLOOD_OXYGEN,  // SpO2 percentage
        TEMPERATURE    // Temperature in Celsius
    );
  }
  else if (ACTIVE_SCREEN == LOADING_SCREEN) {
    DisplayLoadingScreen("Keep your finger still..");
  }
  else if (ACTIVE_SCREEN == HEART_RATE_SCREEN) {
    DisplayHeartRateScreen(
        HEART_RATE,     // Beats per minute
        BLOOD_OXYGEN,   // SpO2 percentage
        TEMPERATURE,    // Temperature in Celsius
        IsFingerDetected()
    );
  }
}
