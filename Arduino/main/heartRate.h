#ifndef HEART_RATE_H
#define HEART_RATE_H

#include <Arduino.h>
#include <Wire.h>
#include "DFRobot_BloodOxygen_S.h"

#include "display.h"
#include "config.h"
#include "vibration.h"

#define HEART_SDA 16
#define HEART_SCL 17
#define MAX30102_ADDRESS 0x57


inline uint16_t HEART_RATE = 0;
inline float TEMPERATURE = 0.0f;
inline uint16_t BLOOD_OXYGEN = 0;

inline TwoWire HeartRateWire = TwoWire(1);

inline DFRobot_BloodOxygen_S_I2C MAX30102(
    &HeartRateWire,
    MAX30102_ADDRESS
);

inline unsigned long lastHeartRateCheck = 0;
inline bool fingerWasDetected = false;
inline bool HEART_RATE_READY = false;

inline int LAST_HEART_RATE = 0;
inline int LAST_SPO2 = 0;
inline float LAST_SENSOR_TEMPERATURE = 0.0f;

constexpr unsigned long HEART_RATE_INTERVAL = 4000;

inline void HeartRateInit()
{
    Serial.println("Starting MAX30102 on Wire1...");

    // Start the second I2C bus using custom pins
    HeartRateWire.begin(HEART_SDA, HEART_SCL);
    HeartRateWire.setClock(100000);

    delay(100);

    // Check address 0x57 directly
    HeartRateWire.beginTransmission(MAX30102_ADDRESS);
    uint8_t error = HeartRateWire.endTransmission();

    if (error != 0)
    {
        Serial.print("MAX30102 not found. I2C error: ");
        Serial.println(error);

        HEART_RATE_READY = false;
        return;
    }

    Serial.println("MAX30102 detected at 0x57!");

    // Do not call MAX30102.begin() here
    MAX30102.sensorStartCollect();

    HEART_RATE_READY = true;
    lastHeartRateCheck = millis();

    Serial.println("MAX30102 collection started!");
    Serial.println("Place your fingertip on the sensor.");
}

inline bool IsValidHeartRateReading(int heartRate, int spo2)
{
    return heartRate >= 30 &&
           heartRate <= 220 &&
           spo2 >= 70 &&
           spo2 <= 100;
}

inline void HeartRateLoop()
{
    if (!HEART_RATE_READY)
        return;

    if (millis() - lastHeartRateCheck <
        HEART_RATE_INTERVAL)
    {
        return;
    }

    lastHeartRateCheck = millis();

    MAX30102.getHeartbeatSPO2();

    int heartRate =
        MAX30102._sHeartbeatSPO2.Heartbeat;

    int spo2 =
        MAX30102._sHeartbeatSPO2.SPO2;

    // No data at all: assume there is no finger on the sensor
    if (heartRate <= 0 && spo2 <= 0)
    {
        fingerWasDetected = false;
        return;
    }

    // Something is on the sensor from here on
    fingerWasDetected = true;

    // Data is arriving but the measurement is not usable yet
    if (!IsValidHeartRateReading(heartRate, spo2))
    {
        ACTIVE_SCREEN = LOADING_SCREEN;

        Serial.println(
            "Measuring... Keep your finger still."
        );
        return;
    }

    // Both results are ready and within range
    LAST_HEART_RATE = heartRate;
    LAST_SPO2 = spo2;

    float temperature =
        MAX30102.getTemperature_C();

    if (temperature >= -20.0f &&
        temperature <= 100.0f)
    {
        LAST_SENSOR_TEMPERATURE = temperature;
        TEMPERATURE = temperature;
    }

    HEART_RATE = (uint16_t)heartRate;
    BLOOD_OXYGEN = (uint16_t)spo2;

    // Measurement finished
    ACTIVE_SCREEN = HOME_SCREEN;

    Serial.println("----------------");

    Serial.print("Heart rate: ");
    Serial.print(LAST_HEART_RATE);
    Serial.println(" BPM");

    Serial.print("SpO2: ");
    Serial.print(LAST_SPO2);
    Serial.println(" %");

    Serial.print("Temperature: ");
    Serial.print(LAST_SENSOR_TEMPERATURE, 1);
    Serial.println(" C");

    RunVibration();
}

inline bool IsFingerDetected()
{
    return fingerWasDetected;
}

#endif