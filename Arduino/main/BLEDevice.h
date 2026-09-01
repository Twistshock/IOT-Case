#ifndef BLEDevice_H
#define BLEDevice_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>


#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcdefab-1234-1234-1234-abcdefabcdef"

class MyCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String data = pCharacteristic->getValue();

        Serial.print("Received: ");
        Serial.println(data);
    }
};

void BLEDeviceInit() {
    BLEDevice::init("Fitness Tracker V1.0");

    BLEServer *server = BLEDevice::createServer();

    BLEService *service = server->createService(SERVICE_UUID);

    BLECharacteristic *characteristic = service->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_WRITE
    );

    characteristic->setCallbacks(new MyCallbacks());

    service->start();

    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->start();

    Serial.println("Bluetooth is on...");
}


#endif