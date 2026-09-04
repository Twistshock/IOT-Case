#ifndef VIBRATION
#define VIBRATION

#include <Arduino.h>
#include <Wire.h>
#include "Haptic_Driver.h"

#define I2C_SDA 21
#define I2C_SCL 22

Haptic_Driver haptic;

void VibrationInit()
{

    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(100000);

    Serial.println("Starting DA7280...");

    if (!haptic.begin(Wire))
    {
        Serial.println("DA7280 not found!");
        Serial.println("Check address 0x4A and wiring.");

        while (true)
            delay(100);
    }

    Serial.println("DA7280 found!");

    // Configure SparkFun's included LRA motor
    if (!haptic.defaultMotor())
    {
        Serial.println("Motor configuration failed!");
        return;
    }

    // Prevent resonance-tracking errors while testing
    haptic.enableFreqTrack(false);

    // Direct I2C vibration control
    haptic.setOperationMode(DRO_MODE);

    Serial.println("DA7280 ready!");
}

void RunVibration()
{
    constexpr uint8_t intensity = 25;

    // First short pulse
    haptic.setVibrate(intensity);
    delay(120);
    haptic.setVibrate(0);

    delay(80);

    // Second short pulse
    haptic.setVibrate(intensity);
    delay(120);
    haptic.setVibrate(0);

    Serial.println("Notification vibration");
}


#endif
