#ifndef ACCELEROMETE_H
#define ACCELEROMETE_H

#include <Arduino.h>
#include <Wire.h>
#include "movementReader.h"

#define SDA_PIN 21
#define SCL_PIN 22

// ADR connected to GND
#define ADXL313_ADDRESS 0x53

// ADXL313 registers
#define REG_DEVICE_ID   0x00
#define REG_POWER_CTL   0x2D
#define REG_DATA_FORMAT 0x31
#define REG_DATA_X0     0x32

void writeRegister(uint8_t reg, uint8_t value)
{
    Wire.beginTransmission(ADXL313_ADDRESS);
    Wire.write(reg);
    Wire.write(value);
    Wire.endTransmission();
}

uint8_t readRegister(uint8_t reg)
{
    Wire.beginTransmission(ADXL313_ADDRESS);
    Wire.write(reg);
    Wire.endTransmission(false);

    Wire.requestFrom(ADXL313_ADDRESS, 1);

    if (Wire.available())
        return Wire.read();

    return 0;
}

bool readAcceleration(int16_t &x, int16_t &y, int16_t &z)
{
    Wire.beginTransmission(ADXL313_ADDRESS);
    Wire.write(REG_DATA_X0);

    if (Wire.endTransmission(false) != 0)
        return false;

    if (Wire.requestFrom(ADXL313_ADDRESS, 6) != 6)
        return false;

    uint8_t xLow  = Wire.read();
    uint8_t xHigh = Wire.read();
    uint8_t yLow  = Wire.read();
    uint8_t yHigh = Wire.read();
    uint8_t zLow  = Wire.read();
    uint8_t zHigh = Wire.read();

    x = (int16_t)((xHigh << 8) | xLow);
    y = (int16_t)((yHigh << 8) | yLow);
    z = (int16_t)((zHigh << 8) | zLow);

    return true;
}

// Pulse SCL so a child device stuck mid-byte can finish and release SDA
// Common pattern for I2C recovery
// https://github.com/maxritter/diy-thermocam/blob/5e2e0c2ad745dea94ba7dacd359c81b29b52c058/firmware/3.0/lib/Wire/WireKinetis.cpp#L533 as an example.
void recoverI2C()
{
    pinMode(SCL_PIN, OUTPUT);

    for (int i = 0; i < 8; i++)
    {
        digitalWrite(SCL_PIN, HIGH);
        delayMicroseconds(5);
        digitalWrite(SCL_PIN, LOW);
        delayMicroseconds(5);
    }

    pinMode(SCL_PIN, INPUT);

    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setClock(100000);
}

void AccelerometeInit()
{
    delay(1000);

    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setClock(100000);

    Serial.println("Starting ADXL313...");

    uint8_t deviceID = readRegister(REG_DEVICE_ID);

    Serial.print("Device ID: 0x");
    Serial.println(deviceID, HEX);

    // Put sensor in standby before configuration
    writeRegister(REG_POWER_CTL, 0x00);

    // Full-resolution mode, ±4 g range
    writeRegister(REG_DATA_FORMAT, 0x0B);

    // Start measurement mode
    writeRegister(REG_POWER_CTL, 0x08);

    Serial.println("ADXL313 ready");
}

void AccelerometeLoop()
{
    // millis() instead of delay(), so BLE and the display can run between samples
    static unsigned long lastSampleTime = 0;
    static unsigned long lastErrorPrint = 0;

    if (millis() - lastSampleTime < 100)
        return;

    lastSampleTime = millis();

    int16_t x;
    int16_t y;
    int16_t z;

    if (readAcceleration(x, y, z))
    {
        /* Serial.print("X:");
        Serial.print(x);

        Serial.print(",Y:");
        Serial.print(y);

        Serial.print(",Z:");
        Serial.println(z); */

        detectStep(x, y, z);
    }
    // Avoid spamming the serial console, print error only once every 2.5 seconds
    else if (millis() - lastErrorPrint >= 2500)
    {
        lastErrorPrint = millis();
        Serial.println("Failed to read ADXL313");
        recoverI2C();
    }
}

#endif