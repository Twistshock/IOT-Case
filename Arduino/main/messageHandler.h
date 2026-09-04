#ifndef MESSAGE_HANDLER_H
#define MESSAGE_HANDLER_H


#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "heartRate.h"
#include "ble.h"

// The message types the phone can send in the "type" field
enum MessageType
{
  MESSAGE_UNKNOWN,
  MESSAGE_DEVICE_CONNECTED,
  MESSAGE_DASHBROAD_DATA,
};

// C++ can't switch on a string, so the "type" field is turned into an enum first
inline MessageType ParseMessageType(const char *dataType)
{
  if (strcmp(dataType, "device_connected") == 0)
      return MESSAGE_DEVICE_CONNECTED;
  
  if (strcmp(dataType, "fetch_dashbroad") == 0)
      return MESSAGE_DASHBROAD_DATA;


  return MESSAGE_UNKNOWN;
}

// The phone asked us to sync; pick the account out of the payload
inline void HandleaSyncDevice(JsonDocument &doc)
{
  const char *username = doc["username"] | "";

  const char *timestamp = doc["timestamp"] | "";

  // "2026-09-02T10:20:28.324Z" -> "02/09/2026", dropping the time.
  // %.Ns copies exactly N characters, so each piece can be read straight
  // out of the middle of the ISO string without cutting it up first.
  if (strlen(timestamp) >= 10)
  {
      char date[11];

      snprintf(
          date, sizeof(date), "%.2s/%.2s/%.4s",
          timestamp + 8,  // day
          timestamp + 5,  // month
          timestamp       // year
      );

      // Assigning to a String copies the text. Keeping the const char*
      // would leave TIMESTAMP dangling as soon as doc goes out of scope.
      TIMESTAMP = date;
      USERNAME = username;
  }

  Serial.printf(
      "sync data with username: %s on %s\n",
      username,
      TIMESTAMP.c_str()
  );
}


// The phone asked for the current step count; answer with a stats payload
inline void HandleFetchDashbroad(JsonDocument &doc)
{
  Serial.println("handle get Dashbroad data..");

  String message = "{\"steps\":" + String(STEPS) +
      ",\"kcal\":" + String(BURNED_KCAL) +
      ",\"bpm\":" + String(LAST_HEART_RATE) +
      ",\"spo2\":" + String(LAST_SPO2) +
      ",\"temp\":" + String(LAST_SENSOR_TEMPERATURE, 1) +
      ",\"type\":\"steps\""
      "}";

  BLESendMessage(message);
}

// Parse one JSON message from the phone and dispatch on its "type" field
inline void messageHandler(const char *data)
{
  JsonDocument doc;

  DeserializationError error = deserializeJson(doc, data);

  if (error)
  {
      Serial.print("JSON parsing failed: ");
      Serial.println("Raw data: ");
      Serial.println(data);
      Serial.println(error.c_str());
      return;
  }

  const char *dataType = doc["type"] | "";

  switch (ParseMessageType(dataType))
  {
      case MESSAGE_DEVICE_CONNECTED:
        Serial.println("device_connected");
        HandleaSyncDevice(doc);
        break;
      
      case MESSAGE_DASHBROAD_DATA:
        Serial.println("get_steps");
        HandleFetchDashbroad(doc);
        break;

      case MESSAGE_UNKNOWN:
      default:
        Serial.printf("Unknown message type: %s\n", dataType);
        break;
  }
}

#endif
