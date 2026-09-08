#ifndef MESSAGE_HANDLER_H
#define MESSAGE_HANDLER_H


#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "heartRate.h"
#include "ble.h"
#include "sdCard.h"
#include "timeSync.h"

// The message types the phone can send in the "type" field
enum MessageType
{
  MESSAGE_UNKNOWN,
  MESSAGE_DEVICE_CONNECTED,
  MESSAGE_DASHBROAD_DATA,
  MESSAGE_CLEAN_TRACKER_LOG,
};

// C++ can't switch on a string, so the "type" field is turned into an enum first
inline MessageType ParseMessageType(const char *dataType)
{
  if (strcmp(dataType, "device_connected") == 0)
      return MESSAGE_DEVICE_CONNECTED;
  
  if (strcmp(dataType, "fetch_dashbroad") == 0)
      return MESSAGE_DASHBROAD_DATA;

  if (strcmp(dataType, "clean_tracker_log") == 0)
      return MESSAGE_CLEAN_TRACKER_LOG;


  return MESSAGE_UNKNOWN;
}

// The phone asked us to sync. It brings the only clock the tracker has, so
// this is where time starts running again after a power loss.
inline void HandleaSyncDevice(JsonDocument &doc)
{
  const char *username = doc["username"] | "";

  // Unix epoch in seconds, UTC
  time_t epoch = doc["epoch"] | 0;

  // Assigning to a String copies the text. Keeping the const char* would
  // leave USERNAME dangling as soon as doc goes out of scope.
  USERNAME = username;

  if (SaveTime(epoch))
  {
      // Read back from the clock instead of the payload, so the date keeps
      // up on its own instead of freezing at the moment of the last connect.
      TIMESTAMP = GetDateTime();

      saveUserData(username, GetTimestamp());

      // Today's date is only known now, so today's record can finally be
      // found. Without this the next timed save would overwrite it with the
      // counters that have been running from zero since the reboot.
      readTrackerData();

      // The date has only just become known, so this is the first moment the
      // card can be sorted into "today" and "older" - and the moment the app
      // is about to start expecting the older days to arrive.
      checkOldData();

      Serial.printf(
          "sync data with username: %s at %s\n",
          username,
          GetTimestamp().c_str()
      );

      return;
  }
  
  // No usable time. Keep the username anyway - it used to be dropped along
  // with the timestamp, which lost the account for no reason.
  saveUserData(username, GetTimestamp());

  Serial.printf(
      "sync data with username: %s, but no usable time was sent\n",
      username
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


void HandleCleanTrackerLog(JsonDocument &doc){
  //deleteOldData();
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
        Serial.println("fetch_dashbroad");
        HandleFetchDashbroad(doc);
        break;

      case MESSAGE_CLEAN_TRACKER_LOG:
        Serial.println("clean_tracker_log");
        HandleCleanTrackerLog(doc);
        break;

      case MESSAGE_UNKNOWN:
      default:
        Serial.printf("Unknown message type: %s\n", dataType);
        break;
  }
}

#endif
