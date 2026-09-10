#ifndef RTC_H
#define RTC_H

#include <Wire.h>
#include <RTClib.h>

RTC_PCF8523 rtc;

void RTCSetup()
{
  Wire.begin(21, 22);

  if (!rtc.begin()) {
    Serial.println("PCF8523 not found!");
    while (true) {
      delay(1000);
    }
  }

  if (!rtc.initialized() || rtc.lostPower()) {
    // Deliberately not set to __DATE__/__TIME__ here. That is the moment the
    // sketch was compiled, baked into the binary - so every power loss would
    // restore the same stale time, and it would look real enough to pass every
    // sanity check downstream. Tracker records are filed under a day, so a
    // fabricated day quietly corrupts the history.
    //
    // The time stays unknown until the phone sends a real one, and SaveTime()
    // in timeSync.h writes it here. Writing the seconds register clears the
    // oscillator-stop flag, so lostPower() goes false at that point.
    Serial.println("RTC has lost power, waiting for the phone to set the time");
  }

  // Make sure the RTC is running
  rtc.start();

  Serial.println("PCF8523 is ready.");
}

#endif