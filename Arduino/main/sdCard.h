#ifndef SDCARD_H
#define SDCARD_H

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <ArduinoJson.h>

#include "config.h"

#define SD_CS   5
#define SD_SCK  18
#define SD_MISO 19
#define SD_MOSI 23

SPIClass sdSPI(VSPI);

const char* USER_FILE_PATH = "/user.json";
const char* TRACKER_FILE_PATH = "/tracker.json";

// =====================================================
// USER FILE
// =====================================================

bool saveUserData(
    const String& username,
    const String& timestamp
)
{
    JsonDocument json;

    json["username"] = username;
    json["timestamp"] = timestamp;

    File file = SD.open(USER_FILE_PATH, FILE_WRITE);

    if (!file)
    {
        Serial.println("Failed to open user.json for writing");
        return false;
    }

    bool success = serializeJsonPretty(json, file) > 0;
    file.close();

    if (success)
    {
        Serial.println("User data saved");
    }
    else
    {
        Serial.println("Failed to save user data");
    }

    return success;
}

bool readUserData(
    String& username,
    String& timestamp
)
{
    File file = SD.open(USER_FILE_PATH, FILE_READ);

    if (!file)
    {
        Serial.println("user.json does not exist");
        return false;
    }

    JsonDocument json;
    DeserializationError error = deserializeJson(json, file);

    file.close();

    if (error)
    {
        Serial.print("User JSON error: ");
        Serial.println(error.c_str());
        return false;
    }

    username = json["username"] | "";
    timestamp = json["timestamp"] | "";

    Serial.println("User data:");
    Serial.print("Username: ");
    Serial.println(username);
    Serial.print("Timestamp: ");
    Serial.println(timestamp);

    TIMESTAMP = timestamp;
    USERNAME = username;

    return true;
}

// =====================================================
// TRACKER FILE
// =====================================================

bool saveTrackerData(
    const String& timestamp,
    uint32_t steps,
    float kcal,
    int heartRate,
    float spo2,
    float temperature
)
{
    JsonDocument json;

    json["timestamp"] = timestamp;
    json["steps"] = steps;
    json["kcal"] = kcal;
    json["heart_rate"] = heartRate;
    json["spo2"] = spo2;
    json["temperature"] = temperature;

    File file = SD.open(TRACKER_FILE_PATH, FILE_WRITE);

    if (!file)
    {
        Serial.println("Failed to open tracker.json for writing");
        return false;
    }

    bool success = serializeJsonPretty(json, file) > 0;
    file.close();

    if (success)
    {
        Serial.println("Tracker data saved");
    }
    else
    {
        Serial.println("Failed to save tracker data");
    }

    return success;
}

bool readTrackerData(
    String& timestamp,
    uint32_t& steps,
    float& kcal,
    int& heartRate,
    float& spo2,
    float& temperature
)
{
    File file = SD.open(TRACKER_FILE_PATH, FILE_READ);

    if (!file)
    {
        Serial.println("tracker.json does not exist");
        return false;
    }

    JsonDocument json;
    DeserializationError error = deserializeJson(json, file);

    file.close();

    if (error)
    {
        Serial.print("Tracker JSON error: ");
        Serial.println(error.c_str());
        return false;
    }

    timestamp = json["timestamp"] | "";
    steps = json["steps"] | 0;
    kcal = json["kcal"] | 0.0;
    heartRate = json["heart_rate"] | 0;
    spo2 = json["spo2"] | 0.0;
    temperature = json["temperature"] | 0.0;

    Serial.println("Tracker data:");
    Serial.print("Timestamp: ");
    Serial.println(timestamp);
    Serial.print("Steps: ");
    Serial.println(steps);
    Serial.print("Kcal: ");
    Serial.println(kcal, 2);
    Serial.print("Heart rate: ");
    Serial.println(heartRate);
    Serial.print("SpO2: ");
    Serial.println(spo2, 1);
    Serial.print("Temperature: ");
    Serial.println(temperature, 1);


    STEPS = steps;
    BURNED_KCAL = kcal;
    HEART_RATE = heartRate;
    BLOOD_OXYGEN = spo2;
    TEMPERATURE = temperature;

    return true;
}

// =====================================================
// CREATE FILES IF MISSING
// =====================================================

void createFilesIfMissing()
{
    if (!SD.exists(USER_FILE_PATH))
    {
        Serial.println("Creating user.json...");
        saveUserData("", "");
    }
    else
    {
        Serial.println("user.json already exists");
    }

    if (!SD.exists(TRACKER_FILE_PATH))
    {
        Serial.println("Creating tracker.json...");

        saveTrackerData(
            "--/--/--",   // Timestamp
            0,    // Steps
            0.0,  // Kcal
            0,    // Heart rate
            0.0,  // SpO2
            0.0   // Temperature
        );
    }
    else
    {
        Serial.println("tracker.json already exists");
    }
}

void SdCardSetup()
{
    sdSPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);

    if (!SD.begin(SD_CS, sdSPI, 1000000))
    {
        Serial.println("SD card initialization failed");
        return;
    }

    Serial.println("SD card ready");

    createFilesIfMissing();
    // Variables receiving data from the files
    String username;
    String userTimestamp;

    String trackerTimestamp;
    uint32_t steps;
    float kcal;
    int heartRate;
    float spo2;
    float temperature;

    readUserData(username, userTimestamp);

    readTrackerData(
        trackerTimestamp,
        steps,
        kcal,
        heartRate,
        spo2,
        temperature
    );
}



#endif
