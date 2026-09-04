#ifndef UPDATE_DATA_H
#define UPDATE_DATA_H

#include <Arduino.h>
#include "sdCard.h"
#include "config.h"
#include "heartRate.h"
#include "ble.h"



void SaveTrackerData(){
  saveTrackerData(
    TIMESTAMP,
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