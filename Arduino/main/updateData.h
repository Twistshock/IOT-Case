#ifndef UPDATE_DATA_H
#define UPDATE_DATA_H

#include <Arduino.h>
#include "sdCard.h"
#include "config.h"
#include "heartRate.h"
#include "ble.h"
#include "timeSync.h"



void SaveTrackerData(){
  // Keep the displayed date in step with the clock, so it rolls over at
  // midnight instead of showing the date of the last phone connect.
  TIMESTAMP = GetDate();

  // Each record gets the moment it was actually taken. Before the phone has
  // synced this is empty rather than a guess - the device cannot know how
  // long it was powered off, so an unstamped record is the honest answer.
  saveTrackerData(
    GetTimestamp(),
    STEPS,
    BURNED_KCAL,
    HEART_RATE,
    BLOOD_OXYGEN,
    TEMPERATURE
  );


  String message = "{\"steps\":" + String(STEPS) + 
    ",\"kcal\":" + String(BURNED_KCAL) +
    ",\"type\":\"tracker_data\"" +
    ",\"bpm\":" + String(LAST_HEART_RATE) +
    ",\"spo2\":" + String(LAST_SPO2) +
    ",\"temp\":" + String(LAST_SENSOR_TEMPERATURE, 1) +
    "}";

  BLESendMessage(message);

  Serial.println("Saving tracker data to SD card...");
}


#endif