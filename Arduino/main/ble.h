#ifndef BLE_H
#define BLE_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define BLE_DEVICE_NAME "Fitness Tracker V1.0"

#define SERVICE_UUID "12345678-1234-1234-1234-1234567890ab"

// Phone -> tracker (the app writes here)
#define CHARACTERISTIC_RX_UUID "abcdefab-1234-1234-1234-abcdefabcdef"

// Tracker -> phone (the app subscribes here)
#define CHARACTERISTIC_TX_UUID "abcdefab-1234-1234-1234-abcdefabcdf0"

// Incoming commands from the phone are short
constexpr size_t BLE_MESSAGE_SIZE = 64;

// A stats payload carries every sensor value, so it needs more room
constexpr size_t BLE_PAYLOAD_SIZE = 128;

// How often the tracker pushes its stats to the phone. Notifying on every
// sensor sample floods the app, so the sending is paced from loop() instead.
constexpr unsigned long BLE_STATS_INTERVAL = 1000;

// Resend even when nothing changed, so a phone that just subscribed sees data
constexpr unsigned long BLE_STATS_KEEPALIVE = 5000;

inline BLECharacteristic *bleTxCharacteristic = nullptr;
inline bool BLE_CONNECTED = false;

// Written by the BLE task, read by BLEReadMessage() on the main task
inline volatile bool bleMessageWaiting = false;
inline char bleMessageBuffer[BLE_MESSAGE_SIZE] = {0};

// Send a message to the phone
inline void BLESendMessage(const String &message)
{
    if (!BLE_CONNECTED || bleTxCharacteristic == nullptr)
        return;

    
    Serial.println("Message is sent.");

    bleTxCharacteristic->setValue(message.c_str());
    bleTxCharacteristic->notify();
}

// Read the message the phone sent, if there is one.
// Returns false when nothing new has arrived.
inline bool BLEReadMessage(String &message)
{
    if (!bleMessageWaiting)
        return false;

    message = String(bleMessageBuffer);
    bleMessageWaiting = false;

    return true;
}

class BLEConnectionCallbacks : public BLEServerCallbacks
{
    void onConnect(BLEServer *server)
    {
        BLE_CONNECTED = true;
    }

    void onDisconnect(BLEServer *server)
    {
        BLE_CONNECTED = false;

        // Become discoverable again so the app can reconnect
        server->startAdvertising();
    }
};

class BLEReceiveCallbacks : public BLECharacteristicCallbacks
{
    void onWrite(BLECharacteristic *characteristic)
    {
        const char *data = characteristic->getValue().c_str();

        if (data == nullptr || data[0] == '\0')
            return;

        strncpy(bleMessageBuffer, data, BLE_MESSAGE_SIZE - 1);
        bleMessageBuffer[BLE_MESSAGE_SIZE - 1] = '\0';

        bleMessageWaiting = true;

        Serial.print("Received: ");
        Serial.println(bleMessageBuffer);
    }
};

inline void BLEDeviceInit()
{
    BLEDevice::init(BLE_DEVICE_NAME);

    // Bigger than the 23-byte default, so longer messages fit in one packet
    BLEDevice::setMTU(185);

    BLEServer *server = BLEDevice::createServer();
    server->setCallbacks(new BLEConnectionCallbacks());

    BLEService *service = server->createService(SERVICE_UUID);

    // Phone -> tracker
    BLECharacteristic *rxCharacteristic = service->createCharacteristic(
        CHARACTERISTIC_RX_UUID,
        BLECharacteristic::PROPERTY_WRITE |
        BLECharacteristic::PROPERTY_WRITE_NR
    );

    rxCharacteristic->setCallbacks(new BLEReceiveCallbacks());

    // Tracker -> phone
    bleTxCharacteristic = service->createCharacteristic(
        CHARACTERISTIC_TX_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY
    );

    // Required so the app can turn notifications on
    bleTxCharacteristic->addDescriptor(new BLE2902());

    service->start();

    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();

    Serial.println("Bluetooth is on...");
}

#endif
